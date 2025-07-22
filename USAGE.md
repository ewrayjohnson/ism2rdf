# Usage Guide

This guide outlines how to prepare, run, and interpret the results of the IC XSD to RDF Transformer.

---

## 1. Project Setup

### Clone the Repository

```bash
git clone https://github.com/ewrayjohnson/ic-xsd-to-rdf.git
cd ic-xsd-to-rdf
```

### Install Dependencies

```bash
npm install
```

## 2. Preparing Input Files

Schemas should be placed under:

```
.ciartifacts/schemas/{SchemaGroup}/
```

For example:

```
.ciartifacts/schemas/IC-EDH/IC-EDH.xsd
.ciartifacts/schemas/ISMCAT/Tetragraph.xsd
```

### Prefix Configuration

Define known prefixes in:

```
.ciartifacts/config/defaultPrefixes.json
```

Example:

```json
{
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "owl": "http://www.w3.org/2002/07/owl#",
  "xsd": "http://www.w3.org/2001/XMLSchema#",
  "skos": "http://www.w3.org/2004/02/skos/core#",
  "dc": "http://purl.org/dc/elements/1.1/",
  "sh": "http://www.w3.org/ns/shacl#"
}
```

## 3. Executing the Transformation

Run the transformation script:

```bash
node transform.js
```

Or, if you've set up an entry in `package.json`:

```bash
npm start
```

## 4. Output Directory Structure

Upon success, the following directory will be created:

```
transformed/
├── standalone/
│   └── [schema-name].{jsonld,ttl,nt}
├── convenience/
│   └── [schema-name].{jsonld,ttl,nt}
```

- **standalone**: Independent graphs with imports declared.
- **convenience**: Flattened graphs with imported content inlined.

Each schema will be exported as:

- `.jsonld`: Compact JSON-LD with reverse prefix context
- `.ttl`: Human-readable Turtle (including pretty RDF lists)
- `.nt`: N-Triples

## 5. Customization Options

- Add or modify schemas under `.ciartifacts/schemas/`
- Customize defaultPrefixes.json for known namespaces
- Extend the script to support additional metadata, SHACL shapes, or class axioms

## 6. Troubleshooting

- Ensure all referenced schemaLocation files exist relative to the importing XSD
- Use Node.js v18+ for full ES module compatibility
- Check the console for recursive import issues or malformed XSDs

---

For any questions or enhancements, please submit a GitHub Issue or Pull Request.

