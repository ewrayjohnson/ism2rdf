# Changelog

All notable changes to the **ism2rdf (by E. Wray Johnson)** project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Changed

- Normalize resource URNs under the configured authority into HTTPS namespaces across JSON-LD, Turtle, N-Triples, TriG, TDF graph names/manifests, and the copied bridge context.
- Preserve source aliases and working generated aliases. Resolve document-alias collisions using source-derived case or component boundaries, without numeric suffixes.
- Add the process-environment setting `ISM2RDF_URN_AUTHORITY`, defaulting to the existing `urn:us:gov:ic` authority.
- Correct documentation to reflect local source staging, tracked payloads, current launch commands and the existing ESLint limitation. Previously documented source-download/CLI options are not active.

### Compatibility

- This is an RDF identity change: `ism:releasableTo` now expands to `https://urn.us.gov.ic/ism#releasableTo`. See [MIGRATION.md](MIGRATION.md) before replacing existing output.
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

