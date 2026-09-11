# Changelog

All notable changes to the **ism2rdf (by E. Wray Johnson)** project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Changed

- Preserve empty schema-defined text as empty strings, compacting empty
  descriptions to literals while keeping empty marker elements as nodes.

- Remove fabricated missing-membership prose from the development XML; retain
  all records using schema-valid empty descriptions and regenerate all formats.

- Collapse metadata-free text wrappers to direct literals in compact taxonomy
  output, consistently across all formats; retain nested values with metadata.

- Default taxonomy output to compact mode: omit the exact U/USA pair only when
  there are no other ISM properties on that object. `compact: false` retains full
  metadata. Apply the same rule across all output formats and packages.

- Remove invented taxonomy record URLs. XML instance elements now use RDF blank
  nodes, nested without record IDs in JSON-LD, while preserving their metadata
  and equivalent triples in every format. Blank-node labels are not update keys.

- Add an optional replaceable Tetragraph XML importer with full validation against
  the staged Tetragraph.xsd and local imports using Node.js/WebAssembly. RDF mirrors
  the XML elements, attributes and nesting, retaining supplied metadata and literal
  membership tokens without CVE references. The XML preserves all 61 original JSON groups and 766
  memberships, including 36 unspecified groups, with explicitly notional XML-only
  metadata and last-verified date 2022-11-02. Description and suppression alternatives
  retain their distinct XML structure. The instance is serialized in all formats,
  separately and alongside its schema in configured convenience outputs including
  IC-EDH. Source imports and CVEs are unchanged. This replaces the experimental
  direct `rdfs:member` assertions and CVE-referencing collection records.

- Remove the Python XML helper, interpreter setting and pip requirements. Runtime
  validation and all tests remain Node.js-only using `xmllint-wasm` and `xml2js`.

- Use the configurable `ISM2RDF_HTTPS_BASE` (default `https://ns.dni.ic.gov/`) and case-preserving slash-separated namespace paths instead of the previous authority-derived host and underscore flattening. The default is a proposed proof-of-concept namespace, not an assigned endpoint.

- Normalize resource URNs under the configured authority into HTTPS namespaces across JSON-LD, Turtle, N-Triples, TriG, TDF graph names/manifests, and the copied bridge context.
- Assemble XSDs by target namespace, preserving explicit source aliases and removing directory-derived document aliases. Combine shared-namespace definitions and metadata, with source-path provenance.
- Map `cvenum:<vocabulary>:...` to `<vocabulary>/cvenum/...`. Resolve imports through target namespaces and emit standalone and convenience outputs per ontology, keeping ISM independent of EDH.
- Preserve source folders and filenames for schema artifacts while using `<ontology URI>/graph/<mode>` graph names. Shared-namespace source paths publish identical assembled content as alternate locations for the same graph. Existing Schematron document naming remains unchanged.
- Add the process-environment setting `ISM2RDF_URN_AUTHORITY`, defaulting to the existing `urn:us:gov:ic` authority.
- Correct documentation to reflect local source staging, tracked payloads, current launch commands and the existing ESLint limitation. Previously documented source-download/CLI options are not active.

### Compatibility

- Ontology subjects, CVEnum term namespaces, schema graph identifiers change; see [MIGRATION.md](MIGRATION.md). ISM term identities from the preceding HTTPS-base change remain stable.
- Relative to the original URN output, this is an RDF identity change: `ism:releasableTo` now expands to `https://ns.dni.ic.gov/ism#releasableTo`. See [MIGRATION.md](MIGRATION.md) before replacing existing output.
- Local names, plain-string vocabulary values and external HTTP/HTTPS identifiers are preserved. No new NTK-specific conversion or runtime authorization behavior is included.

### Fixed

- Prevent namespace inversion from silently losing colliding document mappings.
- Emit valid blank-node terms in XSD-derived RDF serialization instead of `<_:...>` IRIs.

### Added

- URI mapping and generated-output regression tests, including the agreed ISM property names, collision detection, and cross-format identity checks.
- Migration guidance for existing consumers, including RDF9.

---

## [1.0.0] - 2025-07-22
### Added
- First stable release
- Transformation pipeline for supported IC CIO schema constructs
- Convenience and standalone output modes
- CLI support via Node.js script

---

## [0.1.0] - 2025-07-10
### Added
- Initial prototype for parsing XSD files and extracting elements
- Basic graph construction using @entryscape/rdfjson
