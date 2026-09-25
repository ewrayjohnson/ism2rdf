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

The npm start command builds JavaScript into `dist/`, then runs the transformer
to write RDF artifacts into `out/`:

```sh
npm start
```

To run the TypeScript source directly, use the ESM loader commands below.
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

Alternatively, build and run the compiled entry point:

```sh
npm run build
node dist/index.js
```

The VS Code launch configuration also builds and runs `dist/index.js`.
JavaScript left in `out/` by older builds is stale; `out/` now holds generated
RDF artifacts, while `dist/` holds compiler output.

## Configuration

### Tetragraph membership XML

The source is a replaceable XML file, selected by `file` in
`.ciartifacts/config/membership-map.json`. The default is
`.ciartifacts/tetragraph-memberships.xml`; paths are resolved relative to
`.ciartifacts/` and may also be absolute local paths. JSON membership maps are
not accepted as sources.

The supplied XML preserves all 61 groups and 766 member relationships from the
previous development JSON dataset, including its 36 groups with no supplied
members. Those groups use a description-only Membership alternative; no member
relationships, suppression, or empty real-world membership are inferred.
This is not an authoritative taxonomy release. Required XML-only metadata
(dates, security markings and the uniform decomposable="No" placeholder) is
notional, not a source-derived assertion or rollup instruction.
The last-verified date, `2022-11-02` (November 2, 2022), is **notional** and does
not assert that membership was actually verified on that date.
Replace the complete file with an approved XML instance; the importer never fills
missing metadata or infers status from absent members.

The input must validate against `.ciartifacts/Schema/ISMCAT/Tetragraph.xsd`
(or the corresponding legacy schema-root path) and its local imports. This checks
the `Tetragraphs` root, security/IRM headers, required metadata, element order,
membership choices, country/organization codes and data types. XML namespace
URIs are used, so prefix spellings can differ. Validation does not run Schematron
or make authorization decisions. DTDs are rejected and network retrieval is disabled.

Full XSD validation runs inside Node.js using the npm dependency `xmllint-wasm`.
It loads the staged XSD imports/includes into an in-memory filesystem; it requires
no system XML validator, native compilation, or separate interpreter. `npm install`
supplies the validator, and `xml2js` reads the instance after validation succeeds.

The implementation and tests must remain Node.js-only. This project does not use
and must not introduce Python scripts, Python subprocesses, pip requirements, or
Python-based test helpers. All validation and tests run through Node.js/npm.

`.ciartifacts/config/membership-map.json` selects `file`, `schemaNamespace`, the
instance `graph` identifier and `includeIn` convenience namespaces. The default
includes IC-EDH. The RDF mirrors the XML: each complex element has its schema
element type, child elements use their schema names as predicates, and supplied
attributes retain their names and values except for the default compaction below. Unqualified attributes use the owning
element's namespace. Simple child values are literals; text on an element with
attributes uses `rdf:value`. Empty elements such as `MembershipSupressed` retain
a typed node. Namespace declarations become serialization context, not data.

Country and organization tokens remain literals, without CVE lookup, identifiers,
or replicated membership on CVEs. Description, suppression, `decomposable` and
`deprecated` retain their distinct source meanings. Suppression is not deprecation.
Duplicate tetragraph records fail. RDF set semantics collapse identical statements;
XML sibling order, comments and formatting are not represented.
The importer makes no authorization or marking-rollup decisions.

**Membership is independent of CVEs.** Encode the supplied taxonomy once per
package, not once per CVE. Multiple CVEs may use the same taxonomy through a
consumer's expansion configuration. Do not add CVE references, resolve tokens
against CVE coverage, or filter source records based on a CVE. Description-only
records (including NRDC in the development fixture) are preserved as supplied;
they assert neither empty membership nor suppression. Changing the fixture's
synthetic metadata is a separate source-data decision, not a converter rule.
The development fixture uses empty schema-valid `Description` elements for
unsupplied memberships. It contains no explanatory prose pretending to be source
membership data. The transformer does not invent replacement descriptions.

Generation writes `standalone/Membership/memberships` in JSON-LD, Turtle,
N-Triples, TriG, and TDF. Convenience packages whose dependency closure contains
the taxonomy schema, and those explicitly named in `includeIn`, contain that same
instance plus its defining schema and dependencies. This packaging does not add
imports to source XSDs or change standalone schema graphs.
XML instance elements use anonymous RDF blank nodes. JSON-LD embeds them as
nested objects without record `@id` values; other serializers may use local
blank-node labels. Those labels are not durable identities or update keys.
Tokens such as `ACGU` occur as literal XML values, never as minted record URLs.
The configured `graph` names only the standalone artifact's graph in TriG/TDF;
it is not a namespace for instance identifiers. All formats serialize equivalent RDF.

**Compact output is the default.** Set `"compact": false` in
`.ciartifacts/config/membership-map.json` for full metadata output; omitting the
setting is equivalent to `true`. After validating XML, the converter omits
`ism:classification = "U"` and `ism:ownerProducer = "USA"` together only when
these are the sole ISM properties on that same RDF object. Any additional ISM
property, different value, or incomplete pair prevents omission. Namespace URIs,
not prefix spellings, identify ISM properties. Children are evaluated separately.
After this omission, a text element with only its matching element type and
`rdf:value` becomes a direct literal on its parent; for example,
`"tetra:TetraToken": "IPMC"`. Any remaining metadata keeps the nested object.
Empty marker elements stay nodes. Empty schema-defined text elements become empty-string literals in compact
mode, for example `"tetra:Description": ""`. Schema types distinguish text from
markers such as `MembershipSupressed`; empty text does not imply suppression.
This simplifies the RDF in all formats. `compact: false` retains the original
attributed text nodes and markings. No other source values are removed. This applies to the
taxonomy instance in every format and package, not to schema definitions.

This is an intentional exception to retaining every supplied XML property.
Within the compact-taxonomy import contract, an omitted qualifying pair denotes
the explicit U/USA defaults; it must not trigger parent-marking inheritance.
Consumers must know the import's compact/full mode and source schema; absence on
unmarked structural nodes does not assert defaults, and arbitrary RDF resources
must not acquire these defaults. Use full mode when explicit source markings are
required or a consumer cannot apply this scoped contract.

All other supplied XML header metadata, dates, descriptions and flags are retained.
Attributes declared directly as `xs:date` in the staged schemas use RDF `xsd:date`;
JSON-LD context coercion permits plain date strings. Other values retain their
lexical strings, including union-typed date fields such as `tax:Created`; the
included schema describes their allowed types. No missing dates or flags are
invented. The TDF timestamp describes generation, not membership verification.

Replace the selected XML and rerun generation to change membership. Remove the optional
configuration file to generate schema-only outputs; previously generated
supplementary files are not automatically deleted. Consumers must select the
current run's manifest rather than assume every leftover output file is active.
No runtime database import or deployment is performed by this change.

With the optional fixture configured, run its checks after building and generating:

```sh
node --test test/membership-map.test.mjs test/membership-output.test.mjs
```

The output check uses the manifests to verify every
schema artifact in both modes, plus the standalone supplement. It checks every
supplied XML element and attribute against RDF, compares instance triples in
JSON-LD, Turtle, N-Triples and TriG, verifies decoded TDF and JSON-LD date coercion, and
checks inclusion alongside the defining schema and absence of CVE references.

This artifact represents membership data, not a complete runtime publication
protocol. rdf9 must supply ownership, expected-revision checks and explicit
snapshot/delta semantics before using it for updates. Omitting a record must not
be interpreted as deletion or deprecation without that contract. Earlier output
attached `rdfs:member` to CVEs; existing consumers need an explicit provenance-aware
migration to remove those old assertions. Regeneration alone does not remove
previously imported data from a database.

Handoff order: generate and review ism2rdf output, obtain the user's approval,
then the user copies the approved artifacts to rdf9. Only then implement rdf9's
consumer changes. rdf9 must reconcile anonymous source records within their
import scope using source content (for example, the literal token), not blank-node
labels or invented public identifiers in the interchange output.

The bundled-data regression checks all group/member values against a fingerprint
of the original JSON, not merely their counts:

```sh
node --test test/tetragraph-source.test.mjs
```

If intentionally replacing the bundled dataset, update this fixture-specific
expectation; XML validation and output checks continue to use the replacement.

### URI configuration

`ISM2RDF_URN_AUTHORITY` is read from the process environment before generation.
It defaults to `urn:us:gov:ic` and supplies the generator's document-URI authority.
Set it only when the source URNs use the corresponding authority.

`ISM2RDF_HTTPS_BASE` independently sets the output namespace root, defaulting to
`https://ns.dni.ic.gov/`. This is a proposed proof-of-concept namespace, not an
assigned or verified endpoint. The base must be an absolute HTTPS URL without
credentials, a query, or a fragment. A missing trailing slash is added. A path
base is supported, for example `https://example.org/ns/`.

Choose the canonical base before publishing: changing it changes RDF identities.
Rehosting vocabulary files in an enclave need not change their canonical base.

```powershell
$env:ISM2RDF_URN_AUTHORITY = 'urn:example:org'
$env:ISM2RDF_HTTPS_BASE = 'https://example.org/ns/'
```

The `ISM2RDF_URN_AUTHORITY` value must contain `urn:` followed by colon-separated hostname labels.
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
Each schema ontology has its own standalone and convenience output. Examples:

```text
out/jsonld/convenience/Schema/ISM/IC-ISM.jsonld
out/jsonld/convenience/Schema/IC-EDH/IC-EDH.jsonld
out/jsonld/standalone/Schema/ISM/CVEGenerated/CVEnumISMSAR.jsonld
```

TriG and its `.tdf` wrapper are stored together under `out/trig/{mode}/`.
Each mode has a `manifest.json` with relative artifact paths, graph identifiers,
timestamps and payload hashes. Schema paths mirror the original XSD folders and
filenames. Shared-namespace schemas have alternate output locations for the same
graph: load one artifact per graph identifier. The staged set has 44 schema
artifact locations and 43 distinct schema graphs per mode. The wrapper is the generator's JSON envelope
containing a base64 TriG payload and SHA-256 hash; it does not implement
encryption or an authorization engine.

The bridge remains a `.jsonld` file even when copied under `ttl`, `nt`, or `trig`
directories. Its context is normalized, while its source file is unchanged.

A successful run prints assembled ontology and processed source counts. The staged
source set produces 43 schema ontologies from 44 XSD files, plus 451 processed
Schematron documents. Counts depend on the supplied files and reachable includes.
See [ontology assembly](README.md#ontology-assembly-and-dependencies) for grouping,
metadata, import boundaries, and graph naming.

Archive old output before publishing a regenerated set, or deploy only artifacts
listed in the new manifests plus the copied bridge. Generation does not delete
obsolete per-file outputs from earlier runs.

Build, regenerate artifacts, and run all regression checks:

```sh
npm test
npm run lint
```

The mapping tests use arbitrary namespaces. The output tests use the staged IC
source set and check the agreed ISM identifiers, namespace assembly, source imports,
ISM independence, and cross-format URI handling.
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
