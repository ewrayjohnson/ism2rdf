import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { Graph, namespaces } from '@entryscape/rdfjson';
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
const DCTERMS_URI = 'http://purl.org/dc/terms/';
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
const OUTPUT_BASE_DIR = path.join(WORKSPACE_ROOT, 'out');
const CCO_MARKING_BRIDGE_SOURCE = path.join(INPUT_DIR, 'config', 'cco-marking-bridge.jsonld');
const RDF_TYPE = 'rdf:type';
const ONTOLOGY_TYPE = 'owl:Ontology';
const IMPORTS_PROPERTY = 'owl:imports';
const URI_PREFIX = 'urn:us:gov:ic';
const SCHEMATRON_NS_URI = 'urn:us:gov:ic:ism2rdf:schematron#';
const DATATYPE_PROPERTY_LABEL_OVERRIDES: Record<string, string> = {
  atomicEnergyMarkings: 'Atomic Energy Markings',
  CESVersion: 'CES Version',
  classification: 'Classification',
  classificationReason: 'Classification Reason',
  classifiedBy: 'Classified By',
  compilationReason: 'Compilation Reason',
  compliesWith: 'Complies With',
  createDate: 'Create Date',
  cuiBasic: 'CUI Basic',
  cuiControlledBy: 'CUI Controlled By',
  cuiControlledByOffice: 'CUI Controlled By Office',
  cuiDecontrolDate: 'CUI Decontrol Date',
  cuiDecontrolEvent: 'CUI Decontrol Event',
  cuiPOC: 'CUI POC',
  cuiSpecified: 'CUI Specified',
  declassDate: 'Declass Date',
  declassEvent: 'Declass Event',
  declassException: 'Declass Exception',
  derivativelyClassifiedBy: 'Derivatively Classified By',
  derivedFrom: 'Derived From',
  DESVersion: 'DES Version',
  displayOnlyTo: 'Display Only To',
  disseminationControls: 'Dissemination Controls',
  excludeFromRollup: 'Exclude From Rollup',
  exemptFrom: 'Exempt From',
  externalNotice: 'External Notice',
  FGIsourceOpen: 'FGI Source Open',
  FGIsourceProtected: 'FGI Source Protected',
  handleViaChannels: 'Handle Via Channels',
  hasApproximateMarkings: 'Has Approximate Markings',
  highWaterNATO: 'High Water NATO',
  id: 'ID',
  identifier: 'Identifier',
  IDReference: 'ID Reference',
  ISMCATCESVersion: 'ISMCAT CES Version',
  joint: 'Joint',
  noAggregation: 'No Aggregation',
  nonICmarkings: 'Non IC Markings',
  nonUSControls: 'Non US Controls',
  noticeDate: 'Notice Date',
  noticeProseID: 'Notice Prose ID',
  noticeReason: 'Notice Reason',
  noticeType: 'Notice Type',
  ownerProducer: 'Owner Producer',
  pocType: 'POC Type',
  qualifier: 'Qualifier',
  releasableTo: 'Releasable To',
  resourceElement: 'Resource Element',
  SARIdentifier: 'SAR Identifier',
  SCIcontrols: 'SCI Controls',
  secondBannerLine: 'Second Banner Line',
  TESVersion: 'TES Version',
  unregisteredNoticeType: 'Unregistered Notice Type',
  usagency: 'US Agency',
  usgovagency: 'US Gov Agency',
};
const DATATYPE_PROPERTY_LABEL_TOKEN_OVERRIDES: Record<string, string> = {
  CES: 'CES',
  CUI: 'CUI',
  DES: 'DES',
  FGI: 'FGI',
  IC: 'IC',
  ID: 'ID',
  ISMCAT: 'ISMCAT',
  NATO: 'NATO',
  POC: 'POC',
  SAR: 'SAR',
  SCI: 'SCI',
  TES: 'TES',
  US: 'US',
  URI: 'URI',
  URL: 'URL',
  XML: 'XML',
  XSD: 'XSD',
};
type OutputCategory = 'Schema' | 'Schematron';
type OutputMode = 'standalone' | 'convenience';

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

type PrepareSourceResult = {
  schemaRoot: string;
  schematronRoot: string;
}

type TrigTdfManifestEntry = {
  graphName: string;
  trigPath: string;
  tdfPath: string;
  payloadSha256: string;
  relativePath: string;
  basename: string;
  category: OutputCategory;
  mode: OutputMode;
  createdAt: string;
}

type SimpleTypeInfo = {
  isTokenList: boolean;
  listItemType?: string;
}

type AttributeListInfo = {
  isTokenList: boolean;
}

let blankIndex = 0;
const trigTdfManifestEntries: TrigTdfManifestEntry[] = [];

// Global map accumulated across all processed XSD files so cross-schema type lookups work.
// e.g. releasableTo in IC-ISM.xsd references CVEnumISMCATRelTo defined in a different imported file.
const globalSimpleTypeInfoByLocalName = new Map<string, SimpleTypeInfo>();
const globalAttributeListInfoByLocalName = new Map<string, AttributeListInfo>();

(async () => {
  const defaultPrefixes = JSON.parse(fs.readFileSync(path.join(INPUT_DIR, 'config', 'defaultPrefixes.json'), 'utf8'));
  for (const [prefix, iri] of Object.entries(defaultPrefixes)) {
    namespaces.add(prefix, iri);
  }

  const sourceResult = await prepareAuthoritativeSources();

  const schemaRoot = sourceResult.schemaRoot;
  const schematronRoot = sourceResult.schematronRoot;
  const outputDir = resolveOutputDir();
  console.log(`Output directory: ${outputDir}`);

  const processed: Map<string, Packages> = new Map();
  const processedSchematron: Map<string, SchematronPackages> = new Map();

  const schemaFiles = listFilesRecursive(schemaRoot)
    .filter(filePath => filePath.toLowerCase().endsWith(XSD_EXTENSION))
    .sort();

  if (schemaFiles.length === 0) {
    throw new Error(`No schema files found under ${schemaRoot}`);
  }

  await preloadGlobalTypeAndAttributeListInfo(schemaFiles);

  for (const schemaFile of schemaFiles) {
    await input(schemaFile, processed, processedSchematron);
  }

  writeOutputManifests();
  copySchemaBridgeArtifacts();

  console.log(`Processed ${processed.size} XSD documents`);
  console.log(`Processed ${processedSchematron.size} Schematron documents`);

  async function preloadGlobalTypeAndAttributeListInfo(schemaFilepaths: string[]) {
    const parsedSchemas: Array<{ schema: any; xsdPrefix: string }> = [];

    for (const schemaFilepath of schemaFilepaths) {
      const schemaText = fs.readFileSync(schemaFilepath, 'utf8');
      const parsed = await xml2js.parseStringPromise(schemaText);
      const schemaEntry = Object.entries(parsed).find(([key]) => key.endsWith(':schema'));
      if (!schemaEntry) {
        continue;
      }

      const schema: any = schemaEntry[1];
      const attrs = schema?.$ ?? {};
      const xsdPrefixEntry = Object.entries(attrs).find(([k, v]) => k.startsWith('xmlns:') && v === XML_SCHEMA_URI);
      const xsdPrefix = xsdPrefixEntry ? xsdPrefixEntry[0].split(':')[1] : 'xs';
      parsedSchemas.push({ schema, xsdPrefix });
    }

    for (const { schema, xsdPrefix } of parsedSchemas) {
      const simpleTypes = asArray(schema[`${xsdPrefix}:simpleType`]);
      for (const simpleType of simpleTypes) {
        const typeName = simpleType?.['$']?.name;
        if (!typeName) {
          continue;
        }
        const listItemType = findListItemTypeInSimpleType(simpleType, xsdPrefix);
        const existing = globalSimpleTypeInfoByLocalName.get(typeName);
        globalSimpleTypeInfoByLocalName.set(typeName, {
          isTokenList: Boolean(existing?.isTokenList || listItemType),
          listItemType: existing?.listItemType ?? listItemType,
        });
      }
    }

    for (const { schema, xsdPrefix } of parsedSchemas) {
      collectAttributeListInfo(schema, xsdPrefix, globalSimpleTypeInfoByLocalName);
    }
  }

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
      registerOntologyDocumentNamespace(p.standalone.namespaces, ontologyUri);
      registerOntologyDocumentNamespace(p.convienence.namespaces, ontologyUri);
      processed.set(inputFilepath, p);
      const standalone = p.standalone;
      const convienence = p.convienence;
      standalone.g.add(ontologyUri, RDF_TYPE, ONTOLOGY_TYPE);
      const text = fs.readFileSync(inputFilepath, 'utf8');
      const json = await xml2js.parseStringPromise(text);
      // Emit ontology-level metadata after the JSON is available but before per-construct
      // processing so the triples land in every output that includes the ontology node.
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
              // Skip namespace URIs that contain '-StopBrowserRendering' — a deliberate
              // fake suffix used in IC XSDs (e.g. xhtml) to prevent browser rendering.
              // Such URIs are never used as RDF namespaces and produce invalid prefix decls.
              if (ns.includes('-StopBrowserRendering')) {
                return acc;
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

          // Map schema-level annotation to rdfs:comment on the owl:Ontology node.
          // xml2js parses xs:annotation/xs:documentation as schema[xsdPrefix+':annotation'][0][...].
          // The documentation may contain HTML (xhtml:p) so we use removeWhitespace to flatten it.
          const schemaAnnotationDoc = schema[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
          if (schemaAnnotationDoc) {
            standalone.namespaces[RDFS_URI] = 'rdfs';
            for (const doc of (Array.isArray(schemaAnnotationDoc) ? schemaAnnotationDoc : [schemaAnnotationDoc])) {
              const text = removeWhitespace(doc);
              if (text) {
                standalone.g.addL(ontologyUri, 'rdfs:comment', text);
              }
            }
          }

          // Map xs:schema/@version to owl:versionInfo on the ontology node.
          const schemaVersion = $['version'];
          if (schemaVersion) {
            standalone.namespaces[OWL_URI] = 'owl';
            standalone.g.addL(ontologyUri, 'owl:versionInfo', schemaVersion);
          }

          // Map ISM self-marking attributes on the xs:schema root (e.g. ism:createDate,
          // ism:DESVersion, ism:ISMCATCESVersion, ism:classification, ism:ownerProducer,
          // ism:compliesWith) are emitted directly as ism:* predicates on the ontology node.
          // Emit ISM self-marking attributes directly as ism:* predicates on the ontology node.
                    // Also emit rdfs:subPropertyOf links for ISM header properties to generic superproperties for interoperability.
                    // Only do this for properties where the mapping is semantically appropriate.
                    // This is done once per ontology document (not per instance).
                    // These are the mappings:
                    // ism:classification rdfs:subPropertyOf dc:rights
                    // ism:ownerProducer  rdfs:subPropertyOf dc:publisher
                    // ism:createDate     rdfs:subPropertyOf dc:date
                    // ism:compliesWith   rdfs:subPropertyOf dcterms:conformsTo
                    // (DESVersion and ISMCATCESVersion are not mapped, as there is no clear generic parent)
                    // Add these triples to the ontology graph:
                    standalone.namespaces[RDFS_URI] = 'rdfs';
                    standalone.namespaces[DC_URI] = 'dc';
                    standalone.namespaces[DCTERMS_URI] = 'dcterms';
                    standalone.g.add('ism:classification', 'rdfs:subPropertyOf', 'dc:rights');
                    standalone.g.add('ism:ownerProducer', 'rdfs:subPropertyOf', 'dc:publisher');
                    standalone.g.add('ism:createDate', 'rdfs:subPropertyOf', 'dc:date');
                    standalone.g.add('ism:compliesWith', 'rdfs:subPropertyOf', 'dcterms:conformsTo');
          const ismCreateDate = $['ism:createDate'];
          if (ismCreateDate) {
            standalone.g.addL(ontologyUri, 'ism:createDate', ismCreateDate);
          }
          const ismDESVersion = $['ism:DESVersion'];
          if (ismDESVersion) {
            standalone.g.addL(ontologyUri, 'ism:DESVersion', ismDESVersion);
          }
          const ismCESVersion = $['ism:ISMCATCESVersion'];
          if (ismCESVersion) {
            standalone.g.addL(ontologyUri, 'ism:ISMCATCESVersion', ismCESVersion);
          }
          const ismClassification = $['ism:classification'];
          if (ismClassification) {
            standalone.g.addL(ontologyUri, 'ism:classification', ismClassification);
          }
          const ismOwnerProducer = $['ism:ownerProducer'];
          if (ismOwnerProducer) {
            standalone.g.addL(ontologyUri, 'ism:ownerProducer', ismOwnerProducer);
          }
          const ismCompliesWith = $['ism:compliesWith'];
          if (ismCompliesWith) {
            standalone.g.addL(ontologyUri, 'ism:compliesWith', ismCompliesWith);
          }

          if (xsdPrefix) {
            // Process imports first so that imported simple types (e.g. CVEnumISMCATRelTo
            // from ISMCAT) are in globalSimpleTypeInfoByLocalName before this schema's
            // attributes and groups are emitted and token-list detection is performed.
            const importsEarly = schema[`${xsdPrefix}:import`];
            if (importsEarly) {
              const allEarly = (importsEarly as any[]).map((e: any) => e.$ as Import);
              const dirnameEarly = path.dirname(inputFilepath);
              const mergedEarly = new Set<string>();
              for (const importSpec of allEarly) {
                const schemaLocation = importSpec.schemaLocation;
                const importPath: string = path.join(dirnameEarly, schemaLocation);
                const imported = await input(importPath, processed, processedSchematron);
                standalone.imports[schemaLocation] = [importPath, imported.standalone];
                merge(mergedEarly, importPath, convienence, imported.standalone);
              }
            }

            const elements = schema[`${xsdPrefix}:element`];
            const attributes = schema[`${xsdPrefix}:attribute`];
            const simpleTypeInfoByName = collectSimpleTypeInfo(schema, xsdPrefix);
            collectAttributeListInfo(schema, xsdPrefix, simpleTypeInfoByName);
            if (attributes) {
              for (const anAttribute of attributes) {
                if (anAttribute) {
                  const $ = anAttribute.$;
                  if ($) {
                    const attributeName = $.name;
                    let attributeType = $.type;
                    let listItemType: string | undefined;

                    // When no type="..." attribute is present the range is expressed as an
                    // inline xs:simpleType child. Resolve its xs:restriction/@base as the range type.
                    if (!attributeType) {
                      const inlineSimpleType = anAttribute[`${xsdPrefix}:simpleType`]?.[0];
                      const inlineBase = inlineSimpleType?.[`${xsdPrefix}:restriction`]?.[0]?.['$']?.base;
                      if (inlineBase) {
                        attributeType = inlineBase;
                      }
                      const inlineListItemType = findListItemTypeInSimpleType(inlineSimpleType, xsdPrefix);
                      if (inlineListItemType) {
                        listItemType = inlineListItemType;
                      }
                    }

                    if (attributeType && attributeName) {
                      const attributeId = `${idPrefix}${attributeName}`;
                      standalone.namespaces[OWL_URI] = 'owl';
                      standalone.namespaces[RDFS_URI] = 'rdfs';
                      standalone.namespaces[RDF_URI] = 'rdf';
                      standalone.namespaces[DC_URI] = 'dc';
                      standalone.namespaces[SHACL_URI] = 'sh';
                      standalone.g.add(attributeId, RDF_TYPE, 'owl:DatatypeProperty');
                      standalone.g.addL(attributeId, 'rdfs:label', buildDatatypePropertyLabel(attributeName));
                      const rangeType = normalizeAttributeRangeType(attributeType, xsdPrefix);
                      standalone.g.add(attributeId, 'rdfs:range', rangeType);

                      const referencedTypeLocalName = toLocalName(attributeType);
                      const typeInfo = referencedTypeLocalName
                        ? (simpleTypeInfoByName.get(referencedTypeLocalName) ?? globalSimpleTypeInfoByLocalName.get(referencedTypeLocalName))
                        : undefined;
                      const supportsTokenList = Boolean(listItemType || typeInfo?.isTokenList);
                      if (!supportsTokenList) {
                        standalone.g.add(attributeId, RDF_TYPE, 'owl:FunctionalProperty');
                      }
                      const documentation = anAttribute[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                      if (documentation) {
                        for (const aComment of (Array.isArray(documentation) ? documentation : [documentation])) {
                          const comment = removeWhitespace(aComment);
                          standalone.g.addL(attributeId, 'rdfs:comment', comment);
                        }
                      }
                    }
                  }
                } else {
                  debugger;
                }
              }
            }
            // Emit top-level xs:element declarations as owl:Class resources.
            // Each element is typed with the named complexType or simpleType it references,
            // expressed as rdfs:subClassOf when the type is local (no namespace prefix).
            if (elements) {
              standalone.namespaces[OWL_URI] = 'owl';
              standalone.namespaces[RDFS_URI] = 'rdfs';
              for (const anElement of elements) {
                const elemAttrs = anElement?.['$'];
                if (!elemAttrs?.name) {
                  continue;
                }
                const elemId = `${idPrefix}${elemAttrs.name}`;
                standalone.g.add(elemId, RDF_TYPE, 'owl:Class');
                const elemDoc = anElement[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                if (elemDoc) {
                  for (const d of (Array.isArray(elemDoc) ? elemDoc : [elemDoc])) {
                    const comment = removeWhitespace(d);
                    if (comment) {
                      standalone.g.addL(elemId, 'rdfs:comment', comment);
                    }
                  }
                }
                if (elemAttrs.type) {
                  // Strip the namespace prefix to get the local type name,
                  // then form the type's URI in the same default namespace.
                  const colonIdx = elemAttrs.type.indexOf(':');
                  const typeLocalName = colonIdx >= 0 ? elemAttrs.type.substring(colonIdx + 1) : elemAttrs.type;
                  standalone.g.add(elemId, 'rdfs:subClassOf', `${idPrefix}${typeLocalName}`);
                }
              }
            }

            // Emit xs:complexType declarations as owl:Class resources.
            // simpleContent/complexContent extensions are mapped to rdfs:subClassOf the base class.
            const complexTypes = schema[`${xsdPrefix}:complexType`];
            if (complexTypes) {
              standalone.namespaces[OWL_URI] = 'owl';
              standalone.namespaces[RDFS_URI] = 'rdfs';
              for (const aComplexType of complexTypes) {
                const ctAttrs = aComplexType?.['$'];
                if (!ctAttrs?.name) {
                  continue;
                }
                const ctId = `${idPrefix}${ctAttrs.name}`;
                standalone.g.add(ctId, RDF_TYPE, 'owl:Class');
                const ctDoc = aComplexType[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                if (ctDoc) {
                  for (const d of (Array.isArray(ctDoc) ? ctDoc : [ctDoc])) {
                    const comment = removeWhitespace(d);
                    if (comment) {
                      standalone.g.addL(ctId, 'rdfs:comment', comment);
                    }
                  }
                }
                // Resolve xs:simpleContent/xs:extension and xs:complexContent/xs:extension @base.
                const contentNode = aComplexType[`${xsdPrefix}:simpleContent`]?.[0]
                  ?? aComplexType[`${xsdPrefix}:complexContent`]?.[0];
                const extensionBase = contentNode?.[`${xsdPrefix}:extension`]?.[0]?.['$']?.base
                  ?? contentNode?.[`${xsdPrefix}:restriction`]?.[0]?.['$']?.base;
                if (extensionBase) {
                  const colonIdx = extensionBase.indexOf(':');
                  const baseLocalName = colonIdx >= 0 ? extensionBase.substring(colonIdx + 1) : extensionBase;
                  standalone.g.add(ctId, 'rdfs:subClassOf', `${idPrefix}${baseLocalName}`);
                }

                for (const memberAttr of asArray(aComplexType[`${xsdPrefix}:attribute`])) {
                  const memberName = memberAttr?.['$']?.name ?? toLocalName(memberAttr?.['$']?.ref ?? '');
                  if (!memberName) {
                    continue;
                  }
                  const memberPropertyId = `${idPrefix}${memberName}`;
                  const card = resolveCardinalityFromUse(memberAttr?.['$']?.use);
                  const isList = isTokenListAttribute(schema, xsdPrefix, memberName, simpleTypeInfoByName);
                  addOwlCardinalityRestriction(standalone, ctId, memberPropertyId, card.min, card.max, isList);
                }

                const extensionNode = contentNode?.[`${xsdPrefix}:extension`]?.[0]
                  ?? contentNode?.[`${xsdPrefix}:restriction`]?.[0];
                for (const memberAttr of asArray(extensionNode?.[`${xsdPrefix}:attribute`])) {
                  const memberName = memberAttr?.['$']?.name ?? toLocalName(memberAttr?.['$']?.ref ?? '');
                  if (!memberName) {
                    continue;
                  }
                  const memberPropertyId = `${idPrefix}${memberName}`;
                  const card = resolveCardinalityFromUse(memberAttr?.['$']?.use);
                  const isList = isTokenListAttribute(schema, xsdPrefix, memberName, simpleTypeInfoByName);
                  addOwlCardinalityRestriction(standalone, ctId, memberPropertyId, card.min, card.max, isList);
                }
              }
            }

            // Emit xs:attributeGroup declarations as owl:Class grouping nodes.
            // Member attributes (direct and via nested attributeGroup refs) are linked via
            // rdfs:member so consumers can navigate the group structure.
            const attributeGroups = schema[`${xsdPrefix}:attributeGroup`];
            if (attributeGroups) {
              standalone.namespaces[OWL_URI] = 'owl';
              standalone.namespaces[RDFS_URI] = 'rdfs';
              for (const anAttrGroup of attributeGroups) {
                const agAttrs = anAttrGroup?.['$'];
                if (!agAttrs?.name) {
                  continue;
                }
                const agId = `${idPrefix}${agAttrs.name}`;
                standalone.g.add(agId, RDF_TYPE, 'owl:Class');
                const agDoc = anAttrGroup[`${xsdPrefix}:annotation`]?.[0]?.[`${xsdPrefix}:documentation`];
                if (agDoc) {
                  for (const d of (Array.isArray(agDoc) ? agDoc : [agDoc])) {
                    const comment = removeWhitespace(d);
                    if (comment) {
                      standalone.g.addL(agId, 'rdfs:comment', comment);
                    }
                  }
                }
                // Link member attributes as rdfs:member of this group.
                for (const memberAttr of asArray(anAttrGroup[`${xsdPrefix}:attribute`])) {
                  const memberName = memberAttr?.['$']?.name ?? toLocalName(memberAttr?.['$']?.ref ?? '');
                  if (memberName) {
                    const memberPropertyId = `${idPrefix}${memberName}`;
                    standalone.g.add(agId, 'rdfs:member', memberPropertyId);
                    const card = resolveCardinalityFromUse(memberAttr?.['$']?.use);
                    const isList = isTokenListAttribute(schema, xsdPrefix, memberName, simpleTypeInfoByName);
                    addOwlCardinalityRestriction(standalone, agId, memberPropertyId, card.min, card.max, isList);
                  }
                }
                // Link nested attributeGroup references by their @ref name.
                for (const refGroup of asArray(anAttrGroup[`${xsdPrefix}:attributeGroup`])) {
                  const refName = refGroup?.['$']?.ref;
                  if (refName) {
                    const colonIdx = refName.indexOf(':');
                    const refLocalName = colonIdx >= 0 ? refName.substring(colonIdx + 1) : refName;
                    standalone.g.add(agId, 'rdfs:subClassOf', `${idPrefix}${refLocalName}`);
                  }
                }
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
                        const notation = anEnum.$.value;
                        const conceptId = notation.startsWith(URI_PREFIX) ? notation : `${idPrefix}${notation}`;
                        const annotation = anEnum[`${xsdPrefix}:annotation`];
                        const documentation = annotation && annotation[0][`${xsdPrefix}:documentation`];
                        // Always emit the concept even when documentation is absent;
                        // only skip the prefLabel assignment, and warn so the gap is visible.
                        if (!documentation) {
                          console.warn(`[WARN] Enumeration value "${notation}" in ${path.basename(inputFilepath)} has no documentation — concept emitted without prefLabel.`);
                        }
                        const prefLabel = documentation ? removeWhitespace(documentation[0]) : undefined;
                        concepts.push({ notation, prefLabel, conceptId });
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
                  // Handle nested xs:simpleType children inside xs:union.
                  const nestedTypes = union[0][`${xsdPrefix}:simpleType`];
                  if (nestedTypes) {
                    for (const aUnionSimpleType of nestedTypes) {
                      handleRestrictions(aUnionSimpleType);
                    }
                  }
                  // Handle xs:union/@memberTypes — a space-delimited list of QName references
                  // to named simpleTypes already in scope. Look each up and recurse into it.
                  const memberTypesAttr: string | undefined = union[0]?.['$']?.memberTypes;
                  if (memberTypesAttr) {
                    for (const qname of memberTypesAttr.trim().split(/\s+/)) {
                      // Skip XSD built-in types (xs:date, xs:string, etc.) — they carry no enumeration.
                      if (qname.startsWith(`${xsdPrefix}:`)) {
                        continue;
                      }
                      // Resolve prefix:localName using the namespaces collected for this schema.
                      const colonIdx = qname.indexOf(':');
                      const localName = colonIdx >= 0 ? qname.substring(colonIdx + 1) : qname;
                      // Find the named simpleType in this schema's own simpleType list.
                      const referencedType = simpleTypes?.find((st: any) => st?.['$']?.name === localName);
                      if (referencedType) {
                        handleRestrictions(referencedType);
                      }
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
                // Only concrete notation concepts should be top concepts.
                // Pattern-only pseudo concepts are modeled for SHACL validation,
                // but strict upsert validators may reject them in skos:hasTopConcept.
                if (aConcept.notation) {
                  standalone.g.add(schemeId, 'skos:hasTopConcept', aConcept.conceptId);
                }
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
                  const shapeId = `${aConcept.conceptId}:Shape`;
                  standalone.g.add(shapeId, RDF_TYPE, 'sh:NodeShape');
                  standalone.g.add(shapeId, 'sh:targetNode', aConcept.conceptId);

                  const restriction = standalone.g.addL(null, 'sh:pattern', aConcept.pattern);
                  standalone.g.add(restriction._s, RDF_TYPE, 'sh:PropertyShape');
                  standalone.g.add(restriction._s, 'sh:path', 'skos:notation');

                  const blank = { type: 'bnode', value: restriction._s };
                  standalone.g.add(shapeId, 'sh:property', blank);
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
            await writeGraph(convienence, 'Schema', 'convenience');

            Object.keys(standalone.imports).forEach((schemaLocation) => {
              // Derive the import's ontology URI the same way the main ontologyUri is built
              // (URI_PREFIX + path relative to schemaRoot with path separators replaced by colons)
              // rather than splicing the raw schemaLocation string, which produced broken URIs like
              // urn:us:gov:ic:../ISMCAT/Tetragraph.jsonld.
              const [importAbsPath] = standalone.imports[schemaLocation];
              const importOntologyUri = URI_PREFIX + importAbsPath
                .substring(0, importAbsPath.lastIndexOf('.xsd'))
                .substring(schemaRoot.length)
                .replaceAll(path.sep, ':');
              registerOntologyDocumentNamespace(standalone.namespaces, importOntologyUri);
              standalone.g.add(ontologyUri, IMPORTS_PROPERTY, importOntologyUri);
            });
            await writeGraph(standalone, 'Schema', 'standalone');

            const schematronPath = discoverSchematronPath(text, inputFilepath, schematronRoot);
            if (schematronPath) {
              await inputSchematron(schematronPath, schematronRoot, outputDir, processedSchematron);
            }

            async function writeGraph(p: Package, category: OutputCategory, mode: OutputMode) {
              const context = _.invert(p.namespaces);
              const jsonldOutputDir = ensureArtifactOutputDir('jsonld', mode, category, relative);
              const ttlOutputDir = ensureArtifactOutputDir('ttl', mode, category, relative);
              const ntOutputDir = ensureArtifactOutputDir('nt', mode, category, relative);
              const trigOutputDir = ensureArtifactOutputDir('trig', mode, category, relative);

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

              let pushedXsd = false;
              const input = new Readable({
                objectMode: true,
                read: () => {
                  if (!pushedXsd) {
                    pushedXsd = true;
                    quads.forEach(quad => { input.push(quad); });
                    input.push(null);
                  }
                }
              })
              const jsonld: string = await getStream(jsonldSerializer.import(input) as AnyStream);
              const jsonldOutputFilepath = path.join(jsonldOutputDir, `${basename}.jsonld`);
              fs.writeFileSync(jsonldOutputFilepath, jsonld);

              const turtle = writeTurtleFast(quads, context);
              const turtleOutputFilepath = path.join(ttlOutputDir, `${basename}.ttl`);
              fs.writeFileSync(turtleOutputFilepath, turtle);

              const triples = triplesToString(quads);
              const triplesOutputFilepath = path.join(ntOutputDir, `${basename}.nt`);
              fs.writeFileSync(triplesOutputFilepath, triples);

              const graphName = mode === 'standalone'
                ? `${ontologyUri}:graph:standalone`
                : `${ontologyUri}:graph:convenience`;
              writeTrigAndTdfArtifacts(
                quads,
                context,
                graphName,
                trigOutputDir,
                basename,
                relative,
                category,
                mode,
              );
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

/** Returns the root directory under which all transformed RDF artefacts are written. */
function resolveOutputDir(): string {
  return OUTPUT_BASE_DIR;
}

function registerOntologyDocumentNamespace(namespaceMap: Record<string, string>, ontologyIri: string): void {
  const lastColon = ontologyIri.lastIndexOf(':');
  if (lastColon <= URI_PREFIX.length) {
    return;
  }

  const namespaceIri = ontologyIri.substring(0, lastColon + 1);
  if (namespaceMap[namespaceIri]) {
    return;
  }

  const basePrefix = namespaceIri
    .substring(URI_PREFIX.length)
    .replace(/[^A-Za-z0-9]+/g, '')
    .toLowerCase() || 'icdoc';

  let candidate = /^[A-Za-z]/.test(basePrefix) ? basePrefix : `ns${basePrefix}`;
  let suffix = 2;
  while (Object.entries(namespaceMap).some(([iri, prefix]) => iri !== namespaceIri && prefix === candidate)) {
    candidate = `${basePrefix}${suffix}`;
    suffix += 1;
  }

  namespaceMap[namespaceIri] = candidate;
}

async function prepareAuthoritativeSources(): Promise<PrepareSourceResult> {
  const existingSchemaDir = fs.existsSync(SCHEMA_DIR)
    ? SCHEMA_DIR
    : fs.existsSync(LEGACY_SCHEMA_DIR)
      ? LEGACY_SCHEMA_DIR
      : undefined;

  if (!existingSchemaDir || !fs.existsSync(SCHEMATRON_DIR)) {
    throw new Error(
      `Expected staged source folders at ${SCHEMA_DIR} and ${SCHEMATRON_DIR}. Populate these directories before running the transformer.`
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

/**
 * Returns the absolute paths of every file (not directory) under `dirPath`,
 * using an iterative depth-first traversal to avoid call-stack limits on deep trees.
 */
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

/**
 * Computes a SHA-256 fingerprint for the contents of `dirPath` by hashing each file's
 * relative path, size, and mtime in stable sorted order.
 *
 * The fingerprint changes when any file is added, removed, renamed, or has its content or
 * modification time changed. It is stored in the source manifest so subsequent runs can
 * detect whether re-extraction is necessary without inspecting file content.
 */
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

/** Returns the hex-encoded SHA-256 hash of the file at `filePath`. */
function sha256File(filePath: string): string {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * Attempts to locate the Schematron file associated with an XSD by inspecting the
 * `<?xml-model ...?>` processing instruction embedded in the schema text.
 *
 * Resolution order:
 * 1. Direct resolution of the `href` value relative to the XSD file's directory.
 * 2. Extraction of the path segment after `Schematron/` and resolution under `schematronRoot`.
 * 3. Fallback to the well-known master Schematron at `<schematronRoot>/ISM/ISM_XML.sch`.
 *
 * Returns `undefined` when no `xml-model` processing instruction is found.
 */
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

/**
 * Parses a single Schematron (`.sch`) file and converts it to RDF, writing both
 * `standalone` (self-contained) and `convenience` (includes merged inline) output graphs.
 *
 * The emitted RDF captures:
 * - Schema-level metadata: `ismsch:SchematronDocument`, `dc:title`, `ismsch:relativePath`,
 *   `ismsch:queryBinding`.
 * - Execution phases parsed from the `<?schematron-phases phaseids="...">` processing
 *   instruction as `ismsch:ExecutionPhase` resources.
 * - Namespace declarations as `ismsch:NamespaceDeclaration` resources.
 * - Patterns (`ismsch:Pattern` / `ismsch:AbstractPattern`), rules (`ismsch:Rule`),
 *   asserts (`ismsch:Assert`), and reports (`ismsch:Report`), preserving `id`,
 *   `context`, `test`, `flag`, `role`, and human-readable text.
 * - `sch:include` chains, resolved recursively; each included file is processed and
 *   its URI linked via `ismsch:includes`.
 *
 * Already-processed files (by normalised path) are returned from the map without
 * re-parsing, preventing duplicate processing for shared included libraries.
 */
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

  // Some Schematron files expose phase hints via processing instruction, while others define
  // explicit <sch:phase> blocks. We parse explicit phase blocks per schema and use PI values
  // only as a fallback when no explicit phase block is present.
  const phaseIdsFromPi = (text.match(/<\?schematron-phases\s+phaseids="([^"]+)"\?>/i)?.[1] ?? '')
    .split(/\s+/)
    .filter(Boolean);

  let processedSchemaRoot = false;
  for (const [rootKey, rootValue] of Object.entries(json as Record<string, any>)) {
    if (!rootKey.endsWith(':schema')) {
      continue;
    }
    processedSchemaRoot = true;

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

    addParagraphNodes(schemaUri, asArray(schema['sch:p']), 'schema-p');
    addVariableNodes(schemaUri, asArray(schema['sch:let']), 'schema-let');

    const patternUriById = new Map<string, string>();
    let patternIndex = 0;
    for (const patternNode of asArray(schema['sch:pattern'])) {
      patternIndex += 1;
      const patternAttributes = patternNode.$ ?? {};
      const patternId = patternAttributes.id ?? `pattern-${patternIndex}`;
      const patternUri = `${schemaUri}#pattern-${encodeURIComponent(patternId)}`;
      patternUriById.set(patternId, patternUri);
      standalone.g.add(patternUri, 'rdf:type', 'ismsch:Pattern');
      standalone.g.add(schemaUri, 'ismsch:hasPattern', patternUri);
      standalone.g.addL(patternUri, 'ismsch:patternId', patternId);
      if (patternAttributes.abstract === 'true') {
        standalone.g.add(patternUri, 'rdf:type', 'ismsch:AbstractPattern');
      }
      if (patternAttributes['is-a']) {
        standalone.g.addL(patternUri, 'ismsch:instantiatesPattern', patternAttributes['is-a']);
      }

      addParagraphNodes(patternUri, asArray(patternNode['sch:p']), 'pattern-p');
      addVariableNodes(patternUri, asArray(patternNode['sch:let']), 'pattern-let');

      let paramIndex = 0;
      for (const paramNode of asArray(patternNode['sch:param'])) {
        paramIndex += 1;
        const paramAttributes = paramNode.$ ?? {};
        const paramName = paramAttributes.name ?? `param-${paramIndex}`;
        const paramUri = `${patternUri}#param-${encodeURIComponent(paramName)}-${paramIndex}`;
        standalone.g.add(paramUri, 'rdf:type', 'ismsch:Parameter');
        standalone.g.add(patternUri, 'ismsch:hasParameter', paramUri);
        standalone.g.addL(paramUri, 'ismsch:paramName', paramName);
        if (paramAttributes.value) {
          standalone.g.addL(paramUri, 'ismsch:paramValue', paramAttributes.value);
          linkCveDependencies(paramUri, String(paramAttributes.value));
        }
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

        addVariableNodes(ruleUri, asArray(ruleNode['sch:let']), 'rule-let');

        let extendIndex = 0;
        for (const extendsNode of asArray(ruleNode['sch:extends'])) {
          extendIndex += 1;
          const extendsAttributes = extendsNode.$ ?? {};
          const extendsRule = extendsAttributes.rule;
          const extendsUri = `${ruleUri}#extends-${extendIndex}`;
          standalone.g.add(extendsUri, 'rdf:type', 'ismsch:RuleExtension');
          standalone.g.add(ruleUri, 'ismsch:hasExtension', extendsUri);
          if (extendsRule) {
            standalone.g.addL(extendsUri, 'ismsch:extendsRule', extendsRule);
            standalone.g.addL(ruleUri, 'ismsch:extendsRule', extendsRule);
          }
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

    const explicitPhases = asArray(schema['sch:phase']);
    if (explicitPhases.length > 0) {
      let phaseIndex = 0;
      for (const phaseNode of explicitPhases) {
        phaseIndex += 1;
        const phaseAttributes = phaseNode.$ ?? {};
        const phaseId = phaseAttributes.id ?? `phase-${phaseIndex}`;
        const phaseUri = `${schemaUri}#phase-${encodeURIComponent(phaseId)}`;
        standalone.g.add(phaseUri, 'rdf:type', 'ismsch:ExecutionPhase');
        standalone.g.add(docUri, 'ismsch:hasExecutionPhase', phaseUri);
        standalone.g.add(schemaUri, 'ismsch:hasPhase', phaseUri);
        standalone.g.addL(phaseUri, 'ismsch:phaseId', phaseId);

        let activationIndex = 0;
        for (const activeNode of asArray(phaseNode['sch:active'])) {
          activationIndex += 1;
          const activeAttributes = activeNode.$ ?? {};
          const activePatternId = activeAttributes.pattern ?? `pattern-${activationIndex}`;
          const activeUri = `${phaseUri}#active-${encodeURIComponent(activePatternId)}-${activationIndex}`;
          standalone.g.add(activeUri, 'rdf:type', 'ismsch:PhaseActivation');
          standalone.g.add(phaseUri, 'ismsch:hasActivation', activeUri);
          standalone.g.addL(activeUri, 'ismsch:activePatternId', activePatternId);
          const targetPatternUri = patternUriById.get(activePatternId);
          if (targetPatternUri) {
            standalone.g.add(activeUri, 'ismsch:targetsPattern', targetPatternUri);
            standalone.g.add(phaseUri, 'ismsch:activatesPattern', targetPatternUri);
          } else {
            // Many phase activations reference pattern IDs defined in included .sch files.
            // Emit a stable placeholder pattern-reference node so the graph preserves the
            // activation edge even when the concrete pattern resource is external.
            const patternRefUri = `${docUri}#pattern-ref-${encodeURIComponent(activePatternId)}`;
            standalone.g.add(patternRefUri, 'rdf:type', 'ismsch:PatternReference');
            standalone.g.addL(patternRefUri, 'ismsch:patternId', activePatternId);
            standalone.g.add(activeUri, 'ismsch:targetsPattern', patternRefUri);
            standalone.g.add(phaseUri, 'ismsch:activatesPattern', patternRefUri);
          }
        }
      }
    } else {
      for (const phaseId of phaseIdsFromPi) {
        const phaseUri = `${schemaUri}#phase-${encodeURIComponent(phaseId)}`;
        standalone.g.add(phaseUri, 'rdf:type', 'ismsch:ExecutionPhase');
        standalone.g.add(docUri, 'ismsch:hasExecutionPhase', phaseUri);
        standalone.g.add(schemaUri, 'ismsch:hasPhase', phaseUri);
        standalone.g.addL(phaseUri, 'ismsch:phaseId', phaseId);
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

  // Many included Schematron files are root <sch:pattern> documents instead of <sch:schema>.
  // Capture those as a synthetic schema container so pattern/rule/param/extends metadata isn't lost.
  if (!processedSchemaRoot) {
    const schemaUri = `${docUri}#schema`;
    standalone.g.add(schemaUri, 'rdf:type', 'ismsch:Schema');
    standalone.g.add(docUri, 'ismsch:definesSchema', schemaUri);

    let patternIndex = 0;
    for (const [rootKey, rootValue] of Object.entries(json as Record<string, any>)) {
      if (!rootKey.endsWith(':pattern')) {
        continue;
      }
      for (const patternNode of asArray(rootValue as any)) {
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

        addParagraphNodes(patternUri, asArray(patternNode['sch:p']), 'pattern-p');
        addVariableNodes(patternUri, asArray(patternNode['sch:let']), 'pattern-let');

        let paramIndex = 0;
        for (const paramNode of asArray(patternNode['sch:param'])) {
          paramIndex += 1;
          const paramAttributes = paramNode.$ ?? {};
          const paramName = paramAttributes.name ?? `param-${paramIndex}`;
          const paramUri = `${patternUri}#param-${encodeURIComponent(paramName)}-${paramIndex}`;
          standalone.g.add(paramUri, 'rdf:type', 'ismsch:Parameter');
          standalone.g.add(patternUri, 'ismsch:hasParameter', paramUri);
          standalone.g.addL(paramUri, 'ismsch:paramName', paramName);
          if (paramAttributes.value) {
            const value = String(paramAttributes.value);
            standalone.g.addL(paramUri, 'ismsch:paramValue', value);
            linkCveDependencies(paramUri, value);
          }
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

          addVariableNodes(ruleUri, asArray(ruleNode['sch:let']), 'rule-let');

          let extendIndex = 0;
          for (const extendsNode of asArray(ruleNode['sch:extends'])) {
            extendIndex += 1;
            const extendsAttributes = extendsNode.$ ?? {};
            const extendsRule = extendsAttributes.rule;
            const extendsUri = `${ruleUri}#extends-${extendIndex}`;
            standalone.g.add(extendsUri, 'rdf:type', 'ismsch:RuleExtension');
            standalone.g.add(ruleUri, 'ismsch:hasExtension', extendsUri);
            if (extendsRule) {
              standalone.g.addL(extendsUri, 'ismsch:extendsRule', extendsRule);
              standalone.g.addL(ruleUri, 'ismsch:extendsRule', extendsRule);
            }
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
    }
  }

  convienence.g.addAll(standalone.g);
  Object.assign(convienence.namespaces, standalone.namespaces);

  // Deferred work implementation: expand abstract pattern instantiations,
  // emit SHACL for safely translatable constraints, and add schema-term alignments.
  applySchematronDeferredEnhancements(standalone);
  applySchematronDeferredEnhancements(convienence);

  const relativeDir = path.relative(schematronRoot, path.dirname(normalizedPath));
  const basename = path.basename(normalizedPath, SCH_EXTENSION);
  await writeGraphPackage(convienence, relativeDir, basename, 'convenience', docUri);
  await writeGraphPackage(standalone, relativeDir, basename, 'standalone', docUri);

  return packages;

  function addParagraphNodes(ownerUri: string, paragraphNodes: any[], prefix: string) {
    let index = 0;
    for (const pNode of paragraphNodes) {
      index += 1;
      const pAttrs = pNode?.$ ?? {};
      const paragraphUri = `${ownerUri}#${prefix}-${index}`;
      standalone.g.add(paragraphUri, 'rdf:type', 'ismsch:Paragraph');
      standalone.g.add(ownerUri, 'ismsch:hasParagraph', paragraphUri);
      if (pAttrs.class) {
        standalone.g.addL(paragraphUri, 'ismsch:paragraphClass', pAttrs.class);
      }
      const textValue = normalizeSchematronNodeText(pNode);
      if (textValue) {
        standalone.g.addL(paragraphUri, 'ismsch:text', textValue);
      }
    }
  }

  function addVariableNodes(ownerUri: string, variableNodes: any[], prefix: string) {
    let index = 0;
    for (const letNode of variableNodes) {
      index += 1;
      const letAttrs = letNode?.$ ?? {};
      const variableName = letAttrs.name ?? `var-${index}`;
      const variableUri = `${ownerUri}#${prefix}-${encodeURIComponent(variableName)}-${index}`;
      standalone.g.add(variableUri, 'rdf:type', 'ismsch:Variable');
      standalone.g.add(ownerUri, 'ismsch:hasVariable', variableUri);
      standalone.g.addL(variableUri, 'ismsch:variableName', variableName);
      if (letAttrs.value) {
        const value = String(letAttrs.value);
        standalone.g.addL(variableUri, 'ismsch:variableValue', value);
        linkCveDependencies(variableUri, value);
      }
    }
  }

  function linkCveDependencies(ownerUri: string, expression: string) {
    const matches = expression.match(/CVEnum[A-Za-z0-9_]+/g);
    if (!matches) {
      return;
    }
    for (const cveName of new Set(matches)) {
      const cveUri = `${URI_PREFIX}:ISM:CVEGenerated:${cveName}`;
      standalone.g.add(ownerUri, 'ismsch:dependsOnConceptScheme', cveUri);
    }
  }
}

/**
 * Extracts the human-readable text content from a Schematron `sch:assert` or `sch:report`
 * node as parsed by xml2js.
 *
 * xml2js represents mixed-content nodes (text interleaved with child elements) with a `_`
 * property for direct text and named child arrays for elements. This function walks the
 * entire node tree, collecting all text fragments and `sch:value-of` placeholders.
 *
 * Returns a single whitespace-normalised string.
 */
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

/**
 * Recursively merges a `standalone` Schematron graph (and all its transitive includes)
 * into a `convenience` graph so that the convenience output is fully self-contained.
 *
 * Uses the `merged` set to guard against processing the same file more than once
 * when the include graph contains shared libraries.
 */
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

/**
 * Applies post-parse enhancement passes for deferred Schematron work:
 * 1) abstract pattern resolution with parameter substitution
 * 2) SHACL translation for a safe constraint subset (with preservation markers otherwise)
 * 3) alignment links from rule/assert/report expressions to schema-term candidate IRIs
 */
function applySchematronDeferredEnhancements(pkg: Package) {
  pkg.namespaces[SCHEMATRON_NS_URI] = 'ismsch';
  pkg.namespaces[SHACL_URI] = 'sh';
  pkg.namespaces[RDF_URI] = 'rdf';
  pkg.namespaces[RDFS_URI] = 'rdfs';
  pkg.namespaces[XML_SCHEMA_URI + '#'] = pkg.namespaces[XML_SCHEMA_URI + '#'] ?? 'xsd';

  resolveAbstractPatternInstantiations(pkg);
  emitShaclFromSchematron(pkg);
  emitRuleAlignmentLinks(pkg);

  for (const [iri, prefix] of Object.entries(pkg.namespaces)) {
    namespaces.add(prefix, iri);
  }
}

function resolveAbstractPatternInstantiations(pkg: Package) {
  const patternUris = subjectsOfType(pkg, 'ismsch:Pattern');
  const abstractPatternUris = new Set(subjectsOfType(pkg, 'ismsch:AbstractPattern'));
  const patternById = new Map<string, string>();

  for (const patternUri of patternUris) {
    const patternId = firstLiteral(pkg, patternUri, 'ismsch:patternId');
    if (patternId) {
      patternById.set(patternId, patternUri);
    }
  }

  for (const concretePatternUri of patternUris) {
    const abstractPatternId = firstLiteral(pkg, concretePatternUri, 'ismsch:instantiatesPattern');
    if (!abstractPatternId) {
      continue;
    }

    const abstractPatternUri = patternById.get(abstractPatternId);
    if (!abstractPatternUri || !abstractPatternUris.has(abstractPatternUri)) {
      continue;
    }

    const paramMap = collectPatternParams(pkg, concretePatternUri);
    const templateRules = objectsOf(pkg, abstractPatternUri, 'ismsch:hasRule');
    let derivedIndex = 0;
    for (const templateRuleUri of templateRules) {
      derivedIndex += 1;
      const templateRuleId = firstLiteral(pkg, templateRuleUri, 'ismsch:ruleId') ?? `template-${derivedIndex}`;
      const derivedRuleUri = `${concretePatternUri}#resolved-rule-${encodeURIComponent(templateRuleId)}-${derivedIndex}`;
      pkg.g.add(derivedRuleUri, 'rdf:type', 'ismsch:Rule');
      pkg.g.add(derivedRuleUri, 'rdf:type', 'ismsch:ResolvedRule');
      pkg.g.add(concretePatternUri, 'ismsch:hasRule', derivedRuleUri);
      pkg.g.add(derivedRuleUri, 'ismsch:derivedFromRule', templateRuleUri);
      pkg.g.add(derivedRuleUri, 'ismsch:derivedFromPattern', abstractPatternUri);
      pkg.g.addL(derivedRuleUri, 'ismsch:ruleId', `${templateRuleId}#resolved`);

      const templateContext = firstLiteral(pkg, templateRuleUri, 'ismsch:context');
      if (templateContext) {
        pkg.g.addL(derivedRuleUri, 'ismsch:context', substituteSchematronParams(templateContext, paramMap));
      }

      cloneConstraintNodes(pkg, templateRuleUri, derivedRuleUri, 'ismsch:hasAssert', 'ismsch:Assert', 'assert', paramMap);
      cloneConstraintNodes(pkg, templateRuleUri, derivedRuleUri, 'ismsch:hasReport', 'ismsch:Report', 'report', paramMap);
    }
  }
}

function emitShaclFromSchematron(pkg: Package) {
  const ruleUris = subjectsOfType(pkg, 'ismsch:Rule');
  let shapeIndex = 0;
  for (const ruleUri of ruleUris) {
    if (hasType(pkg, ruleUri, 'ismsch:AbstractRule')) {
      continue;
    }

    shapeIndex += 1;
    const shapeUri = `${ruleUri}#shape-${shapeIndex}`;
    pkg.g.add(shapeUri, 'rdf:type', 'sh:NodeShape');
    pkg.g.add(ruleUri, 'ismsch:translatedToShape', shapeUri);

    const context = firstLiteral(pkg, ruleUri, 'ismsch:context');
    const contextAttr = extractSingleAttributeRef(context);
    if (contextAttr) {
      const contextPath = schemaCandidatePropertyUri(contextAttr);
      if (contextPath) {
        pkg.g.add(shapeUri, 'sh:targetSubjectsOf', contextPath);
      }
    }

    let translatedAny = false;
    let constraintIndex = 0;
    const constraintPredicates = ['ismsch:hasAssert', 'ismsch:hasReport'];
    for (const pred of constraintPredicates) {
      for (const constraintUri of objectsOf(pkg, ruleUri, pred)) {
        constraintIndex += 1;
        const test = firstLiteral(pkg, constraintUri, 'ismsch:test');
        if (!test) {
          continue;
        }

        const exists = test.match(/^@([A-Za-z_][\w.\-:]*)$/);
        if (exists) {
          const attr = exists[1];
          const path = schemaCandidatePropertyUri(attr);
          if (!path) {
            pkg.g.addL(constraintUri, 'ismsch:translationStatus', 'preserved');
            pkg.g.addL(constraintUri, 'ismsch:translationReason', 'Attribute path could not be normalized to a schema term IRI');
            continue;
          }
          const propShapeUri = `${shapeUri}#property-${constraintIndex}`;
          pkg.g.add(propShapeUri, 'rdf:type', 'sh:PropertyShape');
          pkg.g.add(shapeUri, 'sh:property', propShapeUri);
          pkg.g.add(propShapeUri, 'sh:path', path);
          pkg.g.addL(propShapeUri, 'sh:minCount', '1');
          translatedAny = true;
          continue;
        }

        const tokenizedCount = test.match(/^count\s*\(\s*tokenize\s*\(\s*normalize-space\s*\(\s*string\s*\(\s*@([A-Za-z_][\w.\-:]*)\s*\)\s*\)\s*,\s*['"]\s+['"]\s*\)\s*\)\s*(>=|>|<=|<|=)\s*(\d+)\s*$/i);
        if (tokenizedCount) {
          pkg.g.addL(constraintUri, 'ismsch:translationStatus', 'preserved');
          pkg.g.addL(constraintUri, 'ismsch:translationReason', 'Tokenized-count expressions require token projection and are preserved as source-faithful constraints');
          continue;
        }

        const equals = test.match(/^@([A-Za-z_][\w.\-:]*)\s*=\s*['\"]([^'\"]+)['\"]$/);
        if (equals) {
          const attr = equals[1];
          const value = equals[2];
          const path = schemaCandidatePropertyUri(attr);
          if (!path) {
            pkg.g.addL(constraintUri, 'ismsch:translationStatus', 'preserved');
            pkg.g.addL(constraintUri, 'ismsch:translationReason', 'Attribute path could not be normalized to a schema term IRI');
            continue;
          }
          const propShapeUri = `${shapeUri}#property-${constraintIndex}`;
          pkg.g.add(propShapeUri, 'rdf:type', 'sh:PropertyShape');
          pkg.g.add(shapeUri, 'sh:property', propShapeUri);
          pkg.g.add(propShapeUri, 'sh:path', path);
          pkg.g.addL(propShapeUri, 'sh:hasValue', value);
          translatedAny = true;
          continue;
        }

        const matches = test.match(/matches\s*\(\s*@([A-Za-z_][\w.\-:]*)\s*,\s*['\"]([^'\"]+)['\"]/i);
        if (matches) {
          const attr = matches[1];
          const regex = matches[2];
          const path = schemaCandidatePropertyUri(attr);
          if (!path) {
            pkg.g.addL(constraintUri, 'ismsch:translationStatus', 'preserved');
            pkg.g.addL(constraintUri, 'ismsch:translationReason', 'Attribute path could not be normalized to a schema term IRI');
            continue;
          }
          const propShapeUri = `${shapeUri}#property-${constraintIndex}`;
          pkg.g.add(propShapeUri, 'rdf:type', 'sh:PropertyShape');
          pkg.g.add(shapeUri, 'sh:property', propShapeUri);
          pkg.g.add(propShapeUri, 'sh:path', path);
          pkg.g.addL(propShapeUri, 'sh:pattern', regex);
          translatedAny = true;
          continue;
        }

        // Preserve non-translatable constraints explicitly so no rule semantics are silently dropped.
        pkg.g.addL(constraintUri, 'ismsch:translationStatus', 'preserved');
        pkg.g.addL(constraintUri, 'ismsch:translationReason', 'No safe automatic SHACL mapping for this test expression');
      }
    }

    if (!translatedAny) {
      pkg.g.addL(shapeUri, 'ismsch:translationStatus', 'preserved');
      pkg.g.addL(shapeUri, 'ismsch:translationReason', 'Rule captured as source-faithful RDF only');
    }
  }
}

function emitRuleAlignmentLinks(pkg: Package) {
  const owners = [
    ...subjectsOfType(pkg, 'ismsch:Rule'),
    ...subjectsOfType(pkg, 'ismsch:Assert'),
    ...subjectsOfType(pkg, 'ismsch:Report'),
  ];

  for (const ownerUri of owners) {
    const expressions: string[] = [];
    const context = firstLiteral(pkg, ownerUri, 'ismsch:context');
    const test = firstLiteral(pkg, ownerUri, 'ismsch:test');
    const text = firstLiteral(pkg, ownerUri, 'ismsch:text');
    if (context) expressions.push(context);
    if (test) expressions.push(test);
    if (text) expressions.push(text);

    const attrs = new Set<string>();
    const qnames = new Set<string>();
    for (const expression of expressions) {
      for (const match of expression.matchAll(/@([A-Za-z_][\w.\-:]*)/g)) {
        attrs.add(match[1]);
      }
      for (const match of expression.matchAll(/\b([A-Za-z_][\w\-]*)\:([A-Za-z_][\w\-.]*)\b/g)) {
        qnames.add(`${match[1]}:${match[2]}`);
      }
    }

    for (const attr of attrs) {
      pkg.g.addL(ownerUri, 'ismsch:referencesAttribute', attr);
      const aligned = schemaCandidatePropertyUri(attr);
      if (aligned) {
        pkg.g.add(ownerUri, 'ismsch:alignsToSchemaTerm', aligned);
      }
    }
    for (const qname of qnames) {
      pkg.g.addL(ownerUri, 'ismsch:referencesQName', qname);
      const local = qname.includes(':') ? qname.substring(qname.indexOf(':') + 1) : qname;
      const aligned = schemaCandidatePropertyUri(local);
      if (aligned) {
        pkg.g.add(ownerUri, 'ismsch:alignsToSchemaTerm', aligned);
      }
    }
  }
}

function cloneConstraintNodes(
  pkg: Package,
  fromRuleUri: string,
  toRuleUri: string,
  linkPredicate: string,
  typePredicate: string,
  fragmentPrefix: string,
  paramMap: Map<string, string>,
) {
  let index = 0;
  for (const sourceConstraintUri of objectsOf(pkg, fromRuleUri, linkPredicate)) {
    index += 1;
    const targetConstraintUri = `${toRuleUri}#${fragmentPrefix}-${index}`;
    pkg.g.add(targetConstraintUri, 'rdf:type', typePredicate);
    pkg.g.add(toRuleUri, linkPredicate, targetConstraintUri);
    pkg.g.add(targetConstraintUri, 'ismsch:derivedFromConstraint', sourceConstraintUri);

    const test = firstLiteral(pkg, sourceConstraintUri, 'ismsch:test');
    const flag = firstLiteral(pkg, sourceConstraintUri, 'ismsch:flag');
    const role = firstLiteral(pkg, sourceConstraintUri, 'ismsch:role');
    const text = firstLiteral(pkg, sourceConstraintUri, 'ismsch:text');
    if (test) pkg.g.addL(targetConstraintUri, 'ismsch:test', substituteSchematronParams(test, paramMap));
    if (flag) pkg.g.addL(targetConstraintUri, 'ismsch:flag', flag);
    if (role) pkg.g.addL(targetConstraintUri, 'ismsch:role', role);
    if (text) pkg.g.addL(targetConstraintUri, 'ismsch:text', substituteSchematronParams(text, paramMap));
  }
}

function collectPatternParams(pkg: Package, patternUri: string): Map<string, string> {
  const paramMap = new Map<string, string>();
  for (const paramUri of objectsOf(pkg, patternUri, 'ismsch:hasParameter')) {
    const name = firstLiteral(pkg, paramUri, 'ismsch:paramName');
    const value = firstLiteral(pkg, paramUri, 'ismsch:paramValue');
    if (name && value !== undefined) {
      paramMap.set(name, value);
    }
  }
  return paramMap;
}

function substituteSchematronParams(text: string, paramMap: Map<string, string>): string {
  let result = text;
  for (const [name, value] of paramMap.entries()) {
    const pattern = new RegExp(`\\$${name}\\b`, 'g');
    result = result.replace(pattern, value);
  }
  return result;
}

function subjectsOfType(pkg: Package, typeIriOrQName: string): string[] {
  return pkg.g.find(null, 'rdf:type', typeIriOrQName).map((t: any) => t._s);
}

function hasType(pkg: Package, subject: string, typeIriOrQName: string): boolean {
  return pkg.g.find(subject, 'rdf:type', typeIriOrQName).length > 0;
}

function objectsOf(pkg: Package, subject: string, predicate: string): string[] {
  return pkg.g.find(subject, predicate, null).map((t: any) => t._o?.value).filter(Boolean);
}

function firstLiteral(pkg: Package, subject: string, predicate: string): string | undefined {
  const match = pkg.g.find(subject, predicate, null)[0] as any;
  if (!match || !match._o) {
    return undefined;
  }
  return String(match._o.value ?? '');
}

function extractSingleAttributeRef(expression: string | undefined): string | undefined {
  if (!expression) {
    return undefined;
  }
  const match = expression.match(/^@([A-Za-z_][\w.\-:]*)$/);
  return match?.[1];
}

function schemaCandidatePropertyUri(nameOrQName: string): string | undefined {
  const local = nameOrQName.includes(':') ? nameOrQName.substring(nameOrQName.indexOf(':') + 1) : nameOrQName;
  const normalized = local.trim();
  if (!normalized || !/^[A-Za-z_][\w.\-]*$/.test(normalized)) {
    return undefined;
  }
  return `${URI_PREFIX}:ISM:${normalized}`;
}

function normalizeAttributeRangeType(attributeType: string, xsdPrefix: string): string {
  if (attributeType.startsWith(`${xsdPrefix}:`)) {
    namespaces.add(xsdPrefix, `${XML_SCHEMA_URI}#`);
    return attributeType;
  }
  return `${attributeType}Values`;
}

function toLocalName(qname: string): string {
  const normalized = qname.trim();
  const colonIdx = normalized.indexOf(':');
  return colonIdx >= 0 ? normalized.substring(colonIdx + 1) : normalized;
}

function resolveCardinalityFromUse(use?: string): { min: number; max?: number } {
  const normalized = (use ?? 'optional').trim();
  if (normalized === 'required') {
    return { min: 1, max: 1 };
  }
  if (normalized === 'prohibited') {
    return { min: 0, max: 0 };
  }
  return { min: 0, max: 1 };
}

function addOwlCardinalityRestriction(pkg: Package, classId: string, propertyId: string, min: number, max?: number, suppressMax?: boolean) {
  const hasMinConstraint = min > 0;
  const hasMaxConstraint = Number.isFinite(max) && !suppressMax;
  if (!hasMinConstraint && !hasMaxConstraint) {
    return;
  }

  pkg.namespaces[OWL_URI] = 'owl';
  pkg.namespaces[RDFS_URI] = 'rdfs';
  pkg.namespaces[RDF_URI] = 'rdf';
  pkg.namespaces[`${XML_SCHEMA_URI}#`] = pkg.namespaces[`${XML_SCHEMA_URI}#`] ?? 'xsd';

  const restriction = pkg.g.add(null, 'rdf:type', 'owl:Restriction');
  pkg.g.add(classId, 'rdfs:subClassOf', { type: 'bnode', value: restriction._s });
  pkg.g.add(restriction._s, 'owl:onProperty', propertyId);
  if (hasMinConstraint) {
    pkg.g.addL(restriction._s, 'owl:minCardinality', String(min));
  }
  if (hasMaxConstraint) {
    pkg.g.addL(restriction._s, 'owl:maxCardinality', String(max));
    if (max === min) {
      pkg.g.addL(restriction._s, 'owl:cardinality', String(min));
    }
  }
}

function collectSimpleTypeInfo(schema: any, xsdPrefix: string): Map<string, SimpleTypeInfo> {
  const infoByName = new Map<string, SimpleTypeInfo>();
  const simpleTypes = asArray(schema[`${xsdPrefix}:simpleType`]);
  for (const simpleType of simpleTypes) {
    const typeName = simpleType?.['$']?.name;
    if (!typeName) {
      continue;
    }
    const listItemType = findListItemTypeInSimpleType(simpleType, xsdPrefix);
    const info: SimpleTypeInfo = {
      isTokenList: Boolean(listItemType),
      listItemType,
    };
    infoByName.set(typeName, info);
    // Accumulate into the global map so importing schemas can look up types from imported files.
    globalSimpleTypeInfoByLocalName.set(typeName, info);
  }
  return infoByName;
}

function collectAttributeListInfo(schema: any, xsdPrefix: string, simpleTypeInfoByName: Map<string, SimpleTypeInfo>): Map<string, AttributeListInfo> {
  const infoByName = new Map<string, AttributeListInfo>();
  const attributes = asArray(schema[`${xsdPrefix}:attribute`]);
  for (const attr of attributes) {
    const attrs = attr?.['$'] ?? {};
    const localRefName = toLocalName(attrs.ref ?? '');
    const declaredName = attrs.name ?? localRefName;
    if (!declaredName) {
      continue;
    }

    let isTokenList = false;
    const inlineSimpleType = attr?.[`${xsdPrefix}:simpleType`]?.[0];
    if (findListItemTypeInSimpleType(inlineSimpleType, xsdPrefix)) {
      isTokenList = true;
    } else {
      const typeName = toLocalName(attrs.type ?? '');
      if (typeName) {
        const info = simpleTypeInfoByName.get(typeName) ?? globalSimpleTypeInfoByLocalName.get(typeName);
        isTokenList = Boolean(info?.isTokenList);
      }
    }

    const attributeInfo: AttributeListInfo = { isTokenList };
    infoByName.set(declaredName, attributeInfo);

    const existing = globalAttributeListInfoByLocalName.get(declaredName);
    globalAttributeListInfoByLocalName.set(declaredName, {
      isTokenList: Boolean(existing?.isTokenList || isTokenList),
    });
  }
  return infoByName;
}

function findListItemTypeInSimpleType(simpleType: any, xsdPrefix: string): string | undefined {
  if (!simpleType) {
    return undefined;
  }

  const restrictionNode = simpleType?.[`${xsdPrefix}:restriction`]?.[0];
  const nestedSimpleType = restrictionNode?.[`${xsdPrefix}:simpleType`]?.[0];
  const listItemType = nestedSimpleType?.[`${xsdPrefix}:list`]?.[0]?.['$']?.itemType;
  if (listItemType) {
    return String(listItemType);
  }

  const directListItemType = simpleType?.[`${xsdPrefix}:list`]?.[0]?.['$']?.itemType;
  if (directListItemType) {
    return String(directListItemType);
  }

  return undefined;
}

function isTokenListAttribute(schema: any, xsdPrefix: string, attributeName: string, simpleTypeInfoByName: Map<string, SimpleTypeInfo>): boolean {
  const attributes = asArray(schema[`${xsdPrefix}:attribute`]);
  for (const attr of attributes) {
    const attrs = attr?.['$'] ?? {};
    const localRefName = toLocalName(attrs.ref ?? '');
    const declaredName = attrs.name ?? localRefName;
    if (declaredName !== attributeName) {
      continue;
    }

    const inlineSimpleType = attr?.[`${xsdPrefix}:simpleType`]?.[0];
    if (findListItemTypeInSimpleType(inlineSimpleType, xsdPrefix)) {
      return true;
    }

    const typeName = toLocalName(attrs.type ?? '');
    if (!typeName) {
      return false;
    }

    const info = simpleTypeInfoByName.get(typeName) ?? globalSimpleTypeInfoByLocalName.get(typeName);
    return Boolean(info?.isTokenList);
  }

  const globalAttributeInfo = globalAttributeListInfoByLocalName.get(toLocalName(attributeName));
  return Boolean(globalAttributeInfo?.isTokenList);
}

/**
 * Fast synchronous Turtle serialiser used by writeGraphPackage.
 *
 * Produces valid Turtle with prefix declarations and subject/predicate grouping.
 * Blank nodes are emitted as anonymous `[]` when they appear only as objects of
 * a single triple (simple nesting), or as `_:bX` labels otherwise.
 */
function writeTurtleFast(quads: Quad[], prefixes: Record<string, string>): string {
  // prefixes is { prefix_label: iri }. Build reverse map iri→prefix for abbreviation.
  const iriToPrefix = new Map<string, string>();
  for (const [px, ns] of Object.entries(prefixes)) {
    iriToPrefix.set(ns, px);
  }

  function abbrev(iri: string): string {
    for (const [ns, px] of iriToPrefix) {
      if (iri.startsWith(ns)) {
        const local = iri.slice(ns.length);
        // Only use prefixed form when the local part is a valid PN_LOCAL
        if (local && /^[A-Za-z0-9_\-./~!$&'()*+,;=@]/.test(local)) {
          return `${px}:${local}`;
        }
      }
    }
    return `<${iri}>`;
  }

  function termStr(term: Quad['subject'] | Quad['object']): string {
    if (term.termType === 'NamedNode') {
      return abbrev(term.value);
    }
    if (term.termType === 'BlankNode') {
      return `_:${term.value}`;
    }
    if (term.termType === 'Literal') {
      const escaped = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      if (term.language) return `"${escaped}"@${term.language}`;
      const dt = term.datatype?.value;
      if (dt && dt !== 'http://www.w3.org/2001/XMLSchema#string') {
        return `"${escaped}"^^${abbrev(dt)}`;
      }
      return `"${escaped}"`;
    }
    return `<${(term as unknown as NamedNode).value}>`;
  }

  const lines: string[] = [];
  for (const [px, ns] of Object.entries(prefixes).sort((a, b) => a[0].localeCompare(b[0]))) {
    // Skip namespace URIs that don't end with a valid RDF namespace terminator character.
    if (!/[/#_=:]$/.test(ns)) continue;
    lines.push(`@prefix ${px}: <${ns}> .`);
  }
  lines.push('');

  // Group by subject
  const bySubject = new Map<string, Array<[string, string]>>();
  for (const q of quads) {
    const s = termStr(q.subject);
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s)!.push([termStr(q.predicate), termStr(q.object)]);
  }

  for (const [subject, pos] of bySubject) {
    if (pos.length === 1) {
      lines.push(`${subject} ${pos[0][0]} ${pos[0][1]} .`);
    } else {
      lines.push(`${subject}`);
      for (let i = 0; i < pos.length; i++) {
        const sep = i < pos.length - 1 ? ' ;' : ' .';
        lines.push(`    ${pos[i][0]} ${pos[i][1]}${sep}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Serialises a {@link Package}'s RDF graph to all three output formats (JSON-LD, Turtle,
 * N-Triples) and writes the files under `<outputDir>/<relative>/<basename>.{jsonld,ttl,nt}`.
 *
 * Handles blank nodes in the graph by mapping `_:` prefixed values appropriately
 * for each serialiser.
 */
async function writeGraphPackage(p: Package, relative: string, basename: string, mode?: OutputMode, docUri?: string) {
  const context = _.invert(p.namespaces);
  const jsonldOutputDir = ensureArtifactOutputDir('jsonld', mode ?? 'standalone', 'Schematron', relative);
  const ttlOutputDir = ensureArtifactOutputDir('ttl', mode ?? 'standalone', 'Schematron', relative);
  const ntOutputDir = ensureArtifactOutputDir('nt', mode ?? 'standalone', 'Schematron', relative);
  const trigOutputDir = ensureArtifactOutputDir('trig', mode ?? 'standalone', 'Schematron', relative);

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

  // Guard against read() being called multiple times by the stream machinery
  let pushed = false;
  const input = new Readable({
    objectMode: true,
    read: () => {
      if (!pushed) {
        pushed = true;
        quads.forEach(quad => { input.push(quad); });
        input.push(null);
      }
    }
  });

  const jsonld: string = await getStream(jsonldSerializer.import(input) as AnyStream);
  fs.writeFileSync(path.join(jsonldOutputDir, `${basename}.jsonld`), jsonld);

  // Use fast synchronous Turtle serializer to avoid hangs on large merged graphs.
  const turtle = writeTurtleFast(quads, context);
  fs.writeFileSync(path.join(ttlOutputDir, `${basename}.ttl`), turtle);

  const triples = triplesToString(quads);
  fs.writeFileSync(path.join(ntOutputDir, `${basename}.nt`), triples);

  if (mode && docUri) {
    const graphName = `${docUri}:graph:${mode}`;
    writeTrigAndTdfArtifacts(quads, context, graphName, trigOutputDir, basename, relative, 'Schematron', mode);
  }

}

function writeTrigAndTdfArtifacts(
  quads: Quad[],
  context: Record<string, string>,
  graphName: string,
  outputDir: string,
  basename: string,
  relativePath: string,
  category: OutputCategory,
  mode: OutputMode,
) {
  const trigText = writeTrigSingleGraph(quads, context, graphName);
  const trigOutputPath = path.join(outputDir, `${basename}.trig`);
  fs.writeFileSync(trigOutputPath, trigText);

  const tdfObject = {
    packageVersion: '1.0.0',
    payloadMediaType: 'application/trig',
    payloadEncoding: 'utf8',
    payloadBase64: Buffer.from(trigText, 'utf8').toString('base64'),
    payloadSha256: sha256String(trigText),
    graphName,
    category,
    mode,
    relativePath: relativePath.replaceAll(path.sep, '/'),
    basename,
    createdAt: new Date().toISOString(),
  };
  const tdfOutputPath = path.join(outputDir, `${basename}.tdf`);
  fs.writeFileSync(tdfOutputPath, JSON.stringify(tdfObject, null, 2));

  const manifestDir = path.join(OUTPUT_BASE_DIR, 'trig', mode);
  trigTdfManifestEntries.push({
    graphName,
    trigPath: path.relative(manifestDir, trigOutputPath).replaceAll(path.sep, '/'),
    tdfPath: path.relative(manifestDir, tdfOutputPath).replaceAll(path.sep, '/'),
    payloadSha256: tdfObject.payloadSha256,
    relativePath: relativePath.replaceAll(path.sep, '/'),
    basename,
    category,
    mode,
    createdAt: tdfObject.createdAt,
  });
}

function writeTrigSingleGraph(quads: Quad[], prefixes: Record<string, string>, graphName: string): string {
  const lines: string[] = [];
  const prefixEntries = Object.entries(prefixes).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [prefix, iri] of prefixEntries) {
    // Skip namespace URIs that don't end with a valid RDF namespace terminator character.
    if (!/[/#_=:]$/.test(iri)) continue;
    lines.push(`@prefix ${prefix}: <${iri}> .`);
  }
  lines.push('');
  lines.push(`GRAPH <${graphName}> {`);
  for (const quad of quads) {
    lines.push(`  ${tripleToString(quad).trimEnd()}`);
  }
  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function sha256String(value: string): string {
  const hash = createHash('sha256');
  hash.update(value, 'utf8');
  return hash.digest('hex');
}

function toWorkspaceRelativePath(absolutePath: string): string {
  return path.relative(WORKSPACE_ROOT, absolutePath).replaceAll(path.sep, '/');
}

function writeOutputManifests() {
  for (const mode of ['standalone', 'convenience'] as OutputMode[]) {
    const manifestPath = path.join(OUTPUT_BASE_DIR, 'trig', mode, 'manifest.json');
    const entries = trigTdfManifestEntries
      .filter(entry => entry.mode === mode)
      .sort((a, b) => a.trigPath.localeCompare(b.trigPath));
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({ generatedAt: new Date().toISOString(), count: entries.length, entries }, null, 2),
    );
  }
}

function ensureArtifactOutputDir(format: 'jsonld' | 'ttl' | 'nt' | 'trig', mode: OutputMode, category: OutputCategory, relativePath: string): string {
  const outputDir = path.join(OUTPUT_BASE_DIR, format, mode, category, relativePath);
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

function copySchemaBridgeArtifacts() {
  if (!fs.existsSync(CCO_MARKING_BRIDGE_SOURCE)) {
    throw new Error(`Missing required bridge file: ${CCO_MARKING_BRIDGE_SOURCE}`);
  }

  const bridgeFilename = path.basename(CCO_MARKING_BRIDGE_SOURCE);
  const formats = ['jsonld', 'ttl', 'nt', 'trig'] as const;
  const modes: OutputMode[] = ['standalone', 'convenience'];

  for (const format of formats) {
    for (const mode of modes) {
      const schemaRootDir = path.join(OUTPUT_BASE_DIR, format, mode, 'Schema');
      fs.mkdirSync(schemaRootDir, { recursive: true });
      // Preserve source bytes exactly (including BOM/newline style) for encoding fidelity.
      fs.copyFileSync(CCO_MARKING_BRIDGE_SOURCE, path.join(schemaRootDir, bridgeFilename));
    }
  }
}



/**
 * Normalises an xml2js value that may be a single item, an array, or absent into
 * a consistently typed array. Returns an empty array for `null` / `undefined`.
 */
function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function removeWhitespace(documentation: any): string {
  // If already a plain string (e.g. from a bare xs:documentation text node), normalise directly.
  if (typeof documentation === 'string') {
    return documentation.replace(/\s+/g, ' ').trim();
  }
  // Prefer xhtml:p text content (the common case for attribute documentation).
  // Schema-level annotation blocks use xhtml:h1 or other block elements instead of xhtml:p,
  // so fall back to a general recursive text extractor when xhtml:p is absent.
  const p = documentation?.['xhtml:p']?.[0];
  const pText: string | undefined = typeof p === 'string' ? p : p?._;
  if (pText) {
    return pText.replace(/\s+/g, ' ').trim();
  }
  return extractAllText(documentation).replace(/\s+/g, ' ').trim();
}

function buildDatatypePropertyLabel(localName: string): string {
  const override = DATATYPE_PROPERTY_LABEL_OVERRIDES[localName];
  if (override) {
    return override;
  }

  const tokens = splitDatatypePropertyLocalName(localName);
  if (tokens.length === 0) {
    return localName;
  }

  return tokens
    .map(token => {
      const uppercaseToken = token.toUpperCase();
      const tokenOverride = DATATYPE_PROPERTY_LABEL_TOKEN_OVERRIDES[uppercaseToken];
      if (tokenOverride) {
        return tokenOverride;
      }
      if (/^[A-Z]+$/.test(token)) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

function splitDatatypePropertyLocalName(localName: string): string[] {
  return Array.from(localName.matchAll(/[A-Z]{2,}(?=[A-Z][a-z]|[a-z]|[0-9]|$)|[A-Z]?[a-z]+|[0-9]+/g), match => match[0]);
}

/**
 * Recursively collects all text content (the `_` property in xml2js output) from a
 * documentation node that may contain arbitrary xhtml child elements.
 */
function extractAllText(node: any): string {
  if (!node) {
    return '';
  }
  if (typeof node === 'string') {
    return node;
  }
  const parts: string[] = [];
  if (typeof node._ === 'string') {
    parts.push(node._);
  }
  for (const [key, value] of Object.entries(node)) {
    if (key === '$' || key === '_') {
      continue;
    }
    for (const child of (Array.isArray(value) ? value : [value])) {
      parts.push(extractAllText(child));
    }
  }
  return parts.join(' ');
}

/** Serialises an array of quads to N-Triples format. */
function triplesToString(triples: Quad[]): string {
  return triples.map(tripleToString).join('');
}

/** Serialises a single quad to a one-line N-Triples statement. */
function tripleToString(quad: Quad): string {
  return `${tri(quad.subject)} ${tri(quad.predicate)} ${tri(quad.object)} .\n`;

  function tri(x: any) {
    const val: string = x.value;
    // Switch on the current term's own type, not quad.object's type.
    switch (x.termType ?? x.constructor?.name) {
      case 'Literal': {
        const literal: Literal = x;
        const escaped = val
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');
        if (literal.language) return `"${escaped}"@${literal.language}`;
        const dt = literal.datatype?.value;
        if (dt && dt !== `${XML_SCHEMA_URI}#string`) {
          return `"${escaped}"^^<${dt}>`;
        }
        return `"${escaped}"`;
      }
      case 'BlankNode':
        return val.startsWith('_:') ? val : `_:${val}`;
      default:
        return `<${val}>`;
    }
  }
}


