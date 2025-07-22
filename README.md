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
  - `sh:pattern` for regex validation
  - `owl:DatatypeProperty` with range and comment
- 📁 Multi-format output
- 🧠 Intelligent prefix mapping and reuse

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
