# Changelog

All notable changes to the **ism2rdf (by E. Wray Johnson)** project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Changed

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
