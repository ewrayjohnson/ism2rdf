# Changelog

All notable changes to the **ism2rdf (by E. Wray Johnson)** project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]
### Added
- Initial version of the `ism2rdf` transformer
- Support for enumerations as `skos:ConceptScheme`
- Support for attributes as `owl:DatatypeProperty`
- Conversion to JSON-LD, Turtle, and N-Triples
- SHACL pattern support for restricted simpleTypes
- Recursive import resolution with flattened graph option

---

## [1.0.0] - 2025-07-22
### Added
- First stable release
- Complete transformation pipeline for IC CIO schemas
- Convenience and standalone output modes
- CLI support via Node.js script

---

## [0.1.0] - 2025-07-10
### Added
- Initial prototype for parsing XSD files and extracting elements
- Basic graph construction using @entryscape/rdfjson

