import fs from 'fs';
import path from 'path';
const _ = require('lodash');
const jsonld = require('jsonld');
const ldtr = require('ldtr');
const { Parser, Writer } = require('n3');
const { Graph, /* Rdfs, print,*/ namespaces, converters, utils } = require('@entryscape/rdfjson');
const xml2js = require('xml2js');

const XML_SCHEMA_URI = 'http://www.w3.org/2001/XMLSchema';
const RDF_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL_URI = 'http://www.w3.org/2002/07/owl#';
const RDFS_URI = 'http://www.w3.org/2000/01/rdf-schema#';
const NQUADS_FORMAT = 'application/n-quads';
const TURTLE_FORMAT = 'text/turtle';
const XSD_EXTENSION = '.xsd';
const INPUT_DIR = '.ciartifacts';
const SCHEMAS_DIR = 'schemas';
const RDF_TYPE = 'rdf:type';

type Import = {
  namespace: string;
  schemaLocation: string;
}


(async () => {
  // const filename = require('path').resolve(__dirname, '../.ciartifacts/config/defaultPrefixes.json');
  const defaultPrefixes = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'config', 'defaultPrefixes.json'), 'utf8'));
  for (const [prefix, iri] of Object.entries(defaultPrefixes)) {
    namespaces.add(prefix, iri);
  }

  const processed = new Set<string>;

  const schemasDir = path.join(INPUT_DIR, SCHEMAS_DIR);
  await input(path.join(schemasDir, 'ISMCAT', 'Tetragraph' + XSD_EXTENSION), processed);
  await input(path.join(schemasDir, 'IC-EDH', 'IC-EDH' + XSD_EXTENSION), processed);

  for (const aProcessed of processed) {
    const dir = path.dirname(aProcessed);
    for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(XSD_EXTENSION))) {
      await input(path.join(dir, f), processed);
    }
  }

  console.log(processed);

  async function input(inputFilepath: string, processed: Set<string>) {
    const g = new Graph({});
    const ontologyUri = 'urn:us:gov:ic' + inputFilepath.substring(0, inputFilepath.lastIndexOf('.xsd')).
      substring(schemasDir.length).replaceAll(path.sep, ':');
    console.log(schemasDir);
    g.add(ontologyUri, RDF_TYPE, 'owl:Ontology');
    const inNamespaces: { [key: string]: string } = {};
    inputFilepath = path.normalize(inputFilepath);
    if (!processed.has(inputFilepath)) {
      processed.add(inputFilepath);
      const text = fs.readFileSync(inputFilepath, 'utf8');
      const json = await xml2js.parseStringPromise(text);
      for (const entry of Object.entries(json)) {
        if (entry[0].endsWith(':schema')) {
          const schema: any = entry[1];
          const $ = schema.$;
          Object.entries($);
          let defaultNs = $.targetNamespace + '#';
          Object.assign(inNamespaces, (Object.entries($) as [string, string][]).reduce((acc: { [key: string]: string }, e) => {
            if (e[0].startsWith('xmlns:')) {
              let ns: string = e[1];
              if (ns.startsWith('urn:')) {
                ns += '#';
              }
              acc[ns] = (e[0] as string).split(':')[1];
            }
            else if (!defaultNs && e[0].startsWith('xmlns')) {
              defaultNs = e[1] as string;
            }
            return acc;
          }, {}));

          const defaultPrefixes: { [key: string]: string } = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'config', 'defaultPrefixes.json'), 'utf8'));
          for (const [prefix, iri] of Object.entries(defaultPrefixes)) {
            inNamespaces[iri] = prefix;
          }

          for (const [iri, prefix] of Object.entries(inNamespaces)) {
            namespaces.add(prefix, iri);
          }
          // const defaultPrefix = defaultNs && inNamespaces[defaultNs];
          const idPrefix = /*defaultPrefix ? `${defaultPrefix}:` : */`${defaultNs}`;
          const xsdPrefix = inNamespaces[XML_SCHEMA_URI];
          inNamespaces['http://www.w3.org/2001/XMLSchema#'] = xsdPrefix;
          if (xsdPrefix) {
            const elements = schema[`${xsdPrefix}:element`];
            if (elements) {
              // debugger;
            }
            const attributes = schema[`${xsdPrefix}:attribute`];
            if (attributes) {
              for (const anAttribute of attributes) {
                if (anAttribute) {
                  const $ = anAttribute.$;
                  if ($) {
                    const attributeName = $.name;
                    let attributeType = $.type;
                    if (attributeType) {
                      if (attributeName) {
                        const attributeId = `${idPrefix}${attributeName}`;
                        // g.add(attributeId, 'rdf:Property', 'rdf:Property');
                        g.add(attributeId, RDF_TYPE, 'rdf:Property')
                        inNamespaces[OWL_URI] = 'owl';
                        inNamespaces[RDFS_URI] = 'rdfs';
                        inNamespaces[RDF_URI] = 'rdf';
                        if (attributeType.startsWith(`${xsdPrefix}:`)) {
                          namespaces.add(xsdPrefix, 'http://www.w3.org/2001/XMLSchema#');
                          g.add(attributeId, RDF_TYPE, 'owl:DatatypeProperty');
                        }
                        else {
                          attributeType += 'Values';
                          g.add(attributeId, RDF_TYPE, 'rdf:Property');
                        }
                        g.add(attributeId, 'rdfs:range', `${attributeType}`);
                        const documentation = anAttribute[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                        if (documentation) {
                          for (const aComment of (Array.isArray(documentation) ? documentation : [documentation])) {
                            const comment = removeWhitespace(aComment);
                            g.addL(attributeId, 'rdfs:comment', comment);
                          }
                        }
                      }
                    } else {
                      // debugger;
                    }
                  }
                } else {
                  debugger;
                }
              }
            }
            const imports = schema[`${xsdPrefix}:import`];
            if (imports) {
              const all = imports.map((e: any) => e.$ as Import);
              const dirname = path.dirname(inputFilepath);
              for (const importSpec of all) {
                const importPath: string = path.join(dirname, importSpec.schemaLocation);
                const [importedGraph, importedNamespaces] = await input(importPath, processed);
                Object.assign(inNamespaces, importedNamespaces);
                g.addAll(importedGraph);
              }
            }

            let schemeId = undefined, listSource = undefined, enumSource = undefined;
            const concepts: any = [];
            const simpleTypes = schema[`${xsdPrefix}:simpleType`];
            if (simpleTypes) {
              for (const aSimpleType of simpleTypes) {
                function handleRestrictions(inSimpleType: any) {
                  const restrictions = inSimpleType[`${xsdPrefix}:restriction`];
                  if (restrictions) {
                    const aRestriction = restrictions[0];
                    const enums = aRestriction[`${xsdPrefix}:enumeration`];
                    if (enums) {
                      for (const anEnum of enums) {
                        const notation = anEnum.$.value;
                        const annotation = anEnum[`${xsdPrefix}:annotation`];
                        const documentation = annotation && annotation[0][`${xsdPrefix}:documentation`];
                        if (!documentation) {
                          continue;
                        }
                        const prefLabel = removeWhitespace(documentation[0]);
                        const conceptId = `${idPrefix}${notation}`;
                        concepts.push({
                          notation,
                          prefLabel,
                          conceptId
                        });
                      }
                      enumSource = inSimpleType;
                    } else if (aRestriction[`${xsdPrefix}:simpleType`] ?? [0].hasOwnProperty(`${xsdPrefix}:list`)) {
                      listSource = inSimpleType;
                    }
                  }
                }
                handleRestrictions(aSimpleType);
                const union = aSimpleType[`${xsdPrefix}:union`];
                if (union) {
                  const types = union[0][`${xsdPrefix}:simpleType`];
                  if (types /*&& typeof types[Symbol.iterator] === 'function'*/) {
                    for (const aUnionSimpleType of types) {
                      handleRestrictions(aUnionSimpleType);
                    }
                  } else {
                    // console.log(types);
                  }
                }
              }
            }
          /*if (concepts.length > 0)*/ {
              const typeSource = listSource || enumSource;
              if (typeof typeSource === 'object' && typeSource['$']) {
                const schemeName = typeSource['$']['name'];
                if (schemeName) {
                  schemeId = `${idPrefix}${schemeName}`;
                  const annotation = typeSource[`${xsdPrefix}:annotation`];
                  const documentation = annotation[0][`${xsdPrefix}:documentation`];
                  const description = documentation && documentation[0];
                  g.add(schemeId, RDF_TYPE, 'skos:ConceptScheme');
                  if (description) {
                    g.addL(schemeId, 'dc:title', removeWhitespace(description)/*, 'en-latn'*/);
                  }
                }

                const allowedNotationsId = `${schemeId}Values`;
                for (const aConcept of concepts) {
                  g.add(schemeId, 'skos:hasTopConcept', aConcept.conceptId);
                  inNamespaces[OWL_URI] = 'owl';
                  g.addL(allowedNotationsId, 'owl:oneOf', aConcept.notation);
                  g.add(aConcept.conceptId, RDF_TYPE, 'skos:Concept');
                  const stmt = g.add(aConcept.conceptId, 'skos:inScheme', schemeId);
                  // g.addL(aConcept.conceptId, 'skos:prefLabel', aConcept.notation, IC-EDH);
                  g.addD(aConcept.conceptId, 'skos:notation', aConcept.notation/*, `${xsdPrefix}:string`*/);
                  if (aConcept.prefLabel) {
                    g.addL(aConcept.conceptId, 'skos:prefLabel', aConcept.prefLabel/*, 'en-latn'*/);
                  }
                }
                inNamespaces[RDFS_URI] = 'rdfs';
                g.add(allowedNotationsId, RDF_TYPE, 'rdfs:Datatype');
              }
              const rdf = converters.rdfjson2rdfxml(g);
              const json1 = await ldtr.read({ data: rdf, type: 'application/rdf+xml' });
              // if (!inNamespaces[OWL_URI]) {
              delete inNamespaces[XML_SCHEMA_URI];
              // delete inNamespaces[RDF_URI];
              // }
              const context = _.invert(inNamespaces);
              const json2 = await jsonld.compact(json1, context);
              const extname = path.extname(inputFilepath);
              const dirname = path.dirname(inputFilepath);
              const basename = path.basename(inputFilepath, extname);
              const relative = path.relative(INPUT_DIR, dirname);
              const outputDir = path.join(__dirname, '..', 'transformed', relative);
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }
              const jsonldOutputFilepath = path.join(outputDir, `${basename}.jsonld`);
              const jsonText = JSON.stringify(json2, null, 2);
              fs.writeFileSync(jsonldOutputFilepath, jsonText);
              const flattened = await jsonld.flatten(json2);
              const nquads = await jsonld.toRDF(flattened, { format: NQUADS_FORMAT });
              const parser = new Parser({ format: NQUADS_FORMAT });
              const writer = new Writer({ format: TURTLE_FORMAT, prefixes: context });
              await parser.parse(nquads, (error: any, quad: any, prefixes: any) => {
                if (error) console.log(`PARSE ERROR: ${error}`);
                if (quad) writer.addQuad(quad);
              });
              let turtle = '';
              await writer.end((error: any, result: any) => {
                if (error) console.log(`WRITE ERROR: ${error}`);
                turtle = result;
              });
              const n3OutputFilepath = path.join(outputDir, `${basename}.ttl`);
              fs.writeFileSync(n3OutputFilepath, turtle);
            }
          }
        }
      }
    }
    return [g, inNamespaces];
  }
})();

function removeWhitespace(documentation: any) {
  return (documentation['xhtml:p']?.[0]?._ || documentation).replace(/\s+/g, ' ').trim();
}
