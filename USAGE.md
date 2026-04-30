# Usage Guide

This guide describes how to run the current ism2rdf implementation end-to-end, including source acquisition, CLI options, output layout, and validation checks.

---

## 1. Setup

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
```

---

## 2. Source Resolution

Authoritative XSD and Schematron sources are not committed to this repo. Runtime source selection precedence is:

```text
CLI flag -> environment variable -> .env -> built-in default URL
```

Default URL used by `npm start` when no source is provided:

```text
https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
```

### CLI examples

```bash
# URL source (download + cache)
npm start -- --source https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip

# Local ZIP source
npm start -- --source /path/to/ISM-Public-Standalone.zip

# Local extracted directory source
npm start -- --source /path/to/ISM
```

### Environment variable examples

```bash
# Linux/macOS
export ISM2RDF_SOURCE=https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
npm start
```

```powershell
# PowerShell
$env:ISM2RDF_SOURCE = "https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip"
npm start
```

### `.env` example

```ini
ISM2RDF_SOURCE=https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip
ISM2RDF_SOURCE_VERSION=Dec2022
```

Then run:

```bash
npm start
```

---

## 3. Acquisition and Freshness Behavior

When a source is provided, the runtime:

1. Detects source kind (`url`, `zip`, `dir`) unless overridden.
2. Downloads URL sources to `.ciartifacts/downloads/` using conditional HTTP headers (`If-None-Match`, `If-Modified-Since`).
3. Extracts only required ZIP subtrees:
   - `ISM/Schema/` -> `.ciartifacts/Schema/`
   - `ISM/Schematron/` -> `.ciartifacts/Schematron/`
4. Writes `.ciartifacts/source-manifest.json` with source metadata and staged-directory fingerprints.
5. Skips re-extraction when manifest + fingerprints match current request.

Force refresh:

```bash
npm start -- --source <value> --force-refresh
```

If default URL download fails (for example HTTP 403) and local staged folders already exist, the runtime automatically falls back to local staged sources:

- `.ciartifacts/Schema` (or legacy `.ciartifacts/schemas`)
- `.ciartifacts/Schematron`

---

## 4. CLI Options

| Option | Env variable | Description |
|--------|-------------|-------------|
| `--source <value>` | `ISM2RDF_SOURCE` | URL, ZIP path, or directory path |
| `--source-type <auto\|url\|zip\|dir>` | `ISM2RDF_SOURCE_TYPE` | Override auto-detection |
| `--source-version <label>` | `ISM2RDF_SOURCE_VERSION` | Version label used for source metadata and cache naming |
| `--force-refresh` | `ISM2RDF_FORCE_REFRESH=true` | Force re-download/re-extract even when manifest is current |

---

## 5. What Gets Emitted

### XSD conversion output

Per schema, the runtime emits RDF/OWL/SKOS artifacts (plus XSD-derived SHACL pattern constraints), including:

- `owl:Ontology`
- `owl:DatatypeProperty` for attributes
- `skos:ConceptScheme` / `skos:Concept` for enumerations
- `rdfs:Datatype` + `owl:oneOf` for constrained value sets

### Schematron conversion output

Per `.sch` file, the runtime emits source-faithful RDF model elements, including:

- `ismsch:SchematronDocument`
- `ismsch:Schema`
- `ismsch:Pattern`, `ismsch:Rule`, `ismsch:Assert`, `ismsch:Report`
- `ismsch:Variable`, `ismsch:Parameter`, `ismsch:Paragraph`
- `ismsch:ExecutionPhase`, `ismsch:PhaseActivation`, `ismsch:PatternReference`
- `ismsch:Include`

Note: Schematron output remains source-faithful as the baseline model, and now also includes:

- resolved abstract-pattern rule expansions (`ismsch:ResolvedRule`),
- SHACL translation for a safe subset (`sh:minCount`, `sh:hasValue`, `sh:pattern`), and
- explicit preservation markers for non-translated constraints (`ismsch:translationStatus`, `ismsch:translationReason`).

---

## 6. Output Layout

Outputs are written under:

```text
out/transformed/
```

Layout:

```text
out/transformed/
├── Schema/
│   ├── standalone/      # Per-schema graph with imports
│   └── convenience/     # Per-schema graph with imports merged inline
└── Schematron/
    ├── standalone/      # Per-document .sch RDF graph
    └── convenience/     # Per-document graph with includes merged inline
```

Each graph is emitted in all three formats:

- `.jsonld`
- `.ttl`
- `.nt`

---

## 7. Runtime Signals

A successful full run prints:

```text
Output directory: ...\out\transformed
Processed <N> XSD documents
Processed <M> Schematron documents
```

The current implementation commonly reports values such as 44 XSD and 451 Schematron documents depending on source contents.

Warnings can appear for specific enumeration entries with missing documentation and do not necessarily indicate run failure.

---

## 8. Configuration File

Default RDF prefixes are loaded from:

```text
.ciartifacts/config/defaultPrefixes.json
```

---

## 9. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `No source provided` error | Neither source flags/env nor staged folders exist | Provide `--source` or populate staged folders |
| `ZIP source does not exist` | Bad file path | Use correct absolute/relative path |
| `Could not locate required Schema/Schematron prefixes in ZIP` | ZIP layout does not match expected prefixes | Use `--source-type dir` with an extracted folder containing Schema + Schematron trees |
| Output appears stale | Manifest freshness check reused staged source | Run with `--force-refresh` |
| Default URL fails with HTTP 403 | Network restrictions | Use local ZIP/dir source or rely on staged-folder fallback |

---

For issues or enhancements, open a GitHub issue or PR.

