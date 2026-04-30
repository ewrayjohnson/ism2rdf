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

All outputs are written in three formats per file: compact **JSON-LD**, human-readable **Turtle**, and triple-store-compatible **N-Triples**.

Output is written directly under `out/transformed`:

```
out/transformed/
├── Schema/
│   ├── standalone/        # Each schema as a self-contained owl:Ontology with owl:imports
│   └── convenience/       # Same schemas merged — all imports inlined for direct querying
└── Schematron/
    ├── standalone/        # Each Schematron document as its own RDF graph
    └── convenience/       # Same Schematron graphs with all includes merged inline
```

The entire `out/` tree is excluded from Git.

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

## Authoritative Sources

Authoritative source payloads are **not stored in this repository**. The transformer resolves source configuration in this precedence order:

```
CLI argument  →  environment variable  →  .env file  →  built-in default URL
```

### Source Modes

| Mode | Description | Example value |
|------|-------------|---------------|
| `url` | Download from HTTP/HTTPS, cache locally | `https://www.dni.gov/.../ISM-Public-Standalone.zip` |
| `zip` | Use a local ZIP archive | `.ciartifacts/ISM-Public-Standalone.zip` or an absolute path |
| `dir` | Use an already-extracted directory | `/path/to/ISM` |

Source type is auto-detected from the value, or can be overridden with `--source-type`.

### Where to Get the Source

For the public ISM domain, the authoritative release package is published at the IC CIO technical specifications page:

> **[https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications)**

A specific release ZIP URL looks like:

```
https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
```

Different versions live at different paths. In some classified or restricted domains, the source may not be a ZIP and may arrive as a folder or a web path with a different layout.

### ZIP Internal Layout

The transformer knows how to extract the required subsets from a standard ISM release ZIP. It searches for these prefixes automatically:

| ZIP path prefix | Extracted to |
|-----------------|-------------|
| `ISM/Schema/` | `.ciartifacts/Schema/` |
| `ISM/Schematron/` | `.ciartifacts/Schematron/` |

Only those two subtrees are extracted — the rest of the archive (CVE raw data, XSL transforms, examples, schema guides, XSPEC tests) is ignored.

### Freshness and Caching

On every run, the transformer decides whether to re-download or re-extract by checking a manifest stored at `.ciartifacts/source-manifest.json`. It records:

- Source URL/path and version
- HTTP ETag and Last-Modified (for URL sources)
- SHA-256 hash and size of the cached file
- Directory content fingerprints for `Schema` and `Schematron` folders
- Extraction timestamp

If the manifest matches the current request and neither folder has changed since extraction, the existing staged files are reused. Use `--force-refresh` to override.

---

## Installation

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
```

---

## Running the Transformer

### Default run (no arguments)

By default, `npm start` uses this authoritative source URL:

```
https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
```

```bash
npm start
```

Note: some environments may receive HTTP 403 from direct DNI downloads. If default-source download fails and local staged folders already exist (`.ciartifacts/Schema` plus `.ciartifacts/Schematron`), the runtime automatically falls back to those local sources. Otherwise, provide a local ZIP or alternate source explicitly.

### With a URL source (downloaded and cached automatically)

```bash
npm start -- --source https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
```

### With a local ZIP

```bash
npm start -- --source /path/to/ISM-Public-Standalone.zip
```

### With a local extracted directory

```bash
npm start -- --source /path/to/ISM
```

### Using environment variable or `.env`

```ini
# .env
ISM2RDF_SOURCE=https://www.dni.gov/.../ISM-Public-Standalone.zip
```

```bash
npm start
```

### Force re-download and re-extract even if nothing changed

```bash
npm start -- --source <value> --force-refresh
```

### Local fallback behavior

If default-source download fails (for example HTTP 403) and local staged folders already exist, the runtime automatically falls back to them:

```bash
npm start
```

Fallback roots are:

- `.ciartifacts/Schema` (or legacy `.ciartifacts/schemas`)
- `.ciartifacts/Schematron`

### All CLI options

| Option | Env variable | Description |
|--------|-------------|-------------|
| `--source <value>` | `ISM2RDF_SOURCE` | URL, ZIP path, or directory path |
| `--source-type <auto\|url\|zip\|dir>` | `ISM2RDF_SOURCE_TYPE` | Override auto-detection |
| `--source-version <label>` | `ISM2RDF_SOURCE_VERSION` | Version label for source selection, caching, and manifest metadata |
| `--force-refresh` | `ISM2RDF_FORCE_REFRESH=true` | Force re-download and re-extract |

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
│   └── defaultPrefixes.json
└── source-manifest.json   # Written after each acquisition run
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
