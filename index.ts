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
const ONTOLOGY_TYPE = 'owl:Ontology';
const IMPORTS_PROPERTY = 'owl:imports';

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

(async () => {
  // const filename = require('path').resolve(__dirname, '../.ciartifacts/config/defaultPrefixes.json');
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
    const ontologyUri = 'urn:us:gov:ic' + inputFilepath.substring(0, inputFilepath.lastIndexOf('.xsd')).
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
          // const defaultPrefix = defaultNs && standalone.namespaces[defaultNs];
          const idPrefix = /*defaultPrefix ? `${defaultPrefix}:` : */`${defaultNs}`;
          const xsdPrefix = standalone.namespaces[XML_SCHEMA_URI];
          standalone.namespaces['http://www.w3.org/2001/XMLSchema#'] = xsdPrefix;
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
                        // standalone.g.add(attributeId, 'rdf:Property', 'rdf:Property');
                        standalone.g.add(attributeId, RDF_TYPE, 'rdf:Property')
                        standalone.namespaces[OWL_URI] = 'owl';
                        standalone.namespaces[RDFS_URI] = 'rdfs';
                        standalone.namespaces[RDF_URI] = 'rdf';
                        if (attributeType.startsWith(`${xsdPrefix}:`)) {
                          namespaces.add(xsdPrefix, 'http://www.w3.org/2001/XMLSchema#');
                          standalone.g.add(attributeId, RDF_TYPE, 'owl:DatatypeProperty');
                        }
                        else {
                          attributeType += 'Values';
                          standalone.g.add(attributeId, RDF_TYPE, 'rdf:Property');
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
                const schemaLocation = importSpec.schemaLocation;
                const importPath: string = path.join(dirname, schemaLocation);
                standalone.importUris.push(schemaLocation);
                const imported = await input(importPath, processed);
                Object.assign(convienence.namespaces, imported.convienence.namespaces);
                // remove all imported ontology imports from the imported graph
                imported.standalone.g.findAndRemove(null, IMPORTS_PROPERTY, null);
                convienence.g.addAll(imported.convienence.g);
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
                  standalone.g.add(schemeId, RDF_TYPE, 'skos:ConceptScheme');
                  if (description) {
                    standalone.g.addL(schemeId, 'dc:title', removeWhitespace(description)/*, 'en-latn'*/);
                  }
                }

                const allowedNotationsId = `${schemeId}Values`;
                for (const aConcept of concepts) {
                  standalone.g.add(schemeId, 'skos:hasTopConcept', aConcept.conceptId);
                  standalone.namespaces[OWL_URI] = 'owl';
                  standalone.g.addL(allowedNotationsId, 'owl:oneOf', aConcept.notation);
                  standalone.g.add(aConcept.conceptId, RDF_TYPE, 'skos:Concept');
                  const stmt = standalone.g.add(aConcept.conceptId, 'skos:inScheme', schemeId);
                  // standalone.g.addL(aConcept.conceptId, 'skos:prefLabel', aConcept.notation, IC-EDH);
                  standalone.g.addD(aConcept.conceptId, 'skos:notation', aConcept.notation/*, `${xsdPrefix}:string`*/);
                  if (aConcept.prefLabel) {
                    standalone.g.addL(aConcept.conceptId, 'skos:prefLabel', aConcept.prefLabel/*, 'en-latn'*/);
                  }
                }
                standalone.namespaces[RDFS_URI] = 'rdfs';
                standalone.g.add(allowedNotationsId, RDF_TYPE, 'rdfs:Datatype');
              }
              // if (!standalone.namespaces[OWL_URI]) {
              delete standalone.namespaces[XML_SCHEMA_URI];
              // delete standalone.namespaces[RDF_URI];
              // }
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
                standalone.g.add(importUri, RDF_TYPE, ONTOLOGY_TYPE);
                standalone.g.add(ontologyUri, IMPORTS_PROPERTY, importUri);
              });
              await writeGraph(standalone, path.join(outputBase, 'standalone'));

              async function writeGraph(p: Package, outputDir: string) {
                outputDir = path.join(outputDir, relative);
                const rdf = converters.rdfjson2rdfxml(p.g);
                const json1 = await ldtr.read({ data: rdf, type: 'application/rdf+xml' });
                const context = _.invert(p.namespaces);
                const json2 = await jsonld.compact(json1, context);
                const jsonText = JSON.stringify(json2, null, 2);
                if (!fs.existsSync(outputDir)) {
                  fs.mkdirSync(outputDir, { recursive: true });
                }

                const jsonldOutputFilepath = path.join(outputDir, `${basename}.jsonld`);
                fs.writeFileSync(jsonldOutputFilepath, jsonText);

                // const graph = json2['@graph'];
                // if (graph) {
                //   // replace all .jsonld with .ttl
                //   graph.forEach((e: any) => {
                //     if (e['@type'] === ONTOLOGY_TYPE) {
                //       if (e['@id'] === ontologyUri) {
                //         const imports = e['owl:imports'];
                //         if (imports) {
                //           (Array.isArray(imports) ? imports : [imports]).forEach((anImport: any) => {
                //             anImport['@id'] = anImport['@id'].replace(/\.\w+$/, '.ttl');
                //           });
                //         }
                //       } else if (e['@id'].endsWith('.jsonld')) {
                //         e['@id'] = e['@id'].replace(/\.\w+$/, '.ttl');
                //       }
                //     }
                //   });
                // }
                const flattened = await jsonld.flatten(json2);
                const nquads = (await jsonld.toRDF(flattened, { format: NQUADS_FORMAT })).replaceAll('.jsonld', '.ttl');
                const parser = new Parser({ format: NQUADS_FORMAT });
                const writer = new Writer({ format: TURTLE_FORMAT, prefixes: context });
                await parser.parse(nquads, (error: any, quad: any, prefixes: any) => {
                  if (error) console.log(`PARSE ERROR: ${error}`);
                  if (quad) {
                    writer.addQuad(quad);
                  }
                });
                let turtle = '';
                await writer.end((error: any, result: any) => {
                  if (error) console.log(`WRITE ERROR: ${error}`);
                  turtle = result;
                });

                // const flattened = await jsonld.flatten(json2);
                // const rdfQuads = await jsonld.toRDF(flattened, { format: "application/n-quads" });

                // // Create an N3 writer
                // const writer = new Writer({ format: "text/turtle" });

                // // Parse and add RDF quads to the writer
                // flattened.forEach((quad: { subject: { value: any; }; predicate: { value: any; }; object: { datatype: { value: any; }; value: any; }; }) => {
                //   writer.addQuad(
                //     quad.subject.value,
                //     quad.predicate.value,
                //     quad.object.datatype ? `"${quad.object.value}"^^${quad.object.datatype.value}` : quad.object.value
                //   );
                // });

                // // Convert to Turtle format
                // const turtle: string = await new Promise((resolve, reject) => {
                //   writer.end((error: any, result: unknown) => {
                //     if (error) reject(error);
                //     else resolve(result as string);
                //   });
                // });


                const turtleOutputFilepath = path.join(outputDir, `${basename}.ttl`);
                fs.writeFileSync(turtleOutputFilepath, turtle);
              }
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
