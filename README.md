# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

ism2rdf transforms IC XML Schema Definition (XSD) and Schematron source files published by the [U.S. Intelligence Community CIO (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL/SKOS/SHACL representations for use in Linked Data, semantic reasoning, and ontology-driven validation systems.

---

## What It Produces

For each XSD schema processed, the transformer emits:

- **OWL ontologies** — `owl:DatatypeProperty` for each schema attribute
- **SKOS concept schemes** — enumerations become `skos:ConceptScheme` + `skos:Concept` resources
- **SHACL pattern constraints** — regex restrictions become `sh:pattern` properties
- **Typed custom datatypes** — `rdfs:Datatype` with `owl:oneOf` enumerations linked back to concept schemes via `dc:source` and `rdfs:seeAlso`

For each Schematron document processed, the transformer emits a source-faithful RDF representation covering: schemas, namespace declarations, include chains, phases, patterns, rules, assertions, reports, variables, parameters, and paragraphs.

All outputs are written in three formats per file: compact **JSON-LD**, human-readable **Turtle**, and triple-store-compatible **N-Triples**.

Output is written under a version-named subdirectory so each release of the authoritative source produces a discrete, non-overwriting output set:

```
out/transformed/
└── <version>/             # e.g. Dec2022, or "current" when no version is specified
    ├── standalone/        # Each schema as a self-contained owl:Ontology with owl:imports
    ├── convenience/       # Same schemas merged — all imports inlined for direct querying
    └── schematron/
        ├── standalone/    # Each Schematron document as its own RDF graph
        └── convenience/   # Same Schematron graphs with all includes merged inline
```

The version segment is derived from `--source-version` (or `ISM2RDF_SOURCE_VERSION`). When no version is provided it defaults to `current`. The entire `out/` tree is excluded from Git.

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

Authoritative source payloads are **not stored in this repository**. They must be provided at runtime. The transformer supports three source modes and resolves them in this precedence order:

```
CLI argument  →  environment variable  →  .env file  →  existing local folders
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
ISM2RDF_SOURCE_VERSION=Dec2022
```

```bash
npm start
```

### Force re-download and re-extract even if nothing changed

```bash
npm start -- --source <value> --force-refresh
```

### No source argument — use existing local folders

If `.ciartifacts/Schema` and `.ciartifacts/Schematron` are already populated (e.g. from a previous run), the transformer uses them directly with no source argument required:

```bash
npm start
```

### All CLI options

| Option | Env variable | Description |
|--------|-------------|-------------|
| `--source <value>` | `ISM2RDF_SOURCE` | URL, ZIP path, or directory path |
| `--source-type <auto\|url\|zip\|dir>` | `ISM2RDF_SOURCE_TYPE` | Override auto-detection |
| `--source-version <label>` | `ISM2RDF_SOURCE_VERSION` | Version label — used as the output subfolder name (e.g. `Dec2022`) |
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

## License

MIT License © 2025 E. Wray Johnson

### Source Input Precedence

Source can be provided by:

1. CLI argument
2. Environment variable
3. `.env`

Precedence is exactly in that order.

Supported keys:

- `--source` or `ISM2RDF_SOURCE`
- `--source-type` or `ISM2RDF_SOURCE_TYPE` (`auto`, `url`, `zip`, `dir`)
- `--source-version` or `ISM2RDF_SOURCE_VERSION`
- `--force-refresh` or `ISM2RDF_FORCE_REFRESH`

Examples:

```bash
# URL source
npm start -- --source https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip

# Local ZIP source
npm start -- --source C:/data/ISM-Public-Standalone.zip --source-type zip

# Local extracted source directory
npm start -- --source C:/data/ISM --source-type dir

# Force refresh from remote
npm start -- --source https://example.org/source.zip --force-refresh
```

## Retrieval, Extraction, and Normalization

When a source is provided, the runtime performs these phases:

1. Resolve source kind (`url`, `zip`, `dir`).
2. Acquire payload if needed:
   - URL downloads to `.ciartifacts/downloads/`.
   - ZIP and directory sources are validated directly.
3. For ZIP sources, selectively extract only relevant prefixes.
4. Normalize into canonical local processing roots:
   - `.ciartifacts/Schema`
   - `.ciartifacts/Schematron`
5. Process those canonical folders into RDF outputs under `out/transformed/`.

For ISM standalone ZIPs, expected mappings are:

- `ISM/Schema/...` -> `.ciartifacts/Schema/...`
- `ISM/Schematron/...` -> `.ciartifacts/Schematron/...`

Legacy local path `.ciartifacts/schemas` is still accepted for compatibility when no explicit source is provided.

## Freshness and Run Intent

The runtime keeps a source manifest at `.ciartifacts/source-manifest.json` and uses it to detect whether cached/extracted inputs are still current for the requested source/version.

If unchanged, staging is reused.
If changed (or forced), content is re-acquired/re-staged.

## Local Data Policy

Authoritative source payloads and extracted source trees are ignored by Git in `.ciartifacts/.gitignore`.

This keeps the repository focused on code, config, and generated outputs policy while still allowing deterministic local runs.

## Controlled Vocabulary Enumeration (CVE) Pattern

The CVE modeling approach in this repository aligns schema-enumerated datatypes with SKOS concept schemes and notations.

For the detailed prescriptive description used in this project, see:

- [Prescriptive _CVE_Pattern.pdf](Prescriptive%20_CVE_Pattern.pdf)

At a high level, the transform emits:

- `owl:DatatypeProperty` with constrained range datatypes
- `owl:oneOf` literal sets where appropriate
- `skos:ConceptScheme` and `skos:Concept` resources
- traceability links via `dc:source` and `rdfs:seeAlso`

## Configuration

Default prefix mappings are loaded from:

- `.ciartifacts/config/defaultPrefixes.json`

Optional source keys may be supplied in `.env`.

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
