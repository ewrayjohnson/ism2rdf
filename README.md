# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

ism2rdf transforms IC XML Schema Definition (XSD) and Schematron source files published by the [U.S. Intelligence Community CIO (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL/SKOS representations, plus XSD-derived SHACL constraints, for use in Linked Data, semantic reasoning, and ontology-driven validation systems.

The XSDs are the primary input and the design center of the transformer: every OWL property, datatype, concept scheme, and SHACL pattern derives from the schema. Schematron is processed as a supplementary input that records the IC's constraint rules in RDF and lowers the safely translatable subset to SHACL.

---

## What It Produces

The primary output is **schema-derived**: for each XSD processed, the transformer emits a self-contained RDF/OWL/SKOS rendering of the schema's types, attributes, enumerations, and facets.

### From each XSD schema

- **OWL ontologies** — one `owl:DatatypeProperty` per schema attribute, with `rdfs:range` pointing at a generated custom datatype.
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
5. Write standalone and convenience artifacts in all serializer targets (`jsonld`, `ttl`, `nt`, `trig` + `tdf`).

The emitted Schematron vocabulary covers document and structural terms such as `ismsch:SchematronDocument`, `ismsch:Schema`, `ismsch:NamespaceDeclaration`, `ismsch:Pattern`, `ismsch:AbstractPattern`, `ismsch:Rule`, `ismsch:AbstractRule`, `ismsch:ResolvedRule`, `ismsch:Assert`, `ismsch:Report`, `ismsch:Include`, `ismsch:ExecutionPhase`, `ismsch:Variable`, `ismsch:Parameter`, and `ismsch:Paragraph`.

### Schema Root Metadata Mapping

The transformer maps ISM self-marking attributes on `xs:schema` to ontology metadata using standard predicates:

- `ism:createDate` -> `dc:date`
- `ism:DESVersion` -> `owl:versionInfo` (prefixed literal `DESVersion:...`)
- `ism:ISMCATCESVersion` -> `owl:versionInfo` (prefixed literal `ISMCATCESVersion:...`)
- `ism:classification` -> `dc:rights`
- `ism:ownerProducer` -> `dc:publisher`
- `ism:compliesWith` -> `dcterms:conformsTo`

For `ism:compliesWith`, the object is emitted as a URI when the schema declares `xmlns:ismcomplies` (for example, `urn:us:gov:ic:cvenum:ism:complieswith#USGov`). If the namespace alias is missing, the transformer falls back to a literal so source intent is still preserved.

- **Detection Principle:** The presence of `ism:classification` is sufficient to detect and process both classified and CUI-marked content. All marked data, including CUI, can be reliably identified by this property.

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

## ISM Package Types and Implementation Alignment

The Office of the Director of National Intelligence (ODNI) issues ISM (Information Security Markings) technical specifications in three package types: Standalone, Convenience, and Light.

- **Standalone Package:** Contains all formal normative documents, XML schemas, and data dictionaries required strictly for strict compliance and implementation.
- **Convenience Package:** Includes everything in the Standalone Package plus additional non-normative resources (like implementation examples and stylesheets) designed to simplify integration.
- **Light Package:** (Not yet implemented in the proof of concept) Intended to provide a minimal subset for lightweight consumers.

The `ism2rdf` proof of concept follows the XML pattern by producing both Standalone and Convenience outputs, mirroring the official ODNI package structure. The Light package is not yet supported.

### CCO Marking Bridge (`cco-marking-bridge.jsonld`)

The file `cco-marking-bridge.jsonld` in `.ciartifacts/config/` provides a mapping (bridge) between CCO (Controlled Classification Overlay) marking concepts and the ISM/OWL vocabulary used by this transformer. It enables interoperability and translation between CCO-based security markings and the ISM2RDF output, ensuring that CCO-specific attributes or concepts can be represented in the RDF/OWL model. This bridge is used during transformation to supplement or align ISM attributes with CCO requirements, especially in environments where both marking systems are in use.

- Location: `.ciartifacts/config/cco-marking-bridge.jsonld`
- Purpose: Mapping/translation between CCO and ISM/OWL vocabularies for security markings
- Usage: Loaded automatically by the transformer to ensure CCO-aligned attributes are correctly represented in the output RDF/OWL artifacts

---

## Configuration

Default RDF namespace prefixes are configured in:

```
.ciartifacts/config/defaultPrefixes.json
```

This file is tracked in Git and should not contain authoritative source content.

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
