# Usage Guide

This guide covers setup, source acquisition, running the transformer, and interpreting outputs.

---

## 1. Project Setup

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
```

---

## 2. Providing Authoritative Sources

Authoritative source files (XSD schemas and Schematron rules) are **not stored in this repository**. You must supply a source on each run via one of these mechanisms, in order of precedence:

### Option A — CLI argument

```bash
# URL (downloaded and cached automatically)
npm start -- --source https://www.dni.gov/files/documents/CIO/ICEA/Dec2022/ISM/ISM-Public-Standalone.zip --source-version Dec2022

# Local ZIP
npm start -- --source /path/to/ISM-Public-Standalone.zip --source-version Dec2022

# Already-extracted directory
npm start -- --source /path/to/ISM --source-version Dec2022
```

### Option B — Environment variable

```bash
export ISM2RDF_SOURCE=https://www.dni.gov/.../ISM-Public-Standalone.zip
export ISM2RDF_SOURCE_VERSION=Dec2022
npm start
```

### Option C — `.env` file (create at project root)

```ini
ISM2RDF_SOURCE=https://www.dni.gov/.../ISM-Public-Standalone.zip
ISM2RDF_SOURCE_VERSION=Dec2022
```

Then just:

```bash
npm start
```

### Option D — Pre-staged local folders (no source argument)

If `.ciartifacts/Schema` and `.ciartifacts/Schematron` are already populated from a previous run, the transformer reuses them directly:

```bash
npm start
```

---

## 3. Source Acquisition Behaviour

When a `--source` is given, the transformer:

1. **Detects source type** (URL / ZIP / directory) automatically, or as overridden by `--source-type`.
2. **Downloads** (URL only) to `.ciartifacts/downloads/`, using HTTP conditional requests (`If-None-Match` / `If-Modified-Since`) to avoid re-downloading unchanged content.
3. **Extracts** only the required subtrees from a ZIP:
   - `ISM/Schema/` → `.ciartifacts/Schema/`
   - `ISM/Schematron/` → `.ciartifacts/Schematron/`
4. **Skips extraction** if a `.ciartifacts/source-manifest.json` proves nothing changed since the last run.
5. **Writes a manifest** recording source, version, hashes, HTTP metadata, and directory fingerprints for the next run.

Use `--force-refresh` to override the freshness check and always re-download/re-extract.

---

## 4. All CLI Options

| Option | Env variable | Description |
|--------|-------------|-------------|
| `--source <value>` | `ISM2RDF_SOURCE` | URL, ZIP path, or directory |
| `--source-type <auto\|url\|zip\|dir>` | `ISM2RDF_SOURCE_TYPE` | Override auto-detection |
| `--source-version <label>` | `ISM2RDF_SOURCE_VERSION` | Version label — also names the output subfolder |
| `--force-refresh` | `ISM2RDF_FORCE_REFRESH=true` | Re-download and re-extract unconditionally |

---

## 5. Output Structure

Outputs are written under a **version-named subdirectory** so different source releases never overwrite each other. When no version is provided the subfolder is named `current`.

```
out/transformed/
└── <version>/                  # e.g. Dec2022, or "current"
    ├── standalone/             # Each schema as its own owl:Ontology with owl:imports
    │   └── ISM/
    │       ├── IC-ISM.jsonld
    │       ├── IC-ISM.ttl
    │       ├── IC-ISM.nt
    │       └── CVEGenerated/
    ├── convenience/            # Same schemas with all imports inlined
    └── schematron/
        ├── standalone/         # Each .sch file as its own RDF graph
        │   └── ISM/
        │       ├── ISM_XML.jsonld
        │       ├── ISM_XML.ttl
        │       ├── ISM_XML.nt
        │       ├── Lib/
        │       └── Rules/
        └── convenience/        # Schematron graphs with all includes merged
```

Each file is emitted in three formats:
- `.jsonld` — Compact JSON-LD
- `.ttl` — Human-readable Turtle
- `.nt` — N-Triples

The entire `out/` tree is excluded from Git.

---

## 6. Prefix Configuration

Namespace prefixes used across all outputs are configured in:

```
.ciartifacts/config/defaultPrefixes.json
```

This file is tracked in Git and safe to edit.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `No source provided` error | No `--source` and `.ciartifacts/Schema` or `Schematron` missing | Supply `--source` or populate the folders |
| `ZIP source does not exist` | Path passed to `--source` is wrong | Use an absolute path or relative to project root |
| `Could not locate required Schema/Schematron prefixes in ZIP` | Non-standard ZIP layout | Set `--source-type dir` and point to the extracted folder instead |
| Stale outputs after source update | Freshness check reused old files | Re-run with `--force-refresh` |
| Node.js module errors | Outdated Node.js | Use Node.js v18 or later |

---

For questions or contributions, open a [GitHub Issue](https://github.com/ewrayjohnson/ism2rdf/issues) or Pull Request.

