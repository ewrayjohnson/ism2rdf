# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

ism2rdf transforms IC XML Schema Definition (XSD) and Schematron source files published by the [U.S. Intelligence Community CIO (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL/SKOS representations, plus XSD-derived SHACL constraints, for use in Linked Data, semantic reasoning, and ontology-driven validation systems.

---

## What It Produces

For each XSD schema processed, the transformer emits:

- **OWL ontologies** — `owl:DatatypeProperty` for each schema attribute
- **SKOS concept schemes** — enumerations become `skos:ConceptScheme` + `skos:Concept` resources
- **SHACL pattern constraints** — regex restrictions become `sh:pattern` properties
- **Typed custom datatypes** — `rdfs:Datatype` with `owl:oneOf` enumerations linked back to concept schemes via `dc:source` and `rdfs:seeAlso`

For each Schematron document processed, the transformer emits source-faithful RDF for schemas, namespace declarations, include chains, phases, patterns, rules, assertions, and reports, plus derived enhancement artifacts:

- **Resolved abstract-pattern rules** (`ismsch:ResolvedRule`) with parameter substitution
- **SHACL shapes for safely translatable constraints** (`sh:minCount`, `sh:hasValue`, `sh:pattern`)
- **Explicit preservation markers** (`ismsch:translationStatus`, `ismsch:translationReason`) for constraints that are not safely auto-translated
- **Schema-term alignment links** (`ismsch:alignsToSchemaTerm`) extracted from rule expressions

### Schematron Processing Pipeline (Implemented)

Schematron processing is fully integrated into the main runtime flow and runs alongside XSD processing:

1. Discover Schematron references from XSD `xml-model` processing instructions.
2. Parse Schematron schemas and recursively resolve `<include>` chains.
3. Emit source-faithful RDF terms for schema structure and constraints.
4. Apply deferred enhancement passes to emit derived rule and validation artifacts.
5. Write standalone and convenience artifacts in all serializer targets (`jsonld`, `ttl`, `nt`, `trig` + `tdf`).

The emitted Schematron vocabulary includes document and structural terms such as:

- `ismsch:SchematronDocument`, `ismsch:Schema`, `ismsch:NamespaceDeclaration`
- `ismsch:Pattern`, `ismsch:AbstractPattern`, `ismsch:Rule`, `ismsch:AbstractRule`, `ismsch:ResolvedRule`
- `ismsch:Assert`, `ismsch:Report`, `ismsch:Include`, `ismsch:ExecutionPhase`
- `ismsch:Variable`, `ismsch:Parameter`, `ismsch:Paragraph`

Deferred enhancement passes include:

- **Abstract-pattern instantiation**: emits `ismsch:ResolvedRule` with parameter-substituted context/test/text.
- **Safe-subset SHACL translation**: emits linked `sh:NodeShape` constraints for supported checks (`sh:minCount`, `sh:hasValue`, `sh:pattern`).
- **Constraint preservation metadata**: records `ismsch:translationStatus` and `ismsch:translationReason` for non-translated constraints.
- **Rule-to-schema alignment extraction**: emits `ismsch:referencesAttribute`, `ismsch:referencesQName`, and `ismsch:alignsToSchemaTerm` candidates.

### Schema Root Metadata Mapping (GAP-07 Decision)

The transformer maps ISM self-marking attributes on `xs:schema` to ontology metadata using standard predicates:

- `ism:createDate` -> `dc:date`
- `ism:DESVersion` -> `owl:versionInfo` (prefixed literal `DESVersion:...`)
- `ism:ISMCATCESVersion` -> `owl:versionInfo` (prefixed literal `ISMCATCESVersion:...`)
- `ism:classification` -> `dc:rights`
- `ism:ownerProducer` -> `dc:publisher`
- `ism:compliesWith` -> `dcterms:conformsTo`

For `ism:compliesWith`, the object is emitted as a URI when the schema declares `xmlns:ismcomplies` (for example, `urn:us:gov:ic:cvenum:ism:complieswith#USGov`). If the namespace alias is missing, the transformer falls back to a literal so source intent is still preserved.

Rationale for review/debate/change:

- `dcterms:conformsTo` is the closest standard semantic for "complies with".
- Using the CVE namespace URI keeps the value linkable to controlled-vocabulary resources.
- Literal fallback prevents silent data loss in non-standard schema variants.

If a different predicate or URI pattern is preferred (for example a custom `ism:` property), this behavior is isolated and can be changed without affecting the rest of the schema conversion pipeline.

All outputs are written in five formats per file: compact **JSON-LD**, human-readable **Turtle**, **N-Triples**, **TriG** (named-graph serialization), and **TDF** (Trusted Data Format payload wrapping the TriG).

Output is written directly under `out/`:

```
out/
├── jsonld/
│   ├── standalone/        # Each schema/schematron as a self-contained graph
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

TypeScript compiler output goes to `dist/`. The entire `out/` and `dist/` trees are excluded from Git.

---

## CVE Pattern

The Controlled Vocabulary Enumeration (CVE) pattern is the core design connecting XSD enumerations to semantic RDF structures. It is described in detail in [Prescriptive _CVE_Pattern.pdf](Prescriptive%20_CVE_Pattern.pdf) included in this repository.

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

Authoritative source payloads are **not stored in this repository**. The current implementation expects staged local source folders to already exist under `.ciartifacts/`:

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

## Installation

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
```

---

## Running the Transformer

Run from the repository root:

```bash
npm start
```

Current runtime behavior:

- Uses staged folders only (`.ciartifacts/Schema` + `.ciartifacts/Schematron`, or legacy `.ciartifacts/schemas` for schema root)
- Writes output under `out/`
- Prints processed XSD and Schematron document counts

The current implementation does not consume source-selection CLI flags (`--source`, `--source-type`, `--source-version`, `--force-refresh`) and does not read `.env` source settings.

---

## Local Source Folder Layout

After acquisition and extraction, the transformer expects these canonical folders:

```
.ciartifacts/
├── Schema/           # XSD schemas (maps from ISM/Schema/ inside ZIP)
│   ├── ISM/
│   │   ├── IC-ISM.xsd
│   │   ├── IC-ARH.xsd
│   │   ├── IC-NTK.xsd
│   │   └── CVEGenerated/
│   ├── ISMCAT/
│   ├── IC-EDH/
│   ├── IC-ID/
│   ├── Taxonomy/
│   └── USAgency/
├── Schematron/       # Schematron rules (maps from ISM/Schematron/ inside ZIP)
│   └── ISM/
│       ├── ISM_XML.sch
│       ├── Lib/      # Abstract pattern libraries
│       └── Rules/    # Concrete rules by jurisdiction and profile
├── config/
│   ├── defaultPrefixes.json
│   └── cco-marking-bridge.jsonld
```

These folders are excluded from Git via `.ciartifacts/.gitignore`.

---

## Configuration

Default RDF namespace prefixes are configured in:

```
.ciartifacts/config/defaultPrefixes.json
```

This file is tracked in Git and should not contain authoritative source content.

---

## Build and Run

Install:

```bash
npm install
```

Build:

```bash
npm run build
```

Run:

```bash
npm start
```

## License

MIT License © 2025 E. Wray Johnson
