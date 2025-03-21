import { Graph, namespaces } from '@entryscape/rdfjson';
import rdf from '@rdfjs/data-model';
import PrefixMap from '@rdfjs/prefix-map/PrefixMap.js';
import SerializerJsonld from '@rdfjs/serializer-jsonld-ext';
import TurtleSerializer from '@rdfjs/serializer-turtle';
import { NamedNode, Quad } from '@rdfjs/types';
import fs from 'fs';
import getStream, { AnyStream } from 'get-stream';
import _ from 'lodash';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

const XML_SCHEMA_URI = 'http://www.w3.org/2001/XMLSchema';
const RDF_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL_URI = 'http://www.w3.org/2002/07/owl#';
const RDFS_URI = 'http://www.w3.org/2000/01/rdf-schema#';
const SHACL_URI = 'http://www.w3.org/ns/shacl#';
const XSD_EXTENSION = '.xsd';
const INPUT_DIR = '.ciartifacts';
const SCHEMAS_DIR = 'schemas';
const RDF_TYPE = 'rdf:type';
const ONTOLOGY_TYPE = 'owl:Ontology';
const IMPORTS_PROPERTY = 'owl:imports';
const URI_PREFIX = 'urn:us:gov:ic';

type Import = {
  namespace: string;
  schemaLocation: string;
}
type Package = {
  g: typeof Graph;
  namespaces: { [key: string]: string };
  importUris: string[];
}
type Packages = {
  standalone: Package;
  convienence: Package;
}

let blankIndex = 0;

(async () => {
  const defaultPrefixes = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'config', 'defaultPrefixes.json'), 'utf8'));
  for (const [prefix, iri] of Object.entries(defaultPrefixes)) {
    namespaces.add(prefix, iri);
  }

  const processed: Map<string, Packages> = new Map();

  const schemasDir = path.join(INPUT_DIR, SCHEMAS_DIR);
  await input(path.join(schemasDir, 'ISMCAT', 'Tetragraph' + XSD_EXTENSION), processed);
  await input(path.join(schemasDir, 'IC-EDH', 'IC-EDH' + XSD_EXTENSION), processed);

  for (const aProcessed of processed.keys()) {
    const dir = path.dirname(aProcessed);
    for (const f of fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith(XSD_EXTENSION))) {
      await input(path.join(dir, f), processed);
    }
  }

  console.log(processed.keys());

  async function input(inputFilepath: string, processed: Map<string, Packages>): Promise<Packages> {
    const ontologyUri = URI_PREFIX + inputFilepath.substring(0, inputFilepath.lastIndexOf('.xsd')).
      substring(schemasDir.length).replaceAll(path.sep, ':');
    inputFilepath = path.normalize(inputFilepath);
    let p: Packages | undefined = processed.get(inputFilepath);
    if (!p) {
      p = {
        standalone: {
          g: new Graph({}),
          namespaces: {},
          importUris: [],
        }, convienence: {
          g: new Graph({}),
          namespaces: {},
          importUris: [],
        }
      };
      processed.set(inputFilepath, p);
      const standalone = p.standalone;
      const convienence = p.convienence;
      standalone.g.add(ontologyUri, RDF_TYPE, ONTOLOGY_TYPE);
      const text = fs.readFileSync(inputFilepath, 'utf8');
      const json = await xml2js.parseStringPromise(text);
      for (const entry of Object.entries(json)) {
        if (entry[0].endsWith(':schema')) {
          const schema: any = entry[1];
          const $ = schema.$;
          Object.entries($);
          let defaultNs = $.targetNamespace + '#';
          Object.assign(standalone.namespaces, (Object.entries($) as [string, string][]).reduce((acc: { [key: string]: string }, e) => {
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
            standalone.namespaces[iri] = prefix;
          }

          for (const [iri, prefix] of Object.entries(standalone.namespaces)) {
            namespaces.add(prefix, iri);
          }
          const idPrefix = `${defaultNs}`;
          const xsdPrefix = standalone.namespaces[XML_SCHEMA_URI];
          standalone.namespaces[`${XML_SCHEMA_URI}#`] = xsdPrefix;
          if (xsdPrefix) {
            const elements = schema[`${xsdPrefix}:element`];
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
                        standalone.namespaces[OWL_URI] = 'owl';
                        standalone.namespaces[RDFS_URI] = 'rdfs';
                        standalone.namespaces[RDF_URI] = 'rdf';
                        standalone.g.add(attributeId, RDF_TYPE, 'owl:DatatypeProperty');
                        if (attributeType.startsWith(`${xsdPrefix}:`)) {
                          namespaces.add(xsdPrefix, `${XML_SCHEMA_URI}#`);
                        }
                        else {
                          attributeType += 'Values';
                        }
                        standalone.g.add(attributeId, 'rdfs:range', `${attributeType}`);
                        const documentation = anAttribute[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                        if (documentation) {
                          for (const aComment of (Array.isArray(documentation) ? documentation : [documentation])) {
                            const comment = removeWhitespace(aComment);
                            standalone.g.addL(attributeId, 'rdfs:comment', comment);
                          }
                        }
                      }
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
                const schemaLocation = importSpec.schemaLocation;
                const importPath: string = path.join(dirname, schemaLocation);
                standalone.importUris.push(schemaLocation);
                const imported = await input(importPath, processed);
                Object.assign(convienence.namespaces, imported.convienence.namespaces);
                imported.standalone.g.findAndRemove(null, IMPORTS_PROPERTY, null);
                imported.convienence.g.findAndRemove(null, RDF_TYPE, ONTOLOGY_TYPE);
                convienence.g.addAll(imported.convienence.g);
              }
            }

            let schemeId = undefined, listSource = undefined, enumSource = undefined;
            const concepts: any = [];
            let patterns = 0;
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
                        const annotation = anEnum[`${xsdPrefix}:annotation`];
                        const documentation = annotation && annotation[0][`${xsdPrefix}:documentation`];
                        if (!documentation) {
                          continue;
                        }
                        const notation = anEnum.$.value;
                        const prefLabel = removeWhitespace(documentation[0]);
                        const conceptId = notation.startsWith(URI_PREFIX) ? notation : `${idPrefix}${notation}`;
                        concepts.push({
                          notation,
                          prefLabel,
                          conceptId
                        });
                      }
                      enumSource = inSimpleType;
                    } else if (aRestriction[`${xsdPrefix}:simpleType`] ?? [0].hasOwnProperty(`${xsdPrefix}:list`)) {
                      listSource = inSimpleType;
                    } else {
                      const patternSpec = aRestriction[`${xsdPrefix}:pattern`];
                      if (patternSpec) {
                        const pattern = patternSpec[0]['$'].value;
                        const conceptId = defaultNs + encodeURIComponent(pattern);
                        const annotation = patternSpec[0][`${xsdPrefix}:annotation`];
                        let prefLabel = annotation && annotation[0][`${xsdPrefix}:documentation`];
                        if (prefLabel) {
                          prefLabel = removeWhitespace(prefLabel[0]);
                        }
                        patterns++;
                        concepts.push({
                          pattern,
                          prefLabel,
                          conceptId
                        });
                      }
                    }
                  }
                }
                handleRestrictions(aSimpleType);
                const union = aSimpleType[`${xsdPrefix}:union`];
                if (union) {
                  const types = union[0][`${xsdPrefix}:simpleType`];
                  if (types) {
                    for (const aUnionSimpleType of types) {
                      handleRestrictions(aUnionSimpleType);
                    }
                  }
                }
              }
            }

            const typeSource = listSource || enumSource;
            if (typeof typeSource === 'object' && typeSource['$']) {
              const schemeName = typeSource['$']['name'];
              if (schemeName) {
                schemeId = `${idPrefix}${schemeName}`;
                const annotation = typeSource[`${xsdPrefix}:annotation`];
                const documentation = annotation[0][`${xsdPrefix}:documentation`];
                const description = documentation && documentation[0];
                standalone.g.add(schemeId, RDF_TYPE, 'skos:ConceptScheme');
                if (description) {
                  standalone.g.addL(schemeId, 'dc:title', removeWhitespace(description));
                }
              }

              const allowedNotationsId = `${schemeId}Values`;
              for (const aConcept of concepts) {
                standalone.g.add(schemeId, 'skos:hasTopConcept', aConcept.conceptId);
                standalone.namespaces[OWL_URI] = 'owl';
                standalone.g.add(aConcept.conceptId, RDF_TYPE, 'skos:Concept');
                standalone.g.add(aConcept.conceptId, 'skos:inScheme', schemeId);
                if (aConcept.notation) {
                  standalone.g.addD(aConcept.conceptId, 'skos:notation', aConcept.notation);
                  standalone.g.add(allowedNotationsId, 'rdfs:subClassOf', `${XML_SCHEMA_URI}#string`);
                  standalone.g.addL(allowedNotationsId, 'owl:oneOf', aConcept.notation);
                } else if (aConcept.pattern) {
                  standalone.namespaces[SHACL_URI] = 'sh';
                  const restriction = standalone.g.addL(null, 'sh:pattern', aConcept.pattern);
                  const blank = { type: 'bnode', value: restriction._s };
                  standalone.g.add(restriction._s, 'sh:path', 'skos:notation');
                  standalone.g.add(aConcept.conceptId, 'sh:property', blank);
                }
                if (aConcept.prefLabel) {
                  standalone.g.addL(aConcept.conceptId, 'skos:prefLabel', aConcept.prefLabel);
                }
              }
              standalone.namespaces[RDFS_URI] = 'rdfs';
              standalone.g.add(allowedNotationsId, RDF_TYPE, 'rdfs:Datatype');
            }
            delete standalone.namespaces[XML_SCHEMA_URI];
            const extname = path.extname(inputFilepath);
            const dirname = path.dirname(inputFilepath);
            const basename = path.basename(inputFilepath, extname);
            const relative = path.relative(schemasDir, dirname);
            const outputBase = path.join(__dirname, '..', 'transformed');

            convienence.g.addAll(standalone.g);
            Object.assign(convienence.namespaces, standalone.namespaces);
            await writeGraph(convienence, path.join(outputBase, 'convenience'));

            standalone.importUris.forEach((uri) => {
              const importUri = 'urn:us:gov:ic:' + uri.replace(/\.\w+$/, '.jsonld');
              standalone.g.add(ontologyUri, IMPORTS_PROPERTY, importUri);
            });
            await writeGraph(standalone, path.join(outputBase, 'standalone'));

            async function writeGraph(p: Package, outputDir: string) {
              const context = _.invert(p.namespaces);

              outputDir = path.join(outputDir, relative);

              const prefixesArr: Array<[string, NamedNode]> = [];
              Object.entries(context).forEach((e: [string, string]) => {
                prefixesArr.push([e[0], rdf.namedNode(e[1])]);
              });
              const prefixes = new PrefixMap(prefixesArr, { factory: rdf });
              const quads: Quad[] = [];
              p.g.find().forEach((triple: any) => {
                const quad: Quad = rdf.quad(rdf.namedNode(triple._s), rdf.namedNode(triple._p),
                  triple._o.type === 'literal' ? rdf.literal(triple._o.value) : rdf.namedNode(triple._o.value));
                quads.push(quad);
              });
              const jsonldSerializer = new SerializerJsonld({
                context,
                compact: true,
                encoding: 'string',
                prettyPrint: true
              });

              const input = new Readable({
                objectMode: true,
                read: () => {
                  quads.forEach(quad => {
                    input.push(quad);
                  })
                  input.push(null);
                }
              })
              const jsonld: string = await getStream(jsonldSerializer.import(input) as AnyStream);
              const jsonldOutputFilepath = path.join(outputDir, `${basename}.jsonld`);
              fs.writeFileSync(jsonldOutputFilepath, jsonld);

              const turtleSerializer = new TurtleSerializer({ prefixes: prefixes });
              const turtle: string = turtleSerializer.transform(quads);
              const turtleOutputFilepath = path.join(outputDir, `${basename}.ttl`);
              fs.writeFileSync(turtleOutputFilepath, turtle);
            }
          }
        }
      }
    }
    return p;
  }
})();

function removeWhitespace(documentation: any) {
  return (documentation['xhtml:p']?.[0]?._ || documentation).replace(/\s+/g, ' ').trim();
}
