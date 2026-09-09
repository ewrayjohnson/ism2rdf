# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

ism2rdf transforms IC XML Schema Definition (XSD) and Schematron source files published by the [U.S. Intelligence Community CIO (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL/SKOS representations, plus XSD-derived SHACL constraints, for use in Linked Data, semantic reasoning, and ontology-driven validation systems.

XSD conversion is the primary pipeline. Schematron is processed as a supplementary input that records constraint rules in RDF and lowers a supported subset to SHACL. This is a transformer, not a complete XML validator or an authorization engine.

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
5. Normalize resource URIs and resolve namespace aliases, then write standalone and convenience artifacts in all serializer targets (`jsonld`, `ttl`, `nt`, `trig` + `tdf`). Literal values are unchanged.

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
│   ├── standalone/        # Per-document graphs retaining import references
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

URN resource identifiers are normalized before serialization. The authority is
explicit: `ISM2RDF_URN_AUTHORITY`, defaulting to the generator's existing
`urn:us:gov:ic` authority. Its colon-separated labels become the HTTPS hostname.
Remaining namespace components are joined with underscores; local identifiers
are retained after `#`.

| Existing namespace | Output namespace | Prefix |
| --- | --- | --- |
| `urn:us:gov:ic:ism#` | `https://urn.us.gov.ic/ism#` | `ism` |
| `urn:us:gov:ic:ISM:` | `https://urn.us.gov.ic/ISM#` | `ISM` |
| `urn:us:gov:ic:IC-ID:` | `https://urn.us.gov.ic/IC-ID#` | `ICID` |
| `urn:us:gov:ic:USAgency:` | `https://urn.us.gov.ic/USAgency#` | `USAgency` |
| `urn:us:gov:ic:ISM:CVEGenerated:` | `https://urn.us.gov.ic/ISM_CVEGenerated#` | `ismcvegenerated` |

Thus `ism:releasableTo` keeps its spelling but now identifies
`https://urn.us.gov.ic/ism#releasableTo`. This is an RDF identity migration:
downstream stores must regenerate or migrate references to the old URNs.
HTTP/HTTPS identifiers, including external ontologies, remain unchanged.

Source vocabulary aliases are reserved before document aliases are assigned.
Existing generated aliases are retained when available; conflicts try the
case-preserving namespace components, then underscore-separated components.
No ontology-specific alias table or numeric suffixes are used. Ambiguous aliases
or URI collisions stop generation with the conflicting identifiers. URNs outside
the configured authority also stop generation rather than being silently rewritten.

JSON-LD, Turtle, N-Triples, TriG, TDF graph names and payloads, and the copied
bridge context use the same mapping. Literal strings and source files are not
rewritten. A namespace declaration alone does not import another ontology.

After generation, run `npm run build` and
`node --test test/uri-mapping.test.mjs test/uri-output.test.mjs`.

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
