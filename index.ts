import { Graph, namespaces } from '@entryscape/rdfjson';
import { write } from '@jeswr/pretty-turtle';
import rdf from '@rdfjs/data-model';
import SerializerJsonld from '@rdfjs/serializer-jsonld-ext';
import { Literal, NamedNode, Quad } from '@rdfjs/types';
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
const DC_URI = 'http://purl.org/dc/elements/1.1/';
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
  imports: { [key: string]: [string, Package] };
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
          imports: {},
        }, convienence: {
          g: new Graph({}),
          namespaces: {},
          imports: {},
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
                        standalone.namespaces[DC_URI] = 'dc';
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
              const merged = new Set();
              for (const importSpec of all) {
                const schemaLocation = importSpec.schemaLocation;
                const importPath: string = path.join(dirname, schemaLocation);
                const imported = await input(importPath, processed);
                standalone.imports[schemaLocation] = [importPath, imported.standalone];
                merge(merged, importPath, convienence, imported.standalone);
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
              standalone.namespaces[RDFS_URI] = 'rdfs';
              standalone.g.add(allowedNotationsId, RDF_TYPE, 'rdfs:Datatype');  // optional
              const equivalentClass = standalone.g.add(null, 'rdf:type', 'rdfs:Datatype');
              standalone.g.add(allowedNotationsId, 'owl:equivalentClass', { type: 'bnode', value: equivalentClass._s });
              standalone.g.add(allowedNotationsId, 'rdfs:seeAlso', schemeId);
              standalone.g.add(allowedNotationsId, 'dc:source', schemeId);
              standalone.g.addL(allowedNotationsId, 'rdfs:comment', `Permissible literals aligned to skos:notation in ${schemeId}.`);
              let rest = null;
              for (const aConcept of concepts) {
                standalone.g.add(schemeId, 'skos:hasTopConcept', aConcept.conceptId);
                standalone.namespaces[OWL_URI] = 'owl';
                standalone.g.add(aConcept.conceptId, RDF_TYPE, 'skos:Concept');
                standalone.g.add(aConcept.conceptId, 'skos:inScheme', schemeId);
                if (aConcept.notation) {
                  standalone.g.addL(aConcept.conceptId, 'skos:notation', aConcept.notation);
                  const list: any = standalone.g.add(null, 'rdf:type', 'rdf:List');
                  standalone.g.addL(list._s, 'rdf:first', aConcept.notation);
                  standalone.g.add((rest || equivalentClass)._s, rest ? 'rdf:rest' : 'owl:oneOf', { type: 'bnode', value: list._s });
                  rest = list;
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
              if (rest) {
                standalone.g.add(rest._s, 'rdf:rest', 'rdf:nil');
              }
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

            Object.keys(standalone.imports).forEach((uri) => {
              const importUri = 'urn:us:gov:ic:' + uri.replace(/\.\w+$/, '.jsonld');
              standalone.g.add(ontologyUri, IMPORTS_PROPERTY, importUri);
            });
            await writeGraph(standalone, path.join(outputBase, 'standalone'));

            async function writeGraph(p: Package, outputDir: string) {
              const context = _.invert(p.namespaces);
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }
              outputDir = path.join(outputDir, relative);
              if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
              }

              const prefixesArr: Array<[string, NamedNode]> = [];
              Object.entries(context).forEach((e: [string, string]) => {
                prefixesArr.push([e[0], rdf.namedNode(e[1])]);
              });
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

              let turtle: string = await write(quads, { prefixes: context });
              // due to a bug in the turtle writer, we need to convert rdf lists to 
              turtle = convertRdfListToTurtleList(turtle);
              const turtleOutputFilepath = path.join(outputDir, `${basename}.ttl`);
              fs.writeFileSync(turtleOutputFilepath, turtle);

              const triples = triplesToString(quads);
              const triplesOutputFilepath = path.join(outputDir, `${basename}.nt`);
              fs.writeFileSync(triplesOutputFilepath, triples);
            }
          }
        }
      }
    }
    return p;

    function merge(merged: Set<unknown>, importPath: string, convienence: Package, standalone: Package) {
      if (!merged.has(importPath)) {
        merged.add(importPath);
        for (const x of Object.entries(standalone.imports)) {
          merge(merged, x[0] as string, convienence, x[1][1]);
        }
        Object.assign(convienence.namespaces, standalone.namespaces);
        standalone.g.findAndRemove(null, IMPORTS_PROPERTY, null);
        standalone.g.findAndRemove(null, RDF_TYPE, ONTOLOGY_TYPE);
        convienence.g.addAll(standalone.g);
      }
    }
  }
})();

function removeWhitespace(documentation: any) {
  return (documentation['xhtml:p']?.[0]?._ || documentation).replace(/\s+/g, ' ').trim();
}

function triplesToString(triples: Quad[]): string {
  return triples.map(tripleToString).join('');
}

function tripleToString(quad: Quad): string {
  return `${tri(quad.subject)} ${tri(quad.predicate)} ${tri(quad.object)} .\n`;

  function tri(x: any) {
    const val = x.value;
    let objectString: string;

    switch (quad.object.constructor.name) {
      case 'Literal':
        const literal: Literal = x;
        if (literal.datatype && literal.datatype.value === `${XML_SCHEMA_URI}#string`) {
          objectString = JSON.stringify(literal.value);
          break;
        }

      case 'NamedNode':
        if (val.startsWith('_:')) {
          objectString = val;
          break;
        }

      default:
        objectString = `<${val}>`;
    }
    return objectString;
  }
}

// This function converts RDF lists to a string representation
// by extracting the values from rdf:first and formatting them.
// It uses a regular expression to match the RDF list structure and
// replaces it with a formatted string.
// The function continues to process the input string until no more matches are found.
// It returns the modified string with the RDF list converted to a string representation.
// The function assumes that the input string is in a specific format,
// and it may need to be adjusted if the input format changes.
// Note: The function does not handle errors or malformed input.
// If the input string does not match the expected format, it may return an empty string or throw an error.

function convertRdfListToTurtleList(rdfListString: string): string {
  let match;
  do {
    // Regular expression to extract the RDF list part and the surrounding text
    const regex = /(.*?)(\s*\[\s*a rdf:List[\s\S]*?rdf:rest rdf:nil)(\s*]\n)*(.*)/s;
    match = rdfListString.match(regex);
    if (match && match.length > 4) {
      const prefix = match[1];
      const suffix = match[4];

      // Regular expression to extract the string values from rdf:first
      const valueRegex = /rdf:first\s+("[^"]*"(?:\^\^(\w+(?:\:\w+)?))?)/g;
      let valueMatch;
      const extractedValues: string[] = [];

      // Iterate through the matches and extract the values
      while ((valueMatch = valueRegex.exec(match[2])) !== null) {
        extractedValues.push(valueMatch[1]);
      }

      // Construct the output string
      const listString = ` (\n\t\t\t${extractedValues.join('\n\t\t\t')}\n\t\t) ;\n`; // Added semicolon

      rdfListString = prefix + listString + suffix;
    }
  } while (match);
  return rdfListString; // Or throw an error, depending on the desired behavior
}

