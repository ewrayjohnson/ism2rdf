import { readFile } from 'fs/promises';
import path from 'path';
import xml2js from 'xml2js';
import { validateXML } from 'xmllint-wasm';
import rdf from '@rdfjs/data-model';
import type { BlankNode, Quad } from '@rdfjs/types';
import { UriMapping } from './uri-mapping.js';

const TETRAGRAPH_NS = 'urn:us:gov:ic:taxonomy:catt:tetragraph';
const XSD_NS = 'http://www.w3.org/2001/XMLSchema';
type XmlNode = { [key: string]: unknown; $ns?: { uri: string; local: string }; $?: Record<string, { value: string; uri?: string; local?: string }>; _?: string };
const children = (node: XmlNode, namespace: string, local: string): XmlNode[] =>
  Object.values(node).filter((value): value is XmlNode[] => Array.isArray(value)).flat().filter(child =>
    child?.$ns?.uri === namespace && child.$ns.local === local);

/** Validate using the local schema graph in Node's WebAssembly runtime. */
export async function taxonomyRdf(xml: string, schemaPath: string, mapping: UriMapping, options: { compact?: boolean } = {}): Promise<{ quads: Quad[]; namespaces: Record<string, string>; datePredicates: string[] }> {
  if (/<!DOCTYPE/i.test(xml)) throw new Error('Invalid tetragraph XML: DOCTYPE is not supported');
  const files = new Map<string, { fileName: string; contents: string }>();
  const loadSchema = async (file: string): Promise<void> => {
    file = path.resolve(file);
    if (files.has(file)) return;
    const contents = await readFile(file, 'utf8');
    if (/<!DOCTYPE/i.test(contents)) throw new Error('DOCTYPE is not supported in membership schemas');
    // Preserve the directory hierarchy for relative xs:import/xs:include paths.
    const fileName = 'schemas/' + file.replaceAll('\\', '/').replaceAll(':', '_').replace(/^\/+/, '');
    files.set(file, { fileName, contents });
    const parsed = await xml2js.parseStringPromise(contents, { xmlns: true });
    const root = Object.values(parsed)[0] as XmlNode;
    for (const local of ['import', 'include', 'redefine']) {
      for (const dependency of children(root, XSD_NS, local)) {
        const location = dependency.$?.schemaLocation?.value;
        if (!location) continue;
        if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(location) || path.isAbsolute(location)) {
          throw new Error('Membership schema dependencies must use relative local paths: ' + location);
        }
        await loadSchema(path.resolve(path.dirname(file), location));
      }
    }
  };
  await loadSchema(schemaPath);
  const [schema, ...preload] = files.values();
  const result = await validateXML({
    xml: [{ fileName: 'memberships.xml', contents: xml }],
    schema: [schema],
    preload,
    maxMemoryPages: 4096,
  });
  if (!result.valid) throw new Error('Invalid tetragraph XML: ' + result.errors.map(error => error.message).join('\n'));

  const parsed = await xml2js.parseStringPromise(xml, { xmlns: true });
  const root = Object.values(parsed)[0] as XmlNode;
  if (root.$ns?.uri !== TETRAGRAPH_NS || root.$ns.local !== 'Tetragraphs') {
    throw new Error('Invalid tetragraph XML: expected Tetragraphs root');
  }
  const groups = new Set<string>();
  const token = (node: XmlNode) => (node._ ?? '').trim().replace(/\s+/g, ' ');
  for (const entry of children(root, TETRAGRAPH_NS, 'Tetragraph')) {
    const group = token(children(entry, TETRAGRAPH_NS, 'TetraToken')[0]);
    if (groups.has(group)) throw new Error('Duplicate tetragraph entry: ' + group);
    groups.add(group);
  }
  const quads: Quad[] = [];
  const namespaces: Record<string, string> = {};
  const dates = new Set<string>();
  const textTypes = new Set<string>();
  const elementTypes = new Map<string, string>();
  // Derive date-attribute typing from the validated schema, not field-name guesses.
  for (const source of files.values()) {
    const schemaRoot = Object.values(await xml2js.parseStringPromise(source.contents, { xmlns: true }))[0] as XmlNode;
    const ns = schemaRoot.$?.targetNamespace?.value;
    const visitSchema = (node: XmlNode) => {
      const type = node.$?.type?.value;
      const name = node.$?.name?.value;
      const prefix = type?.split(':')[0];
      if (ns && name) {
        const key = ns + '#' + name;
        if (node.$ns?.local === 'simpleType' || node.$ns?.local === 'complexType' && children(node, XSD_NS, 'simpleContent').length) textTypes.add(key);
        if (node.$ns?.local === 'element' && type) {
          const typeNs = schemaRoot.$?.[type.includes(':') ? 'xmlns:' + prefix : 'xmlns']?.value ?? ns;
          elementTypes.set(key, typeNs + '#' + type.split(':').pop());
        }
      }
      if (ns && node.$ns?.local === 'attribute' && name && type?.endsWith(':date') &&
          schemaRoot.$?.['xmlns:' + prefix]?.value === XSD_NS) dates.add(mapping.namespace(ns + '#') + name);
      for (const child of Object.values(node).filter(Array.isArray).flat()) visitSchema(child);
    };
    visitSchema(schemaRoot);
  }
  const term = (ns: string, local: string) => mapping.namespace(ns.endsWith('#') || ns.endsWith('/') ? ns : ns + '#') + local;
  const textValue = (node: XmlNode): string | undefined => {
    if (node._ !== undefined) return node._;
    const type = elementTypes.get(node.$ns!.uri + '#' + node.$ns!.local);
    return type && (textTypes.has(type) || type === XSD_NS + '#string') ? '' : undefined;
  };
  let nextNode = 0;
  // Document-local labels, not record identities or update keys.
  const blank = () => rdf.blankNode('taxonomyInstance' + nextNode++);
  const emit = (subject: BlankNode, predicate: string, object: ReturnType<typeof rdf.literal> | ReturnType<typeof rdf.namedNode> | BlankNode) =>
    quads.push(rdf.quad(subject, rdf.namedNode(predicate), object));
  const walk = (node: XmlNode, id: BlankNode) => {
    const ns = node.$ns!.uri;
    emit(id, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', rdf.namedNode(term(ns, node.$ns!.local)));
    for (const [name, attr] of Object.entries(node.$ ?? {})) {
      if (name === 'xmlns' || name.startsWith('xmlns:')) {
        const prefix = name === 'xmlns' ? 'xmlsource' : name.slice(6);
        namespaces[attr.value.endsWith('#') || attr.value.endsWith('/') ? attr.value : attr.value + '#'] = prefix;
        continue;
      }
      const predicate = term(attr.uri || ns, attr.local || name);
      emit(id, predicate, dates.has(predicate) ? rdf.literal(attr.value, rdf.namedNode(XSD_NS + '#date')) : rdf.literal(attr.value));
    }
    const value = textValue(node);
    if (value !== undefined) emit(id, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value', rdf.literal(value));
    for (const values of Object.values(node).filter(Array.isArray)) {
      values.forEach((child: XmlNode) => {
        const predicate = term(child.$ns!.uri, child.$ns!.local);
        const nested = Object.values(child).some(Array.isArray);
        const attributes = Object.keys(child.$ ?? {}).filter(key => key !== 'xmlns' && !key.startsWith('xmlns:'));
        const value = textValue(child);
        if (!nested && !attributes.length && value !== undefined) {
          emit(id, predicate, rdf.literal(value));
          return;
        }
        const childId = blank();
        emit(id, predicate, childId);
        walk(child, childId);
      });
    }
  };
  walk(root, blank());
  // Compact the RDF after XML validation.
  // Count every ISM predicate on this subject, including child-element properties.
  const ism = mapping.namespace('urn:us:gov:ic:ism#');
  const markings = new Map<string, Quad[]>();
  for (const quad of quads) {
    if (quad.predicate.value.startsWith(ism)) {
      const properties = markings.get(quad.subject.value) ?? [];
      properties.push(quad);
      markings.set(quad.subject.value, properties);
    }
  }
  const omitted = new Set<Quad>();
  if (options.compact !== false) {
    for (const properties of markings.values()) {
      if (properties.length === 2 &&
          properties.some(q => q.predicate.value === ism + 'classification' && q.object.termType === 'Literal' && q.object.value === 'U') &&
          properties.some(q => q.predicate.value === ism + 'ownerProducer' && q.object.termType === 'Literal' && q.object.value === 'USA')) {
        properties.forEach(q => omitted.add(q));
      }
    }
  }
  let output = quads.filter(q => !omitted.has(q));
  if (options.compact !== false) {
    const properties = new Map<string, Quad[]>();
    const parents = new Map<string, Quad[]>();
    for (const quad of output) {
      properties.set(quad.subject.value, [...(properties.get(quad.subject.value) ?? []), quad]);
      if (quad.object.termType === 'BlankNode') parents.set(quad.object.value, [...(parents.get(quad.object.value) ?? []), quad]);
    }
    const replacements = new Map<Quad, Quad>();
    for (const [id, fields] of properties) {
      const links = parents.get(id) ?? [];
      if (fields.length !== 2 || links.length !== 1) continue;
      const type = fields.find(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      const value = fields.find(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value');
      if (!type || !value || value.object.termType !== 'Literal' || !type.object.equals(links[0].predicate)) continue;
      // The parent predicate already identifies this metadata-free text element.
      fields.forEach(q => omitted.add(q));
      replacements.set(links[0], rdf.quad(links[0].subject, links[0].predicate, value.object));
    }
    output = output.filter(q => !omitted.has(q)).map(q => replacements.get(q) ?? q);
  }
  return { quads: output, namespaces, datePredicates: [...dates] };
}
