# ism2rdf Transformer

![Made with RDF.js](https://img.shields.io/badge/RDF.js-powered-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)

This project transforms XML Schema Definitions (XSD) published by the [U.S. Intelligence Community Chief Information Officer (IC CIO)](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications) into RDF/OWL representations, enabling them to be used in Linked Data, semantic reasoning, and ontology-driven validation systems.

---

## Overview

This tool:
- Parses IC-published `.xsd` schemas into RDF graphs.
- Converts `simpleType` enumerations into `skos:ConceptScheme` and `skos:Concept` resources.
- Represents `xsd:pattern` restrictions as SHACL constraints.
- Models attributes as `owl:DatatypeProperty`.
- Resolves and recursively processes `xsd:import` statements.
- Outputs RDF in:
  - Compact JSON-LD
  - Pretty Turtle
  - N-Triples

## Source Data

Schemas are obtained from:
👉 **[IC CIO Technical Specifications](https://www.dni.gov/index.php/who-we-are/organizations/ic-cio/ic-technical-specifications)**

Examples include:
- `IC-ISM.xsd`
- `IC-EDH.xsd`
- `Tetragraph.xsd`

## Output Structure

Each schema is transformed into:

```
transformed/
├── standalone/       # Each schema with its own owl:Ontology and owl:imports
├── convenience/      # Merged version with imports inlined
```

Each directory includes:
- `*.jsonld`: Compact JSON-LD
- `*.ttl`: Human-readable Turtle (including pretty RDF lists)
- `*.nt`: N-Triples

## Features

- 🔁 Recursive `xsd:import` resolution
- 🔍 Semantic enrichment via:
  - `skos:ConceptScheme` and `skos:Concept`
  - `sh:pattern` for special regex enumeration patterns
  - `owl:DatatypeProperty` with range and comment
- 📁 Multi-format output
- 🧠 Intelligent prefix mapping and reuse

## Controlled Vocabulary Enumeration (CVE) Pattern

### 🧠 Conceptual Summary

The Controlled Vocabulary Enumeration (CVE) pattern connects enumerated `rdfs:Datatype` definitions with SKOS-based concept schemes. This enables:

- ✅ Formal data constraints using `owl:oneOf`
- ✅ Semantic enrichment via `skos:Concept`
- ✅ Vocabulary traceability using `dc:source` and `rdfs:seeAlso`
- ✅ Validatable and machine-readable instance data
- ✅ Alignment between literal values and concept identifiers

This pattern allows an `owl:DatatypeProperty` to reference a custom datatype whose valid literal values are constrained to match the `skos:notation` of `skos:Concept`s from a referenced `skos:ConceptScheme`.

---

### 📌 CVE Pattern Facts

1. **An `owl:DatatypeProperty` exists**  
   - It has an `rdfs:range` of a **Custom Datatype**.

2. **The Custom Datatype:**
   - Is an instance of `rdfs:Datatype`.
   - Uses `owl:equivalentClass → owl:oneOf` to declare allowed literals.
   - Has `dc:source` and `rdfs:seeAlso` linking it to a `skos:ConceptScheme`.

3. **The `skos:ConceptScheme`:**
   - Contains multiple `skos:Concept`s.
   - References these concepts via `skos:hasTopConcept`.

4. **Each `skos:Concept`:**
   - Belongs to the same `skos:ConceptScheme` via `skos:inScheme`.
   - Has a `skos:notation` with a literal value.
   - Each literal value matches one value listed in the `owl:oneOf` of the custom datatype.

## Installation

```bash
git clone https://github.com/ewrayjohnson/ism2rdf.git
cd ism2rdf
npm install
```

## Configuration

Place schemas under:
```
.ciartifacts/schemas/{SchemaGroup}/
```

Default prefixes go in:
```
.ciartifacts/config/defaultPrefixes.json
```

## Running the Transformer

```bash
ts-node index.ts
```

Or if configured in package.json:

```bash
npm start
```

## License

MIT License © 2025 E. Wray Johnson
