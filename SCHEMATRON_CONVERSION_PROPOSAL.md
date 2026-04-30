<style>
@page {
  margin: 1in;
  @bottom-center {
    content: "Page " counter(page);
    font-family: Aptos, "Segoe UI", sans-serif;
    font-size: 8pt;
  }
}

body {
  font-family: Aptos, "Segoe UI", sans-serif;
  font-size: 10pt;
  line-height: 1.6;
}

h1, h2, h3 {
  page-break-after: avoid;
}

table, figure {
  page-break-inside: avoid;
}
</style>
# Schematron Conversion Implementation Plan

**Proposed by:** Elwood Wray Johnson  
**Contact:** wray.johnson@gmail.com | 704-293-9008  
**LinkedIn:** https://www.linkedin.com/in/e-wray-j-6a56a1/  
**Date:** April 8, 2026

---

## Executive Summary

This proposal describes modifications to the existing ism2rdf codebase (which currently processes XSD only) to add complete Schematron-to-RDF conversion with enhanced capabilities for rule deduction, constraint translation, and schema alignment.

---

## Current State (Baseline)

The baseline GitHub code currently:

- Processes XSD schemas to emit OWL/SKOS/SHACL artifacts
- **Does not** discover or process any Schematron files
- **Does not** emit any `ismsch:*` RDF vocabulary terms
- **Does not** output anything under `out/transformed/Schematron/`

---

## Target State (Proposed)

This proposal recommends modifying the code to:

- Discover Schematron from XSD `xml-model` processing instructions
- Parse Schematron XML and recursively resolve include chains
- Emit source-faithful RDF for Schematron elements (schema/pattern/rule/assert/report/phase/include/variable/parameter)
- Derive resolved rules from abstract-pattern instantiations with parameter substitution
- Translate safe-subset constraints to SHACL shapes
- Explicitly preserve and reason about non-translated constraints
- Extract and link rules to schema-term candidates
- Output both standalone and convenience (merged-includes) Schematron graphs in JSON-LD/Turtle/N-Triples
- Report both XSD and Schematron processing counts on completion

---

## Implementation Plan

### 1. Add Schematron Discovery Function

**Recommendation:** Create function `discoverSchematronPath(text, xsdPath, schematronRoot)`

**Function:** Parse `<?xml-model ... href="..." ... ?>` from XSD text; resolve href relative to XSD; check local Schematron root; fallback to `ISM/ISM_XML.sch`

**Integration point:** Should be called after each XSD is processed in the main loop

### 2. Add Schematron Parsing Pipeline

**Recommendation:** Create async function `inputSchematron(path, root, outputDir, processedMap)`

**Responsibilities:** 
- Parse `.sch` file with `xml2js`
- Emit source-faithful RDF for document, schema, patterns, rules, asserts, reports, includes, phases, variables, parameters, paragraphs
- Recursively process includes
- Cache results in `processedMap` to prevent re-parsing shared libraries
- Output to `out/transformed/Schematron/standalone/` and `out/transformed/Schematron/convenience/`

**Key model terms emitted:**
- `ismsch:SchematronDocument`, `ismsch:Schema`, `ismsch:NamespaceDeclaration`
- `ismsch:Pattern`, `ismsch:AbstractPattern`
- `ismsch:Rule`, `ismsch:AbstractRule`
- `ismsch:Assert`, `ismsch:Report`
- `ismsch:Variable`, `ismsch:Parameter`, `ismsch:Paragraph`
- `ismsch:ExecutionPhase`, `ismsch:PhaseActivation`, `ismsch:PatternReference`
- `ismsch:Include`
- `ismsch:dependsOnConceptScheme` (for CVE references)

### 3. Add Post-Parse Enhancement Pipeline

**Recommendation:** Create function `applySchematronDeferredEnhancements(graph)`

**Approach:** Invoke three enhancement passes on completed Schematron graphs:

**3a. Abstract Pattern Resolution**

- Function: `resolveAbstractPatternInstantiations(graph)`
- Mechanism: For each concrete pattern with `is-a` pointing to an abstract pattern, create `ismsch:ResolvedRule` resources from abstract template rules
- Substitute pattern parameters into derived rule context/test/text
- Link back to source pattern/rule via `ismsch:derivedFromPattern` / `ismsch:derivedFromRule`

**3b. Safe-Subset SHACL Translation**

- Function: `emitShaclFromSchematron(graph)`
- Mechanism: For each rule, emit an `sh:NodeShape` linked via `ismsch:translatedToShape`
- Supported automatic translations:
  - Attribute existence check → `sh:minCount 1`
  - Equality check (`@attr = 'value'`) → `sh:hasValue`
  - Regex match check → `sh:pattern`
- For non-translatable constraints, emit `ismsch:translationStatus: "preserved"` and `ismsch:translationReason`

**3c. Schema-Term Alignment Linking**

- Function: `emitRuleAlignmentLinks(graph)`
- Mechanism: Extract attribute references (`@attrName`) and QNames from rule context/test/text
- Emit `ismsch:referencesAttribute` and `ismsch:referencesQName` literals
- Emit `ismsch:alignsToSchemaTerm` candidate IRIs based on attribute/QName local names
- Guard against invalid empty IRIs via normalization validation

### 4. Update Main Processing Loop

**Recommendation:** Modify the schema processing entry point in the main IIFE

**Evolution from current:**
```
For each XSD file:
  → input(file)
  → parse, emit to out/transformed/Schema/
```

**New flow:**
```
For each XSD file:
  → input(file)
  → parse, emit to out/transformed/Schema/
  → discoverSchematronPath(xsdText)
  → if found: await inputSchematron(schPath, root, outputDir, processedMap)
```

**Output:**
```
console.log(`Processed ${processed.size} XSD documents`)
console.log(`Processed ${processedSchematron.size} Schematron documents`)
```

### 5. Update Output Directory Structure

**Recommendation:** Extend output layout

**Current structure:**
```
out/transformed/
└── Schema/ { standalone/, convenience/ }
```

**Target:**
```
out/transformed/
├── Schema/ { standalone/, convenience/ }
└── Schematron/ { standalone/, convenience/ }
```

---

## Proposed Code Modifications

### Required additions to `index.ts`

- Add `SCHEMATRON_NS_URI = 'urn:us:gov:ic:ism2rdf:schematron#'` constant
- Add `SCHEMATRON_DIR_NAME` and path constants
- Add `discoverSchematronPath()` function
- Add `inputSchematron()` function with full source-faithful model emission
- Add `applySchematronDeferredEnhancements()` coordinator
- Add `resolveAbstractPatternInstantiations()` function
- Add `emitShaclFromSchematron()` function
- Add `emitRuleAlignmentLinks()` function
- Add helper functions: `subjectsOfType()`, `objectsOf()`, `firstLiteral()`, `hasType()`, `collectPatternParams()`, `substituteSchematronParams()`, `schemaCandidatePropertyUri()`, etc.

### Required modifications to existing code

- Update main IIFE to initialize `processedSchematron` Map
- Update main IIFE to call Schematron discovery after each XSD is processed
- Update console.log output to report both XSD and Schematron document counts

### Documentation updates

- Update USAGE.md to document Schematron output artifacts
- Update README.md to mention Schematron conversion capability

---

## Expected Validation & Testing

### Runtime Completion Signals

After implementing this proposal, successful completion should produce:

```
Output directory: <path>/out/transformed
Processed <N> XSD documents
Processed <M> Schematron documents
```

### Output Artifacts to Validate

1. Directory tree created: `out/transformed/Schematron/standalone/` and `out/transformed/Schematron/convenience/`
2. Files generated: `ISM_XML.{jsonld,ttl,nt}` and subdirectories for Lib/ and Rules/
3. Turtle output should contain `ismsch:Pattern`, `ismsch:Rule`, `ismsch:Assert`, `ismsch:Report` resources
4. Turtle output should contain `ismsch:ResolvedRule` resources (from abstract-pattern resolution)
5. Turtle output should contain `sh:NodeShape` and related SHACL terms
6. Turtle output should contain `ismsch:translationStatus` and `ismsch:translationReason` on non-translated constraints
7. Turtle output should contain `ismsch:alignsToSchemaTerm` candidate links

### Backward Compatibility Requirements

- All existing XSD output must remain functionally identical
- If no Schematron is discovered, tool must not fail or degrade existing behavior
- If Schematron root is missing, tool must fall back gracefully without error

---

## Acceptance Criteria

Implementation of this proposal is considered successful when:

1. Full transformer run completes without unhandled exceptions
2. Console reports both XSD and Schematron document counts
3. Schematron artifacts are written under `out/transformed/Schematron/` in all three serialization formats (JSON-LD, Turtle, N-Triples)
4. Source-faithful baseline RDF model terms (schema/pattern/rule/assert/report/include/phase/variable/parameter) are present
5. Abstract-pattern derivation produces `ismsch:ResolvedRule` resources with parameter substitution
6. Safe-subset SHACL shapes are emitted and linked from rules via `ismsch:translatedToShape`
7. Non-translated constraints carry explicit `ismsch:translationStatus` and `ismsch:translationReason` preservation markers
8. Rule-to-schema alignment links are extracted and emitted as `ismsch:alignsToSchemaTerm` candidates
9. No breaking changes to existing XSD conversion behavior
10. TypeScript compilation succeeds with `npx tsc --noEmit` (zero errors)
