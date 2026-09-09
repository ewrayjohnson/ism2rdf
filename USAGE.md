# Usage Guide

For output semantics, see [README](README.md). Existing consumers should read
[Migration from URN output](MIGRATION.md) before replacing generated artifacts.

## Setup and local sources

The package declares Node.js 18 or newer. Install Node.js dependencies and check
the TypeScript build from the repository root:

```sh
npm install
npm run build
```

The active loader reads these local paths:

| Path | Purpose |
| --- | --- |
| `.ciartifacts/Schema/` | XSD source tree, including relative imports/includes |
| `.ciartifacts/Schematron/` | Schematron source tree and included rules |
| `.ciartifacts/config/defaultPrefixes.json` | Initial RDF prefix mappings |
| `.ciartifacts/config/cco-marking-bridge.jsonld` | Required JSON-LD bridge copied into output |

This checkout includes tracked source files. If `Schema/` is absent, the loader
accepts the legacy `.ciartifacts/schemas/` directory. Both the schema tree and
Schematron tree must exist. An empty schema tree fails generation.

For classified, disconnected, or updated source sets, replace the local source
trees while retaining their relative paths. No code change or source-selection
flag is needed. Review Git status before committing: replacing tracked files
creates changes eligible for commit. Dependency installation may require a
network connection or a locally provisioned npm cache; transformation reads
staged files without downloading source packages.

## Run

The existing npm script invokes `ts-node index.ts`:

```sh
npm start
```

On Node.js 24, that entry point can fail with an unknown `.ts` extension. The
following source-entry command was used to validate the current implementation.
Build first because `TS_NODE_TRANSPILE_ONLY` skips runtime type checking.

PowerShell:

```powershell
npm run build
$env:TS_NODE_TRANSPILE_ONLY = 'true'
node --loader ts-node/esm index.ts
Remove-Item Env:TS_NODE_TRANSPILE_ONLY
```

POSIX shell:

```sh
npm run build
TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm index.ts
```

Use the source entry point from the repository root. Directly running
`node dist/index.js` is not an equivalent launch command in the current code:
workspace-root detection does not account for `dist/`.

## Configuration

`ISM2RDF_URN_AUTHORITY` is read from the process environment before generation.
It defaults to `urn:us:gov:ic`, which maps to the hostname `urn.us.gov.ic`.
It also supplies the generator's document-URI authority. Set it only when the
source URNs use the corresponding authority.

```powershell
$env:ISM2RDF_URN_AUTHORITY = 'urn:example:org'
```

The value must contain `urn:` followed by colon-separated hostname labels.
See [URI normalization](README.md#rdf-uri-normalization) for the mapping and
collision rules. Existing HTTP/HTTPS identifiers are not rewritten.

The loader does **not** read `.env` files or use these former options:

- `--source`, `--source-type`, `--source-version`, `--force-refresh`
- `ISM2RDF_SOURCE`, `ISM2RDF_SOURCE_TYPE`, `ISM2RDF_SOURCE_VERSION`, `ISM2RDF_FORCE_REFRESH`

Those arguments/settings do not select or refresh sources. There is no active
download, ZIP extraction, conditional HTTP refresh, or source-manifest cache.
Always stage the actual files before running.

## Outputs and checks

The [README output layout](README.md#what-it-produces) describes all five formats.
The primary merged file is:

```text
out/jsonld/convenience/Schema/IC-EDH/IC-EDH.jsonld
```

TriG and its `.tdf` wrapper are stored together under `out/trig/{mode}/`.
Each mode has a `manifest.json` with relative artifact paths, graph identifiers,
timestamps and payload hashes. The wrapper is the generator's JSON envelope
containing a base64 TriG payload and SHA-256 hash; it does not implement
encryption or an authorization engine.

The bridge remains a `.jsonld` file even when copied under `ttl`, `nt`, or `trig`
directories. Its context is normalized, while its source file is unchanged.

A successful run prints processed XSD and Schematron document counts. The staged
source set used for validation produced 44 XSD and 451 Schematron documents;
counts depend on the supplied files and reachable includes.

Run the regression checks after building and generating:

```sh
node --test test/uri-mapping.test.mjs test/uri-output.test.mjs
```

The mapping tests use arbitrary namespaces. The output tests use the staged IC
source set and check the agreed ISM identifiers and cross-format URI handling.
Different source sets may require different integration-test fixtures.

## Troubleshooting

| Symptom | Current behavior / action |
| --- | --- |
| Missing staged-folder error | Supply both source trees at the paths above. |
| Missing prefix configuration or bridge | Restore the required files under `.ciartifacts/config/`. |
| Unknown `.ts` extension | Use the ESM loader command above. |
| Namespace or URI collision | Read the two conflicting identifiers in the error. Correct the source/configuration; the generator does not append numeric suffixes. |
| URN outside configured authority | Check the source URN and `ISM2RDF_URN_AUTHORITY`; unrelated URN authorities are not silently remapped. |
| Old files remain in `out/` | Generation overwrites current artifacts but does not clean obsolete files. Archive or remove old output before a clean generation. |
| Missing enumeration documentation warning | The concept is still emitted, but may lack a preferred label. |
| `npm run lint` cannot find configuration | The current checkout has an ESLint script/dependency but no configuration. Lint has not passed; build and regression tests are separate checks. |
