import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { Graph, namespaces } from '@entryscape/rdfjson';
import { write } from '@jeswr/pretty-turtle';
import rdf from '@rdfjs/data-model';
import SerializerJsonld from '@rdfjs/serializer-jsonld-ext';
import type { Literal, NamedNode, Quad } from '@rdfjs/types';
import fs from 'fs';
import getStream from 'get-stream';
import type { AnyStream } from 'get-stream';
import http from 'http';
import https from 'https';
import _ from 'lodash';
import path from 'path';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory
const WORKSPACE_ROOT = path.basename(__dirname).toLowerCase() === 'out'
  ? path.join(__dirname, '..')
  : __dirname;

const XML_SCHEMA_URI = 'http://www.w3.org/2001/XMLSchema';
const RDF_URI = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const OWL_URI = 'http://www.w3.org/2002/07/owl#';
const RDFS_URI = 'http://www.w3.org/2000/01/rdf-schema#';
const DC_URI = 'http://purl.org/dc/elements/1.1/';
const SHACL_URI = 'http://www.w3.org/ns/shacl#';
const SKOS_URI = 'http://www.w3.org/2004/02/skos/core#';
const XSD_EXTENSION = '.xsd';
const SCH_EXTENSION = '.sch';
const INPUT_DIR = path.join(WORKSPACE_ROOT, '.ciartifacts');
const SCHEMA_DIR_NAME = 'Schema';
const LEGACY_SCHEMA_DIR_NAME = 'schemas';
const SCHEMATRON_DIR_NAME = 'Schematron';
const SCHEMA_DIR = path.join(INPUT_DIR, SCHEMA_DIR_NAME);
const LEGACY_SCHEMA_DIR = path.join(INPUT_DIR, LEGACY_SCHEMA_DIR_NAME);
const SCHEMATRON_DIR = path.join(INPUT_DIR, SCHEMATRON_DIR_NAME);
const DOWNLOADS_DIR = path.join(INPUT_DIR, 'downloads');
const SOURCE_STAGE_DIR = path.join(INPUT_DIR, 'source');
const SOURCE_MANIFEST_PATH = path.join(INPUT_DIR, 'source-manifest.json');
const OUTPUT_BASE_DIR = path.join(WORKSPACE_ROOT, 'out', 'transformed');
const RDF_TYPE = 'rdf:type';
const ONTOLOGY_TYPE = 'owl:Ontology';
const IMPORTS_PROPERTY = 'owl:imports';
const URI_PREFIX = 'urn:us:gov:ic';
const SCHEMATRON_NS_URI = 'urn:us:gov:ic:ism2rdf:schematron#';
const ENV_SOURCE_KEY = 'ISM2RDF_SOURCE';
const ENV_SOURCE_TYPE_KEY = 'ISM2RDF_SOURCE_TYPE';
const ENV_SOURCE_VERSION_KEY = 'ISM2RDF_SOURCE_VERSION';
const ENV_FORCE_REFRESH_KEY = 'ISM2RDF_FORCE_REFRESH';

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

type SchematronPackages = {
  standalone: Package;
  convienence: Package;
}

type SourceKind = 'url' | 'zip' | 'dir';

type SourceOptions = {
  source?: string;
  sourceType?: 'auto' | SourceKind;
  sourceVersion?: string;
  forceRefresh: boolean;
}

type SourceManifest = {
  source: string;
  sourceKind: SourceKind;
  sourceVersion?: string;
  cachedFilePath?: string;
  cachedFileHash?: string;
  cachedFileSize?: number;
  cachedFileMtimeMs?: number;
  etag?: string;
  lastModified?: string;
  schemaFingerprint?: string;
  schematronFingerprint?: string;
  extractedAt: string;
}

type PrepareSourceResult = {
  schemaRoot: string;
  schematronRoot: string;
  manifest?: SourceManifest;
}

let blankIndex = 0;

(async () => {
  const defaultPrefixes = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'config', 'defaultPrefixes.json'), 'utf8'));
  for (const [prefix, iri] of Object.entries(defaultPrefixes)) {
    namespaces.add(prefix, iri);
  }

  const sourceOptions = resolveSourceOptions(process.argv.slice(2));
  const sourceResult = await prepareAuthoritativeSources(sourceOptions);
  if (sourceResult.manifest) {
    fs.writeFileSync(SOURCE_MANIFEST_PATH, JSON.stringify(sourceResult.manifest, null, 2));
  }

  const schemaRoot = sourceResult.schemaRoot;
  const schematronRoot = sourceResult.schematronRoot;
  const outputDir = resolveOutputDir(sourceOptions.sourceVersion);
  console.log(`Output directory: ${outputDir}`);

  const processed: Map<string, Packages> = new Map();
  const processedSchematron: Map<string, SchematronPackages> = new Map();

  const schemaFiles = listFilesRecursive(schemaRoot)
    .filter(filePath => filePath.toLowerCase().endsWith(XSD_EXTENSION))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error(`No schema files found under ${schemaRoot}`);
  }

  for (const schemaFile of schemaFiles) {
    await input(schemaFile, processed, processedSchematron);
  }

  console.log(`Processed ${processed.size} XSD documents`);
  console.log(`Processed ${processedSchematron.size} Schematron documents`);

  async function input(inputFilepath: string, processed: Map<string, Packages>, processedSchematron: Map<string, SchematronPackages>): Promise<Packages> {
    if (processed.size % 10 === 0 || !processed.has(path.normalize(inputFilepath))) {
      console.log(`[${processed.size}] Processing: ${path.basename(inputFilepath)}`);
    }
    const ontologyUri = URI_PREFIX + inputFilepath.substring(0, inputFilepath.lastIndexOf('.xsd')).
      substring(schemaRoot.length).replaceAll(path.sep, ':');
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
                const imported = await input(importPath, processed, processedSchematron);
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
            const relative = path.relative(schemaRoot, dirname);

            convienence.g.addAll(standalone.g);
            Object.assign(convienence.namespaces, standalone.namespaces);
            await writeGraph(convienence, path.join(outputDir, 'convenience'));

            Object.keys(standalone.imports).forEach((uri) => {
              const importUri = 'urn:us:gov:ic:' + uri.replace(/\.\w+$/, '.jsonld');
              standalone.g.add(ontologyUri, IMPORTS_PROPERTY, importUri);
            });
            await writeGraph(standalone, path.join(outputDir, 'standalone'));

            const schematronPath = discoverSchematronPath(text, inputFilepath, schematronRoot);
            if (schematronPath) {
              await inputSchematron(schematronPath, schematronRoot, outputDir, processedSchematron);
            }

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
})().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

function resolveOutputDir(sourceVersion: string | undefined): string {
  const versionSegment = sourceVersion
    ? sourceVersion.replace(/[^a-zA-Z0-9._-]/g, '_')
    : 'current';
  return path.join(OUTPUT_BASE_DIR, versionSegment);
}

function resolveSourceOptions(args: string[]): SourceOptions {
  const envFileValues = parseDotEnv(path.join(WORKSPACE_ROOT, '.env'));

  let cliSource: string | undefined;
  let cliSourceType: SourceOptions['sourceType'];
  let cliSourceVersion: string | undefined;
  let cliForceRefresh = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force-refresh') {
      cliForceRefresh = true;
      continue;
    }
    if (arg.startsWith('--source=')) {
      cliSource = arg.substring('--source='.length);
      continue;
    }
    if (arg === '--source' && args[i + 1]) {
      cliSource = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--source-type=')) {
      cliSourceType = arg.substring('--source-type='.length) as SourceOptions['sourceType'];
      continue;
    }
    if (arg === '--source-type' && args[i + 1]) {
      cliSourceType = args[i + 1] as SourceOptions['sourceType'];
      i += 1;
      continue;
    }
    if (arg.startsWith('--source-version=')) {
      cliSourceVersion = arg.substring('--source-version='.length);
      continue;
    }
    if (arg === '--source-version' && args[i + 1]) {
      cliSourceVersion = args[i + 1];
      i += 1;
    }
  }

  const source = cliSource
    ?? process.env[ENV_SOURCE_KEY]
    ?? envFileValues[ENV_SOURCE_KEY];
  const sourceType = cliSourceType
    ?? (process.env[ENV_SOURCE_TYPE_KEY] as SourceOptions['sourceType'] | undefined)
    ?? (envFileValues[ENV_SOURCE_TYPE_KEY] as SourceOptions['sourceType'] | undefined)
    ?? 'auto';
  const sourceVersion = cliSourceVersion
    ?? process.env[ENV_SOURCE_VERSION_KEY]
    ?? envFileValues[ENV_SOURCE_VERSION_KEY];
  const forceRefresh = cliForceRefresh
    || toBoolean(process.env[ENV_FORCE_REFRESH_KEY])
    || toBoolean(envFileValues[ENV_FORCE_REFRESH_KEY]);

  return {
    source,
    sourceType,
    sourceVersion,
    forceRefresh,
  };
}

async function prepareAuthoritativeSources(options: SourceOptions): Promise<PrepareSourceResult> {
  const existingSchemaDir = fs.existsSync(SCHEMA_DIR)
    ? SCHEMA_DIR
    : fs.existsSync(LEGACY_SCHEMA_DIR)
      ? LEGACY_SCHEMA_DIR
      : undefined;

  if (!options.source) {
    if (!existingSchemaDir || !fs.existsSync(SCHEMATRON_DIR)) {
      throw new Error(
        `No source provided. Set --source, ${ENV_SOURCE_KEY}, or .env ${ENV_SOURCE_KEY}, or ensure ${SCHEMA_DIR} and ${SCHEMATRON_DIR} are populated.`
      );
    }

    if (existingSchemaDir === LEGACY_SCHEMA_DIR) {
      console.warn(`Using legacy schema folder ${LEGACY_SCHEMA_DIR}. Prefer canonical ${SCHEMA_DIR}.`);
    }

    return {
      schemaRoot: existingSchemaDir,
      schematronRoot: SCHEMATRON_DIR,
    };
  }

  const sourceKind = detectSourceKind(options.sourceType ?? 'auto', options.source);
  const previousManifest = readSourceManifest();
  ensureDir(DOWNLOADS_DIR);
  ensureDir(SOURCE_STAGE_DIR);

  if (sourceKind === 'url') {
    const cachedZipPath = path.join(DOWNLOADS_DIR, normalizeCacheFileName(options.source, options.sourceVersion));
    const downloadResult = await downloadUrlWithFreshness(options.source, cachedZipPath, previousManifest, options.forceRefresh);
    if (downloadResult.downloaded || !directoriesCurrent(previousManifest, options.source, options.sourceVersion, sourceKind, options.forceRefresh)) {
      await stageFromZip(cachedZipPath, SCHEMA_DIR, SCHEMATRON_DIR);
    }
    const manifest = buildManifest(options.source, sourceKind, options.sourceVersion, cachedZipPath, downloadResult.etag, downloadResult.lastModified);
    return { schemaRoot: SCHEMA_DIR, schematronRoot: SCHEMATRON_DIR, manifest };
  }

  if (sourceKind === 'zip') {
    const zipPath = path.resolve(options.source);
    if (!fs.existsSync(zipPath)) {
      throw new Error(`ZIP source does not exist: ${zipPath}`);
    }
    if (!directoriesCurrent(previousManifest, options.source, options.sourceVersion, sourceKind, options.forceRefresh)) {
      await stageFromZip(zipPath, SCHEMA_DIR, SCHEMATRON_DIR);
    }
    const manifest = buildManifest(options.source, sourceKind, options.sourceVersion, zipPath);
    return { schemaRoot: SCHEMA_DIR, schematronRoot: SCHEMATRON_DIR, manifest };
  }

  const sourceDir = path.resolve(options.source);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    throw new Error(`Directory source does not exist or is not a directory: ${sourceDir}`);
  }
  const sourceLayout = resolveSourceLayout(sourceDir);
  if (!sourceLayout.schemaPath || !sourceLayout.schematronPath) {
    throw new Error(`Could not locate Schema and Schematron paths inside directory source: ${sourceDir}`);
  }
  if (!directoriesCurrent(previousManifest, options.source, options.sourceVersion, sourceKind, options.forceRefresh)) {
    stageFromDirectory(sourceLayout.schemaPath, sourceLayout.schematronPath, SCHEMA_DIR, SCHEMATRON_DIR);
  }
  const manifest = buildManifest(options.source, sourceKind, options.sourceVersion);
  return { schemaRoot: SCHEMA_DIR, schematronRoot: SCHEMATRON_DIR, manifest };
}

function directoriesCurrent(
  previousManifest: SourceManifest | undefined,
  source: string,
  sourceVersion: string | undefined,
  sourceKind: SourceKind,
  forceRefresh: boolean,
): boolean {
  if (forceRefresh || !previousManifest) {
    return false;
  }
  if (
    previousManifest.source !== source
    || previousManifest.sourceKind !== sourceKind
    || (previousManifest.sourceVersion ?? '') !== (sourceVersion ?? '')
  ) {
    return false;
  }
  if (!fs.existsSync(SCHEMA_DIR) || !fs.existsSync(SCHEMATRON_DIR)) {
    return false;
  }
  const schemaFingerprint = computeDirectoryFingerprint(SCHEMA_DIR);
  const schematronFingerprint = computeDirectoryFingerprint(SCHEMATRON_DIR);
  return schemaFingerprint === previousManifest.schemaFingerprint
    && schematronFingerprint === previousManifest.schematronFingerprint;
}

function buildManifest(
  source: string,
  sourceKind: SourceKind,
  sourceVersion?: string,
  cachedFilePath?: string,
  etag?: string,
  lastModified?: string,
): SourceManifest {
  const manifest: SourceManifest = {
    source,
    sourceKind,
    sourceVersion,
    extractedAt: new Date().toISOString(),
    schemaFingerprint: computeDirectoryFingerprint(SCHEMA_DIR),
    schematronFingerprint: computeDirectoryFingerprint(SCHEMATRON_DIR),
  };

  if (cachedFilePath && fs.existsSync(cachedFilePath)) {
    const stats = fs.statSync(cachedFilePath);
    manifest.cachedFilePath = cachedFilePath;
    manifest.cachedFileHash = sha256File(cachedFilePath);
    manifest.cachedFileSize = stats.size;
    manifest.cachedFileMtimeMs = stats.mtimeMs;
  }
  if (etag) {
    manifest.etag = etag;
  }
  if (lastModified) {
    manifest.lastModified = lastModified;
  }
  return manifest;
}

async function downloadUrlWithFreshness(
  sourceUrl: string,
  destinationPath: string,
  previousManifest: SourceManifest | undefined,
  forceRefresh: boolean,
): Promise<{ downloaded: boolean; etag?: string; lastModified?: string }> {
  const headers: Record<string, string> = {};
  if (!forceRefresh && previousManifest?.source === sourceUrl && previousManifest.etag) {
    headers['If-None-Match'] = previousManifest.etag;
  }
  if (!forceRefresh && previousManifest?.source === sourceUrl && previousManifest.lastModified) {
    headers['If-Modified-Since'] = previousManifest.lastModified;
  }

  const response = await httpRequest(sourceUrl, headers, 0);
  if (response.statusCode === 304 && fs.existsSync(destinationPath)) {
    return {
      downloaded: false,
      etag: previousManifest?.etag,
      lastModified: previousManifest?.lastModified,
    };
  }

  if (response.statusCode < 200 || response.statusCode >= 300 || !response.body) {
    throw new Error(`Failed to download source URL ${sourceUrl}. HTTP ${response.statusCode}.`);
  }

  fs.writeFileSync(destinationPath, response.body);
  return {
    downloaded: true,
    etag: response.headers.etag,
    lastModified: response.headers['last-modified'],
  };
}

async function httpRequest(urlString: string, headers: Record<string, string>, redirectCount: number): Promise<{
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body?: Buffer;
}> {
  if (redirectCount > 5) {
    throw new Error(`Too many redirects while requesting ${urlString}`);
  }

  const url = new URL(urlString);
  const transport = url.protocol === 'https:' ? https : http;

  return await new Promise((resolve, reject) => {
    const request = transport.request(url, { method: 'GET', headers }, response => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const redirectedUrl = new URL(response.headers.location, url).toString();
        httpRequest(redirectedUrl, headers, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function stageFromZip(zipPath: string, schemaTargetDir: string, schematronTargetDir: string) {
  const extractionTemp = path.join(SOURCE_STAGE_DIR, '.extract-temp');
  removeDirIfExists(extractionTemp);
  ensureDir(extractionTemp);

  const zipEntries = listZipEntries(zipPath);
  const schemaPrefix = findPrefix(zipEntries, ['ISM/Schema/', 'Schema/', 'schemas/', 'BuildDependencies/ISM/Schema/']);
  const schematronPrefix = findPrefix(zipEntries, ['ISM/Schematron/', 'Schematron/', 'BuildDependencies/ISM/Schematron/']);

  if (!schemaPrefix || !schematronPrefix) {
    throw new Error(`Could not locate required Schema/Schematron prefixes in ZIP ${zipPath}`);
  }

  const extractTargets = new Set<string>([
    schemaPrefix.replace(/\/$/, ''),
    schematronPrefix.replace(/\/$/, ''),
  ]);

  execFileSync('tar', ['-xf', zipPath, '-C', extractionTemp, ...extractTargets], {
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  });

  const extractedSchema = path.join(extractionTemp, ...schemaPrefix.split('/').filter(Boolean));
  const extractedSchematron = path.join(extractionTemp, ...schematronPrefix.split('/').filter(Boolean));
  stageFromDirectory(extractedSchema, extractedSchematron, schemaTargetDir, schematronTargetDir);
}

function listZipEntries(zipPath: string): string[] {
  const output = execFileSync('tar', ['-tf', zipPath], { cwd: WORKSPACE_ROOT });
  return output.toString('utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
}

function findPrefix(entries: string[], candidates: string[]): string | undefined {
  for (const candidate of candidates) {
    const normalizedCandidate = candidate.replaceAll('\\', '/');
    if (entries.some(entry => entry.startsWith(normalizedCandidate))) {
      return normalizedCandidate;
    }
  }
  return undefined;
}

function stageFromDirectory(schemaSourceDir: string, schematronSourceDir: string, schemaTargetDir: string, schematronTargetDir: string) {
  if (!fs.existsSync(schemaSourceDir)) {
    throw new Error(`Schema source directory missing: ${schemaSourceDir}`);
  }
  if (!fs.existsSync(schematronSourceDir)) {
    throw new Error(`Schematron source directory missing: ${schematronSourceDir}`);
  }

  removeDirIfExists(schemaTargetDir);
  removeDirIfExists(schematronTargetDir);
  ensureDir(path.dirname(schemaTargetDir));
  ensureDir(path.dirname(schematronTargetDir));

  fs.cpSync(schemaSourceDir, schemaTargetDir, { recursive: true });
  fs.cpSync(schematronSourceDir, schematronTargetDir, { recursive: true });
}

function resolveSourceLayout(baseDir: string): { schemaPath?: string; schematronPath?: string } {
  const candidates = [
    {
      schemaPath: path.join(baseDir, SCHEMA_DIR_NAME),
      schematronPath: path.join(baseDir, SCHEMATRON_DIR_NAME),
    },
    {
      schemaPath: path.join(baseDir, LEGACY_SCHEMA_DIR_NAME),
      schematronPath: path.join(baseDir, SCHEMATRON_DIR_NAME),
    },
    {
      schemaPath: path.join(baseDir, 'ISM', 'Schema'),
      schematronPath: path.join(baseDir, 'ISM', 'Schematron'),
    },
    {
      schemaPath: path.join(baseDir, 'BuildDependencies', 'ISM', 'Schema'),
      schematronPath: path.join(baseDir, 'BuildDependencies', 'ISM', 'Schematron'),
    },
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.schemaPath) && fs.existsSync(candidate.schematronPath)) {
      return candidate;
    }
  }
  return {};
}

function detectSourceKind(sourceType: SourceOptions['sourceType'], source: string): SourceKind {
  if (sourceType && sourceType !== 'auto') {
    return sourceType;
  }
  if (/^https?:\/\//i.test(source)) {
    return 'url';
  }

  const resolvedPath = path.resolve(source);
  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isDirectory()) {
    return 'dir';
  }
  if (source.toLowerCase().endsWith('.zip') || (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile())) {
    return 'zip';
  }

  throw new Error(`Unable to detect source kind for ${source}. Set --source-type explicitly.`);
}

function parseDotEnv(envPath: string): Record<string, string> {
  if (!fs.existsSync(envPath)) {
    return {};
  }
  const parsed: Record<string, string> = {};
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = line.substring(0, equalsIndex).trim();
    let value = line.substring(equalsIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith('\'') && value.endsWith('\''))) {
      value = value.substring(1, value.length - 1);
    }
    parsed[key] = value;
  }
  return parsed;
}

function readSourceManifest(): SourceManifest | undefined {
  if (!fs.existsSync(SOURCE_MANIFEST_PATH)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(SOURCE_MANIFEST_PATH, 'utf8')) as SourceManifest;
  } catch {
    return undefined;
  }
}

function normalizeCacheFileName(source: string, sourceVersion?: string): string {
  const sourceUrl = new URL(source);
  const basename = path.basename(sourceUrl.pathname || 'source.zip') || 'source.zip';
  const safeBase = basename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const hash = createHash('sha256').update(source).digest('hex').substring(0, 12);
  const versionSuffix = sourceVersion ? `-${sourceVersion.replace(/[^a-zA-Z0-9._-]/g, '_')}` : '';
  return `${safeBase}${versionSuffix}-${hash}.zip`;
}

function toBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function ensureDir(dirPath: string) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirIfExists(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    fs.rmSync(dirPath, { recursive: true, force: true });
  }
}

function listFilesRecursive(dirPath: string): string[] {
  const results: string[] = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || !fs.existsSync(current)) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const resolved = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(resolved);
      } else {
        results.push(resolved);
      }
    }
  }
  return results;
}

function computeDirectoryFingerprint(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    return '';
  }
  const hash = createHash('sha256');
  const files = listFilesRecursive(dirPath)
    .map(filePath => path.relative(dirPath, filePath).replaceAll(path.sep, '/'))
    .sort();
  for (const relativeFilePath of files) {
    const absolutePath = path.join(dirPath, ...relativeFilePath.split('/'));
    const stats = fs.statSync(absolutePath);
    hash.update(relativeFilePath);
    hash.update(String(stats.size));
    hash.update(String(stats.mtimeMs));
  }
  return hash.digest('hex');
}

function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function discoverSchematronPath(schemaText: string, schemaPath: string, schematronRoot: string): string | undefined {
  const xmlModelMatch = schemaText.match(/<\?xml-model\s+href="([^"]+)"[^>]*schematypens="http:\/\/purl\.oclc\.org\/dsdl\/schematron"/i);
  if (!xmlModelMatch) {
    return undefined;
  }

  const href = xmlModelMatch[1];
  const directPath = path.normalize(path.resolve(path.dirname(schemaPath), href));
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  const normalizedHref = href.replaceAll('\\', '/');
  const schematronMarker = 'Schematron/';
  const markerIndex = normalizedHref.indexOf(schematronMarker);
  if (markerIndex >= 0) {
    const localRelativePath = normalizedHref.substring(markerIndex + schematronMarker.length);
    const localPath = path.normalize(path.join(schematronRoot, localRelativePath));
    if (fs.existsSync(localPath)) {
      return localPath;
    }
  }

  const ismFallback = path.join(schematronRoot, 'ISM', 'ISM_XML.sch');
  return fs.existsSync(ismFallback) ? ismFallback : undefined;
}

async function inputSchematron(inputPath: string, schematronRoot: string, outputDir: string, processedSchematron: Map<string, SchematronPackages>): Promise<SchematronPackages> {
  const normalizedPath = path.normalize(inputPath);
  console.log(`[SCH] Processing: ${path.basename(normalizedPath)}`);
  const existing = processedSchematron.get(normalizedPath);
  if (existing) {
    return existing;
  }

  const packages: SchematronPackages = {
    standalone: {
      g: new Graph({}),
      namespaces: {},
      imports: {},
    },
    convienence: {
      g: new Graph({}),
      namespaces: {},
      imports: {},
    },
  };

  processedSchematron.set(normalizedPath, packages);
  const standalone = packages.standalone;
  const convienence = packages.convienence;

  standalone.namespaces[RDF_URI] = 'rdf';
  standalone.namespaces[RDFS_URI] = 'rdfs';
  standalone.namespaces[DC_URI] = 'dc';
  standalone.namespaces[SKOS_URI] = 'skos';
  standalone.namespaces[SCHEMATRON_NS_URI] = 'ismsch';
  for (const [iri, prefix] of Object.entries(standalone.namespaces)) {
    namespaces.add(prefix, iri);
  }

  const text = fs.readFileSync(normalizedPath, 'utf8');
  const json = await xml2js.parseStringPromise(text);

  const docUri = `${URI_PREFIX}:schematron:${path.relative(schematronRoot, normalizedPath)
    .replaceAll(path.sep, ':')
    .replace(new RegExp(`${SCH_EXTENSION}$`), '')}`;
  standalone.g.add(docUri, 'rdf:type', 'ismsch:SchematronDocument');
  standalone.g.addL(docUri, 'dc:title', path.basename(normalizedPath));
  standalone.g.addL(docUri, 'ismsch:relativePath', path.relative(schematronRoot, normalizedPath).replaceAll(path.sep, '/'));

  const phaseMatch = text.match(/<\?schematron-phases\s+phaseids="([^"]+)"\?>/i);
  if (phaseMatch) {
    for (const phaseId of phaseMatch[1].split(/\s+/).filter(Boolean)) {
      const phaseUri = `${docUri}#phase-${encodeURIComponent(phaseId)}`;
      standalone.g.add(phaseUri, 'rdf:type', 'ismsch:ExecutionPhase');
      standalone.g.add(docUri, 'ismsch:hasExecutionPhase', phaseUri);
      standalone.g.addL(phaseUri, 'ismsch:phaseId', phaseId);
    }
  }

  for (const [rootKey, rootValue] of Object.entries(json as Record<string, any>)) {
    if (!rootKey.endsWith(':schema')) {
      continue;
    }

    const schema = rootValue as any;
    const schemaUri = `${docUri}#schema`;
    standalone.g.add(schemaUri, 'rdf:type', 'ismsch:Schema');
    standalone.g.add(docUri, 'ismsch:definesSchema', schemaUri);

    const schemaAttributes = schema.$ ?? {};
    if (schemaAttributes.queryBinding) {
      standalone.g.addL(schemaUri, 'ismsch:queryBinding', schemaAttributes.queryBinding);
    }

    for (const namespaceNode of asArray(schema['sch:ns'])) {
      const ns = namespaceNode.$ ?? {};
      const nsUri = `${schemaUri}#ns-${encodeURIComponent(ns.prefix ?? 'unknown')}`;
      standalone.g.add(nsUri, 'rdf:type', 'ismsch:NamespaceDeclaration');
      standalone.g.add(schemaUri, 'ismsch:hasNamespaceDeclaration', nsUri);
      if (ns.prefix) {
        standalone.g.addL(nsUri, 'ismsch:prefix', ns.prefix);
      }
      if (ns.uri) {
        standalone.g.addL(nsUri, 'ismsch:namespaceUri', ns.uri);
      }
    }

    let patternIndex = 0;
    for (const patternNode of asArray(schema['sch:pattern'])) {
      patternIndex += 1;
      const patternAttributes = patternNode.$ ?? {};
      const patternId = patternAttributes.id ?? `pattern-${patternIndex}`;
      const patternUri = `${schemaUri}#pattern-${encodeURIComponent(patternId)}`;
      standalone.g.add(patternUri, 'rdf:type', 'ismsch:Pattern');
      standalone.g.add(schemaUri, 'ismsch:hasPattern', patternUri);
      standalone.g.addL(patternUri, 'ismsch:patternId', patternId);
      if (patternAttributes.abstract === 'true') {
        standalone.g.add(patternUri, 'rdf:type', 'ismsch:AbstractPattern');
      }
      if (patternAttributes['is-a']) {
        standalone.g.addL(patternUri, 'ismsch:instantiatesPattern', patternAttributes['is-a']);
      }

      let ruleIndex = 0;
      for (const ruleNode of asArray(patternNode['sch:rule'])) {
        ruleIndex += 1;
        const ruleAttributes = ruleNode.$ ?? {};
        const ruleId = ruleAttributes.id ?? `rule-${ruleIndex}`;
        const ruleUri = `${patternUri}#rule-${encodeURIComponent(ruleId)}`;
        standalone.g.add(ruleUri, 'rdf:type', 'ismsch:Rule');
        standalone.g.add(patternUri, 'ismsch:hasRule', ruleUri);
        standalone.g.addL(ruleUri, 'ismsch:ruleId', ruleId);
        if (ruleAttributes.context) {
          standalone.g.addL(ruleUri, 'ismsch:context', ruleAttributes.context);
        }
        if (ruleAttributes.abstract === 'true') {
          standalone.g.add(ruleUri, 'rdf:type', 'ismsch:AbstractRule');
        }

        let assertIndex = 0;
        for (const assertNode of asArray(ruleNode['sch:assert'])) {
          assertIndex += 1;
          const assertAttributes = assertNode.$ ?? {};
          const assertUri = `${ruleUri}#assert-${assertIndex}`;
          standalone.g.add(assertUri, 'rdf:type', 'ismsch:Assert');
          standalone.g.add(ruleUri, 'ismsch:hasAssert', assertUri);
          if (assertAttributes.test) {
            standalone.g.addL(assertUri, 'ismsch:test', assertAttributes.test);
          }
          if (assertAttributes.flag) {
            standalone.g.addL(assertUri, 'ismsch:flag', assertAttributes.flag);
          }
          if (assertAttributes.role) {
            standalone.g.addL(assertUri, 'ismsch:role', assertAttributes.role);
          }
          const textValue = normalizeSchematronNodeText(assertNode);
          if (textValue) {
            standalone.g.addL(assertUri, 'ismsch:text', textValue);
          }
        }

        let reportIndex = 0;
        for (const reportNode of asArray(ruleNode['sch:report'])) {
          reportIndex += 1;
          const reportAttributes = reportNode.$ ?? {};
          const reportUri = `${ruleUri}#report-${reportIndex}`;
          standalone.g.add(reportUri, 'rdf:type', 'ismsch:Report');
          standalone.g.add(ruleUri, 'ismsch:hasReport', reportUri);
          if (reportAttributes.test) {
            standalone.g.addL(reportUri, 'ismsch:test', reportAttributes.test);
          }
          if (reportAttributes.flag) {
            standalone.g.addL(reportUri, 'ismsch:flag', reportAttributes.flag);
          }
          if (reportAttributes.role) {
            standalone.g.addL(reportUri, 'ismsch:role', reportAttributes.role);
          }
          const textValue = normalizeSchematronNodeText(reportNode);
          if (textValue) {
            standalone.g.addL(reportUri, 'ismsch:text', textValue);
          }
        }
      }
    }

    for (const includeNode of asArray(schema['sch:include'])) {
      const includeAttributes = includeNode.$ ?? {};
      if (!includeAttributes.href) {
        continue;
      }
      const includePath = path.normalize(path.join(path.dirname(normalizedPath), includeAttributes.href));
      const includeUri = `${schemaUri}#include-${encodeURIComponent(includeAttributes.href)}`;
      standalone.g.add(includeUri, 'rdf:type', 'ismsch:Include');
      standalone.g.add(schemaUri, 'ismsch:includes', includeUri);
      standalone.g.addL(includeUri, 'ismsch:href', includeAttributes.href);
      standalone.g.add(includeUri, 'ismsch:targetDocument', `${URI_PREFIX}:schematron:${path.relative(schematronRoot, includePath)
        .replaceAll(path.sep, ':')
        .replace(new RegExp(`${SCH_EXTENSION}$`), '')}`);

      const imported = await inputSchematron(includePath, schematronRoot, outputDir, processedSchematron);
      standalone.imports[includeAttributes.href] = [includePath, imported.standalone];
      mergeSchematron(new Set<string>(), includePath, convienence, imported.standalone);
    }
  }

  convienence.g.addAll(standalone.g);
  Object.assign(convienence.namespaces, standalone.namespaces);

  const relativeDir = path.relative(schematronRoot, path.dirname(normalizedPath));
  const basename = path.basename(normalizedPath, SCH_EXTENSION);
  await writeGraphPackage(convienence, path.join(outputDir, 'schematron', 'convenience'), relativeDir, basename);
  await writeGraphPackage(standalone, path.join(outputDir, 'schematron', 'standalone'), relativeDir, basename);

  return packages;
}

function normalizeSchematronNodeText(node: any): string {
  if (!node) {
    return '';
  }

  const values: string[] = [];
  const collect = (candidate: any) => {
    if (candidate === null || candidate === undefined) {
      return;
    }
    if (typeof candidate === 'string') {
      values.push(candidate);
      return;
    }
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        collect(item);
      }
      return;
    }
    if (typeof candidate === 'object') {
      if (typeof candidate._ === 'string') {
        values.push(candidate._);
      }
      for (const [key, value] of Object.entries(candidate)) {
        if (key === '$' || key === '_') {
          continue;
        }
        if (key === 'sch:value-of') {
          for (const valueOfNode of asArray(value)) {
            const select = (valueOfNode as any).$?.select;
            if (select) {
              values.push(`[value-of ${select}]`);
            }
          }
          continue;
        }
        collect(value);
      }
    }
  };

  collect(node);
  return values.join(' ').replace(/\s+/g, ' ').trim();
}

function mergeSchematron(merged: Set<string>, importPath: string, convienence: Package, standalone: Package) {
  if (!merged.has(importPath)) {
    merged.add(importPath);
    for (const x of Object.entries(standalone.imports)) {
      mergeSchematron(merged, x[0] as string, convienence, x[1][1]);
    }
    Object.assign(convienence.namespaces, standalone.namespaces);
    convienence.g.addAll(standalone.g);
  }
}

async function writeGraphPackage(p: Package, outputDir: string, relative: string, basename: string) {
  const context = _.invert(p.namespaces);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  outputDir = path.join(outputDir, relative);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const quads: Quad[] = [];
  p.g.find().forEach((triple: any) => {
    const subject = triple._s.startsWith('_:') ? rdf.blankNode(triple._s.slice(2)) : rdf.namedNode(triple._s);
    const predicate = rdf.namedNode(triple._p);
    let object: any;
    if (triple._o.type === 'literal') {
      object = rdf.literal(triple._o.value);
    } else if (triple._o.type === 'bnode' || triple._o.value.startsWith('_:')) {
      object = rdf.blankNode(triple._o.value.replace(/^_:/, ''));
    } else {
      object = rdf.namedNode(triple._o.value);
    }
    quads.push(rdf.quad(subject, predicate, object));
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
      });
      input.push(null);
    }
  });

  const jsonld: string = await getStream(jsonldSerializer.import(input) as AnyStream);
  fs.writeFileSync(path.join(outputDir, `${basename}.jsonld`), jsonld);

  let turtle: string = await write(quads, { prefixes: context });
  turtle = convertRdfListToTurtleList(turtle);
  fs.writeFileSync(path.join(outputDir, `${basename}.ttl`), turtle);

  const triples = triplesToString(quads);
  fs.writeFileSync(path.join(outputDir, `${basename}.nt`), triples);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

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

