# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

ism2rdf transforms IC XML Schema Definition (XSD) and Schematron source files published by the [U.S. Intelligence Community CIO (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL/SKOS representations, plus XSD-derived SHACL constraints, for use in Linked Data, semantic reasoning, and ontology-driven validation systems.

XSD conversion is the primary pipeline. Schematron is processed as a supplementary input that records constraint rules in RDF and lowers a supported subset to SHACL. This is a transformer, not a complete XML validator or an authorization engine.

Implementation and tests are Node.js-only. Do not introduce Python code or Python
runtime/test dependencies. Membership XSD validation uses an npm-packaged
WebAssembly validator inside Node.js, without external executables.

**Existing users:** resource identifiers now use normalized HTTPS namespaces. Read [MIGRATION.md](MIGRATION.md) before replacing existing output. Compact property names remain familiar, but their expanded RDF identities change.

---

## What It Produces

The primary output is **schema-derived**: the transformer emits the supported type, attribute, enumeration, and pattern mappings. Standalone output retains import references; convenience output merges imported graphs. Namespace normalization does not extend the underlying XSD conversion coverage.

### From each XSD schema

- **OWL declarations** — ontology documents, named element/type/group classes, and global attributes with builtin or generated datatype ranges. Local attribute uses receive cardinality restrictions; not every local declaration or anonymous type is emitted as a standalone resource.
- **Custom datatypes** — `rdfs:Datatype` declarations with `owl:oneOf` enumerations linked back to the corresponding `skos:ConceptScheme` via `dc:source` and `rdfs:seeAlso`.
- **SKOS concept schemes** — XSD enumerations become `skos:ConceptScheme` resources whose `skos:Concept` members carry `skos:notation` and (when XSD documentation is present) `skos:prefLabel`.
- **SHACL pattern constraints** — regex facets on simple types become `sh:pattern` properties on the matching shape, derived directly from the XSD without hand authoring.
- **Schema header metadata** — ISM self-marking attributes on `xs:schema` are mapped to standard predicates on the emitted `owl:Ontology` (see [Schema Root Metadata Mapping](#schema-root-metadata-mapping) below).

The full pattern that ties these pieces together — datatype property → custom datatype → concept scheme — is documented in [CVE Pattern](#cve-pattern).

### Supplementary membership data

Membership data can be staged as a replaceable XML instance validated against
`Schema/ISMCAT/Tetragraph.xsd`. Its RDF mirrors the XML elements, attributes,
metadata and nesting; country and organization tokens remain literal values.
Instance elements are blank nodes, nested in JSON-LD without minted record URLs.
Compact output defaults to omitting the exact U/USA pair when it is an object's
only ISM metadata; set `compact: false` to preserve it. This is a scoped taxonomy
output convention, not a global marking default.
Compact mode also represents text elements left without metadata as direct
literals, such as `"tetra:TetraToken": "IPMC"`.
The instance is exported separately and included alongside its schema in
configured convenience outputs, including IC-EDH. Multiple CVEs can use the same
independent taxonomy; membership records are not copied per CVE or filtered by
CVE coverage. CVEs contain no membership facts. See
[Tetragraph membership XML](USAGE.md#tetragraph-membership-xml)
for input, output, and semantic boundaries.

### From each Schematron document (supplementary)

Schematron processing runs alongside XSD processing and captures the IC's published rule set in RDF form for use by validators and reviewers.

- Source-faithful RDF for Schematron schemas, namespaces, includes, phases, patterns, rules, asserts, and reports.
- Resolved abstract-pattern rules (`ismsch:ResolvedRule`) with parameter substitution.
- SHACL shapes for the safely translatable subset (`sh:minCount`, `sh:hasValue`, `sh:pattern`).
- Preservation markers (`ismsch:translationStatus`, `ismsch:translationReason`) on constraints that cannot be auto-translated.
- Schema-term alignment links (`ismsch:alignsToSchemaTerm`) connecting rule expressions back to the schema attributes they reference.

### Processing Pipeline

XSD processing is the main pipeline; Schematron processing runs as a deferred pass against the schema-derived graph so its outputs can reference the same IRIs.

1. Load staged XSDs from `.ciartifacts/Schema` and walk imports/includes.
2. Emit OWL, SKOS, custom datatypes, SHACL `sh:pattern` shapes, and ontology header metadata for every schema.
3. Discover Schematron references from XSD `xml-model` processing instructions; parse the Schematron schemas and recursively resolve `<include>` chains.
4. Emit source-faithful Schematron RDF, then run the deferred enhancement passes:
   - abstract-pattern instantiation (`ismsch:ResolvedRule`),
   - safe-subset SHACL translation,
   - constraint preservation metadata,
   - rule-to-schema alignment extraction.
5. Assemble XSDs by target namespace, then write each ontology standalone and with its transitive imports. Normalize resource URIs in all serializer targets (`jsonld`, `ttl`, `nt`, `trig` + `tdf`). Literal values are unchanged.

The emitted Schematron vocabulary covers document and structural terms such as `ismsch:SchematronDocument`, `ismsch:Schema`, `ismsch:NamespaceDeclaration`, `ismsch:Pattern`, `ismsch:AbstractPattern`, `ismsch:Rule`, `ismsch:AbstractRule`, `ismsch:ResolvedRule`, `ismsch:Assert`, `ismsch:Report`, `ismsch:Include`, `ismsch:ExecutionPhase`, `ismsch:Variable`, `ismsch:Parameter`, and `ismsch:Paragraph`.

### Schema Root Metadata Mapping

The transformer maps ISM self-marking attributes on `xs:schema` to ontology metadata using standard predicates:

- `ism:createDate` -> `dc:date`
- `ism:DESVersion` -> `owl:versionInfo` (prefixed literal `DESVersion:...`)
- `ism:ISMCATCESVersion` -> `owl:versionInfo` (prefixed literal `ISMCATCESVersion:...`)
- `ism:classification` -> `dc:rights`
- `ism:ownerProducer` -> `dc:publisher`
- `ism:compliesWith` -> `dcterms:conformsTo`

The current implementation emits the `ism:compliesWith` value as a literal on
`dcterms:conformsTo`. Source-URI strings in literals are not changed by URI
normalization. Header metadata mapping does not enforce access decisions.

Generated documents are written as compact **JSON-LD**, **Turtle**, **N-Triples**,
**TriG**, and a **TDF** JSON wrapper containing the base64 TriG payload, SHA-256
hash, graph identifier and metadata. This wrapper does not provide encryption.

Output is written directly under `out/`:

```
out/
├── jsonld/
│   ├── standalone/        # Per-ontology schema graphs; per-document Schematron
│   │   ├── Schema/
│   │   └── Schematron/
│   └── convenience/       # All imports/includes merged inline
│       ├── Schema/
│       └── Schematron/
├── ttl/
│   ├── standalone/
│   │   ├── Schema/
│   │   └── Schematron/
│   └── convenience/
│       ├── Schema/
│       └── Schematron/
├── nt/
│   ├── standalone/
│   │   ├── Schema/
│   │   └── Schematron/
│   └── convenience/
│       ├── Schema/
│       └── Schematron/
└── trig/                  # TriG + TDF pairs
    ├── standalone/
    │   ├── Schema/
    │   ├── Schematron/
    │   └── manifest.json  # Combined TriG+TDF manifest for standalone mode
    └── convenience/
        ├── Schema/
        ├── Schematron/
        └── manifest.json  # Combined TriG+TDF manifest for convenience mode
```

Each `manifest.json` records a single entry per artifact pair with `trigPath`, `tdfPath`, `payloadSha256`, `graphName`, `category`, `mode`, and `createdAt`.

The configured CCO bridge is copied as a `.jsonld` file under each format/mode's
`Schema/` directory, with a normalized context. It is not converted into a
separate Turtle, N-Triples, TriG or TDF document. Generation overwrites current
artifacts but does not remove obsolete files from earlier source sets.

TypeScript compiler output goes to `dist/`. The entire `out/` and `dist/` trees are excluded from Git.

### RDF URI normalization

The input authority is `ISM2RDF_URN_AUTHORITY`, defaulting to `urn:us:gov:ic`.
The independent `ISM2RDF_HTTPS_BASE` defaults to `https://ns.dni.ic.gov/`, a
proposed proof-of-concept root, not an assigned endpoint. See
[USAGE](USAGE.md#configuration) for configuration.

XSD target namespaces determine ontology identity. Namespace components become
case-preserving path segments, except `cvenum:<vocabulary>:<remainder>`, which
becomes `<vocabulary>/cvenum/<remainder>`. Term namespaces append `#`; local
names and explicitly declared source aliases are preserved.

| Source namespace | Ontology identifier | Term prefix |
| --- | --- | --- |
| `urn:us:gov:ic:ism` | `https://ns.dni.ic.gov/ism` | `ism` |
| `urn:us:gov:ic:usagency` | `https://ns.dni.ic.gov/usagency` | `usagency` |
| `urn:us:gov:ic:cvenum:ism:classification:all` | `https://ns.dni.ic.gov/ism/cvenum/classification/all` | `ismclassall` |
| `urn:us:gov:ic:cvenum:ism:sar` | `https://ns.dni.ic.gov/ism/cvenum/sar` | `ismsar` |

Thus `ism:releasableTo` identifies `https://ns.dni.ic.gov/ism#releasableTo`.
External HTTP/HTTPS vocabulary identifiers, including the existing CCO bridge
terms, are unchanged. Different source namespaces mapping to one URI, conflicting
prefix assignments, and case-insensitive output-path collisions stop generation.

### Ontology assembly and dependencies

All staged XSDs sharing a target namespace contribute to one `owl:Ontology`.
For example, the two SAR schemas contribute definitions and metadata to one SAR
ontology. Header metadata is combined; different source values are retained as
multiple assertions rather than choosing a version silently. Source paths are
recorded as `dcterms:source` literals relative to the schema root.

Assembly folders such as `CVEGenerated` do not create semantic namespaces.
Directory-derived aliases such as `ISM`, `USAgency`, and `ismcvegenerated` are
no longer generated. The corresponding explicit vocabulary aliases remain.

Imports identify ontologies using `xs:import/@namespace`. When supplied,
`schemaLocation` locates the source and must match its declared target namespace.
Imported namespaces must be staged locally. A namespace declaration alone does
not import an ontology; imports within the same target namespace do not create
self-imports.

Every schema ontology gets a standalone output with its own content and import
references, plus a convenience output with only its transitive imports merged.
ISM can be consumed independently of EDH: EDH importing ISM never makes ISM
import EDH. Graph identifiers append `/graph/standalone` or
`/graph/convenience` to the ontology identifier.

Schema artifacts mirror source folders and filenames, changing only the extension:
`Schema/ISM/IC-ISM.xsd` produces `Schema/ISM/IC-ISM.jsonld`. Assembly folders
such as `CVEGenerated` remain physical output folders, not semantic namespaces.
Files sharing a target namespace publish identical assembled content at their
respective source-mirrored paths. The manifest records each location with the
same graph identifier; consumers should load only one location per graph.
The staged sources therefore produce 44 schema artifact locations for 43
distinct ontology graphs in each mode.
Schematron remains document-oriented with its existing identifiers and layout.
The manifests enumerate the current artifacts; obsolete files are not deleted.

JSON-LD, Turtle, N-Triples, TriG, TDF payloads and the copied bridge context use
the same namespace mapping. Literal strings and source files are not rewritten.
Existing generated local names containing colons, including `...:Shape`, remain
unchanged; this change does not assert complete RDF9 compatibility for those names.

Read [MIGRATION](MIGRATION.md) before replacing existing output, then run the
[validation commands](USAGE.md#outputs-and-checks).

---

## CVE Pattern

The Controlled Vocabulary Enumeration (CVE) pattern connects XSD enumerations
to RDF structures. [Prescriptive _CVE_Pattern.pdf](Prescriptive%20_CVE_Pattern.pdf)
is the background design reference; the current URI and launch contracts are
documented here, in [MIGRATION.md](MIGRATION.md), and in [USAGE.md](USAGE.md).

### Summary

An `owl:DatatypeProperty` references a custom `rdfs:Datatype` whose valid literal values are constrained via `owl:oneOf` to exactly match the `skos:notation` literals of `skos:Concept` members of a linked `skos:ConceptScheme`. This makes enumerated values simultaneously:

- **Formally constrained** for data validation
- **Semantically enriched** as browsable, linkable concepts
- **Traceable** — `dc:source` and `rdfs:seeAlso` connect the datatype back to the concept scheme

The CVE pattern facts in detail:

1. An `owl:DatatypeProperty` has `rdfs:range` pointing to a **custom datatype**.
2. The custom datatype is an `rdfs:Datatype` with `owl:equivalentClass → owl:oneOf` listing allowed literals, plus `dc:source` / `rdfs:seeAlso` linking to a `skos:ConceptScheme`.
3. The `skos:ConceptScheme` references all concepts via `skos:hasTopConcept`.
4. Each `skos:Concept` has `skos:inScheme`, a `skos:notation` matching one `owl:oneOf` literal, and a `skos:prefLabel` from XSD documentation annotations.

---

## Source Inputs

This checkout contains tracked source payloads. The loader expects local source
folders to exist under `.ciartifacts/`:

- `.ciartifacts/Schema`
- `.ciartifacts/Schematron`

If `.ciartifacts/Schema` is missing, the runtime also accepts the legacy fallback `.ciartifacts/schemas`.

If required staged folders are missing, the transformer exits with an error and does not attempt network download, ZIP extraction, `.env` resolution, or CLI source selection.

### Overlaying Source Files

In environments where source content differs from the public baseline (for example classified or disconnected enclaves, or later ISM releases), stage and overlay the local authoritative files directly into:

- `.ciartifacts/Schema`
- `.ciartifacts/Schematron`

The transformer always reads whatever is currently staged in those folders. This lets you keep one codebase while supplying environment-specific source overlays without changing runtime flags.

---

## Local Source Folder Layout

Ensure the intended source files are present in these folders before running:

```
.ciartifacts/
├── Schema/           # XSD schemas (maps from ISM/Schema/ inside ZIP)
│   ├── ISM/
│   ├── ISMCAT/
│   ├── IC-EDH/
│   ├── IC-ID/
│   ├── Taxonomy/
│   └── USAgency/
├── Schematron/       # Schematron rules (maps from ISM/Schematron/ inside ZIP)
│   └── ISM/
│       ├── Lib/      # Abstract pattern libraries
│       └── Rules/    # Concrete rules by jurisdiction and profile
└── config/
    ├── defaultPrefixes.json
    └── cco-marking-bridge.jsonld
```

The `Schema/`, `Schematron/`, and configuration files include tracked content.
The local ignore file excludes ZIPs, downloads, legacy `schemas/`, and optional
`source/` staging; it does not make edits to tracked payloads private.

The transformer always reads whatever is currently staged in those folders. No automated acquisition or extraction is performed; users are responsible for ensuring the correct files are present.

---

## Build and Run

Install dependencies and build the project:

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
npm run build
```

Run from the repository root using [USAGE.md](USAGE.md#run). The existing
`npm start` script uses `ts-node`; the usage guide includes the verified ESM
loader command for Node.js 24 and the current lint limitation.

Current runtime behavior:
- Uses staged folders only (`.ciartifacts/Schema` + `.ciartifacts/Schematron`, or legacy `.ciartifacts/schemas` for schema root)
- Writes output under `out/`
- Prints processed XSD and Schematron document counts

The current implementation does not consume source-selection CLI flags (`--source`, `--source-type`, `--source-version`, `--force-refresh`) and does not read `.env` source settings.
