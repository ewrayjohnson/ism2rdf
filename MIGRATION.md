# Migration to namespace-based ontology assembly

The unreleased transformer now assembles one schema ontology per XSD target
namespace. This replaces document identities derived from relative filenames
and assembly folders. See [README](README.md#ontology-assembly-and-dependencies)
for the assembly contract and [USAGE](USAGE.md) for execution and configuration.

## Concept text correction

Enumeration documentation no longer automatically becomes `skos:prefLabel`.
Concise names are retained or supplied by sourced naming decisions; prose and
ambiguous text become `skos:definition`. Some concepts, including OPSEC in the
staged CUI Basic vocabulary, therefore have no preferred label. Consumers should
fall back to `skos:notation`. See [the resolution rules](README.md#concept-names-and-definitions).

Concept text now retains explicit and inherited language tags. JSON-LD uses
property-specific English defaults for `skos:prefLabel` and `skos:definition`,
so English text is represented as plain strings. Other languages and explicitly
untagged text retain value objects when needed; consumers must honor the context.
Notation and `owl:oneOf` literals remain untagged and unchanged. Concept identities,
scheme membership and import closures are unchanged. Replace previously imported
text assertions within their source-owned scope; regeneration does not delete
old paragraph labels from a downstream store.

## Identity changes

### CCO marking bridge

The [bridge configuration](.ciartifacts/config/cco-marking-bridge.jsonld) now
uses the canonical IC HTTPS namespace bindings directly. Its five property
domains use `https://www.commoncoreontologies.org/ont00000958` (Information
Content Entity), replacing
`http://www.ontologyrepository.com/CommonCoreOntologies/InformationContentEntity`
according to the [CCO v2 mapping](https://github.com/CommonCoreOntology/CommonCoreOntologies/releases/tag/v2.0-2024-11-06).
Replace old bridge domain assertions and update CCO prefix bindings together;
changing only the namespace leaves the obsolete descriptive local name.

### rdf9 consumer handoff

The producer now emits policy concept identifiers using fixed HTTPS namespaces
and single-colon CURIEs. Import the new artifacts and their contexts together.
The policy namespace is a term binding, not a new asserted ontology or a promise
that the HTTPS URL is dereferenceable.

| Source policy identifier / retained notation | New concept CURIE |
| --- | --- |
| `urn:us:gov:ic:aces:ntk:permissive` | `acesntk:permissive` |
| `urn:us:gov:ic:aces:ntk:enterprise:role:permissive` | `acesntk:enterprise%3Arole%3Apermissive` |
| `urn:us:gov:ic:aces:ntk:enterprise:role:restrictive` | `acesntk:enterprise%3Arole%3Arestrictive` |
| `urn:us:gov:ic:aces:ntk:propin:1` | `acesntk:propin%3A1` |
| `urn:us:gov:ic:aces:ntk:propin:2` | `acesntk:propin%3A2` |

`acesntk` expands to `https://ns.dni.ic.gov/aces/ntk#`. There are no separate
`acesntkrole` or `acesntkpropin` bindings. `ntkprofile` similarly expands to
`https://ns.dni.ic.gov/ntk/profile#`, and `ntkpropin` to
`https://ns.dni.ic.gov/ntk/propin#`. See the checked-in
[binding configuration](.ciartifacts/config/resource-namespaces.json).

Example producer data (abbreviated):

```json
{
  "@context": {
    "acesntk": "https://ns.dni.ic.gov/aces/ntk#",
    "skos": "http://www.w3.org/2004/02/skos/core#"
  },
  "@id": "acesntk:enterprise%3Arole%3Apermissive",
  "@type": "skos:Concept",
  "skos:notation": "urn:us:gov:ic:aces:ntk:enterprise:role:permissive"
}
```

Required rdf9 agent changes:

**Artifact evidence:** The local, uncommitted `out/policy-handoff.json` is a
snapshot prepared for this migration, not an automatic transformer output.
Regenerate the snapshot after replacing RDF artifacts; its hashes must match
the files delivered to rdf9. Send it with the referenced artifacts. It lists configured resource
namespaces and actual concept counts (including zero), every schema artifact
containing those concepts, graph names, bindings, and paths plus SHA-256 hashes
for JSON-LD, Turtle, N-Triples, TriG and TDF. Paths are relative to `out/`.
Its `concepts` array gives each original notation, scheme, canonical HTTPS ID,
CURIE, artifact locations, and explicit `legacyIdCandidates`. Candidates cover
raw URNs, raw-colon fragments and split-path identifiers; they are possible old
representations, not evidence that those IDs exist in rdf9. Match scheme and
import provenance before applying them. This is a resource-identity migration
table, not a search-and-replace table for string values.

For direct verification, use these standalone JSON-LD artifacts and the matching
format paths in the handoff:

| Vocabulary | Artifact under `out/jsonld/standalone/` |
| --- | --- |
| NTK access policies (`acesntk`) | `Schema/ISM/CVEGenerated/CVEnumNTKAccessPolicy.jsonld` |
| NTK profile descriptions (`ntkprofile`) | `Schema/ISM/CVEGenerated/CVEnumNTKProfileDes.jsonld` |

The IC-EDH convenience artifact now explicitly includes both NTK vocabularies
through `convenience-dependencies.json`, in addition to its XSD import closure.
Its standalone graph and source `owl:imports` remain unchanged. Earlier IC-EDH
outputs omitted these vocabularies; regenerate before downstream verification.
The temporary handoff snapshot must also be refreshed after regeneration.
A configured binding such as `ntkpropin` need not have any emitted concepts.
Select the necessary standalone vocabularies or convenience packages using the
handoff, rather than relying on IC-EDH alone.

1. Remove producer-specific code that accepts multi-colon CURIEs, treats `urn`
   as a CURIE prefix, splits policy identifiers at the last colon, or accepts
   raw values such as `urn:us:gov:ic:aces:ntk:permissive` as canonical concept IDs.
   Replace tests expecting those workarounds with the examples above. Keep any
   legacy parsing needed for migration isolated from the normal ingestion path.
2. Resolve compact identifiers through each artifact's JSON-LD context or RDF
   prefix declarations. In the compact-ID path require one colon, a declared
   prefix, and a nonempty local name. Keep full HTTPS IRIs on the absolute-IRI
   path; they are not CURIEs. Preserve standard RDF blank-node handling.
   Do not apply CURIE validation to arbitrary strings or literal values.
3. Expand by concatenating the binding and encoded local name. Do not decode
   `%3A` before expansion or storage, and do not encode it again as `%253A`.
   The canonical example IRI is
   `https://ns.dni.ic.gov/aces/ntk#enterprise%3Arole%3Apermissive`.
   Use expanded IRIs for identity comparisons; aliases can vary by artifact.
4. Preserve `skos:notation`, literal `owl:oneOf` members, `sh:pattern`, and
   embedded Schematron/XPath source text. These intentionally retain source
   URNs and colons. Resolve an XML policy value to its concept by exact notation
   within the NTK access-policy scheme, not by treating the value as a CURIE.
   In particular, retain URNs in `enforcement-config.json`, demo data and user
   grants/attributes when they are policy operands expressed in the source
   vocabulary. Change them only where the field is actually a concept identity
   or resource reference. Establish that field contract before migration;
   an identifier-shaped string is not sufficient evidence.
5. Migrate existing producer-owned resources and inbound references together.
   Old raw URN IDs, split-path IDs such as
   `https://ns.dni.ic.gov/aces/ntk/enterprise/role#permissive`, and raw-colon
   fragment IDs must reconcile to the new ID. Use exact source notation plus
   scheme/provenance to establish the correspondence; do not rewrite arbitrary
   URNs throughout the database. Merge duplicate records only within the
   identified import scope. Regeneration does not delete old stored assertions.
6. Invalidate cached prefix maps and ID indexes when replacing the artifacts.
   Import each graph once according to its manifest. Namespace bindings alone
   do not authorize creating ontology records. Named XSD union vocabularies now
   retain their anonymous enumeration branches, so this release adds previously
   missing NTK policy/profile concepts as well as changing identifier handling.

Consumer acceptance checks should cover expansion and round-trip compaction of
the examples above; rejection of raw URNs and multi-colon values in the compact
ID path; unchanged URN literals; literal-to-concept lookup by notation; and
equivalent identifiers from JSON-LD, Turtle, N-Triples, TriG, and decoded TDF.
For PROPIN extensions, the complete suffix after `urn:us:gov:ic:aces:ntk:` is
encoded as one component, including colons inside the extension name. The
producer does not enumerate the unbounded extension pattern or create instances
for every possible value. A consumer that mints such instances must use the same
boundary and encoding contract and preserve the source notation.

These instructions are a handoff; no rdf9 code or database is modified by the
ism2rdf changes.

The configurable HTTPS base defaults to `https://ns.dni.ic.gov/`, a proposed
proof-of-concept root. CVEnum namespaces place the owning vocabulary first.

| Previous output | New output |
| --- | --- |
| `https://ns.dni.ic.gov/ISM#IC-ISM` | `https://ns.dni.ic.gov/ism` |
| `https://ns.dni.ic.gov/USAgency#USAgency` | `https://ns.dni.ic.gov/usagency` |
| `https://ns.dni.ic.gov/ISM/CVEGenerated#CVEnumISMSAR` | `https://ns.dni.ic.gov/ism/cvenum/sar` |
| `https://ns.dni.ic.gov/ISM/CVEGenerated#CVEnumISMSARAuthorities` | `https://ns.dni.ic.gov/ism/cvenum/sar` |
| `https://ns.dni.ic.gov/cvenum/ism/classification/all#CVEnumISMClassificationAll` | `https://ns.dni.ic.gov/ism/cvenum/classification/all#CVEnumISMClassificationAll` |
| `https://ns.dni.ic.gov/ISM#IC-ISM:graph:standalone` | `https://ns.dni.ic.gov/ism/graph/standalone` |

Earlier output used URNs or `https://urn.us.gov.ic/` with underscore-separated
namespace paths. Those also require migration; changing the displayed prefix
alone does not update stored RDF identities. No equivalence assertions or
automatic downstream migrations are emitted.

Source prefixes are preserved, but their expansions can change. For example,
`ismclassall` now expands to
`https://ns.dni.ic.gov/ism/cvenum/classification/all#`.
Directory-derived prefixes such as `ISM`, `ICID`, `USAgency`,
`ismcvegenerated`, `ismcatcvegenerated`, and `usagencycvegenerated` disappear.
Their ontology subjects use full HTTPS identifiers without `#`.

## ISM consumer compatibility

The `ism` binding remains `https://ns.dni.ic.gov/ism#` from the preceding
HTTPS-base change. These properties retain their exact spelling and identity:

```text
ism:releasableTo
ism:displayOnlyTo
ism:SCIcontrols
ism:disseminationControls
ism:highWaterNATO
ism:ownerProducer
ism:cuiBasic
ism:cuiControlledByOffice
ism:cuiDecontrolDate
ism:cuiSpecified
ism:cuiDecontrolEvent
```

Consumers still using `urn:us:gov:ic:ism#` or `https://urn.us.gov.ic/ism#`
must update their namespace bindings and migrate stored expanded identifiers.
ISM has its own outputs and does not require loading EDH. Convenience output
follows only the ontology's transitive source imports.

## Assembly and output changes

The staged 44 XSDs produce 43 ontologies. The two SAR schemas share one ontology,
retaining both sets of definitions and source metadata. Metadata values from
multiple files are combined; differing values are not silently discarded.
Ontology imports follow declared namespaces rather than directory-derived
document URIs. Source locations remain `dcterms:source` literals.

Schema outputs retain the original source folders and filenames:

```text
out/jsonld/standalone/Schema/ISM/IC-ISM.jsonld
out/jsonld/convenience/Schema/ISM/IC-ISM.jsonld
out/jsonld/standalone/Schema/ISM/CVEGenerated/CVEnumISMSAR.jsonld
```

The two SAR source paths both contain the same assembled SAR ontology. Manifests
list both as alternate artifact locations with the same graph identifier and
payload hash. Load one artifact per graph identifier to avoid duplicate ingestion.
The staged sources yield 44 schema artifact locations for 43 ontologies per mode.

Other formats use the same relative paths. Schema graphs use
`<ontology URI>/graph/<mode>`. TriG/TDF manifests, payloads and hashes therefore
change. Schematron document assembly and graph naming remain unchanged.

## What stays unchanged

- Explicit source vocabulary aliases, case, and local term names.
- Plain-string enumeration values, notation, and other literal values.
- External HTTP/HTTPS vocabulary identifiers other than the CCO marking bridge
  migration described above.
- Source files, assembly folders, and the local staged-source loader.
- Generated local names containing colons, including `...:Shape`. A consumer
  that rejects these still needs a separate compatibility change.

## Update consumers

1. Preserve the old dataset and namespace mappings.
2. Build and regenerate using [USAGE](USAGE.md). Archive old output first or
   publish only artifacts in the new manifests plus the bridge: generation
   overwrites current files but does not remove obsolete per-document outputs.
3. Deploy matching ontology artifacts, bridge context and TriG/TDF manifests.
4. Update stored URNs, previous HTTPS identifiers, import targets, graph names,
   namespace registries and artifact paths. Regenerate or migrate downstream
   data using that consumer's own procedure.
5. Run the documented regressions. Verify ISM CURIE expansions, both SAR source
   definitions, import closure, and payload hashes.

For compact identifiers, split at the first colon and preserve the remainder
of the local name. Absolute HTTP/HTTPS identifiers and blank nodes are handled
separately. Namespace spelling and physical hosting location are independent;
changing `ISM2RDF_HTTPS_BASE` changes canonical RDF identities.

Older download, ZIP, `.env`, and source-selection flag instructions are inactive.
See [USAGE](USAGE.md) for the supported local staging and launch commands.
# Membership supplement separation

Taxonomy output now defaults to `compact: true` in the membership configuration.
Only an object's isolated `ism:classification = "U"` / `ism:ownerProducer = "USA"`
pair is omitted. Set `compact: false` to retain full metadata. Consumers must
handle this as an explicit compact-taxonomy convention rather than interpreting
omission as inheritance or globally defaulting unmarked resources. See USAGE for
the exact rule and import scope.
In compact mode, text elements left with only their matching type and `rdf:value`
become direct literals on the parent predicate. Consumers must accept the direct
value or a nested value with retained metadata. Full mode preserves attributed
text nodes. Empty marker elements remain nodes in either mode.

The taxonomy instance now mirrors the validated XML, including supplied metadata,
instead of attaching `rdfs:member` to CVEs or generating `skos:Collection` records
that resolve tokens to CVEs. Country and organization tokens remain literal values.
Configuration replaces `namespace` with `schemaNamespace` and `includeIn`.
The instance is exported separately and included with its defining schema and
dependencies in selected convenience packages, including IC-EDH. Source XSD imports
and CVE identifiers remain unchanged. See [the output contract](USAGE.md#tetragraph-membership-xml).

The experimental `/tetragraph/<token>` and nested instance URLs are also removed.
XML instance elements are anonymous blank nodes, embedded in JSON-LD. Blank-node
labels have document scope and must not become persistent update keys. Consumers
must explicitly reconcile the source import rather than append new blank nodes
on each refresh; do not modify the source interchange model to impose database IDs.
Review and approve regenerated output before copying it into rdf9 or implementing
that consumer's changes.

The approved IC-EDH output was copied to rdf9 on 2026-09-10. rdf9's consumer
binds the anonymous taxonomy root to an internal governed resource through
configuration, retains the embedded source records, and derives a shared SQL
compiled ABAC attribute expansion cache from explicit literal memberships.
The cache is a dedicated PostgreSQL `enforcement_cache` table, not an RDF resource;
source records and configuration remain governed resources. Publication is
transactional and shared across API servers, without CAS or per-server membership
copies. Normal server startup does not reseed defaults. Consumer operations and
limitations are documented in rdf9's `docs/ABAC_ATTRIBUTE_EXPANSION.md`. This does not add identifiers,
CVE links, or authorization policy to ism2rdf output. Source metadata remains
source-defined. Subsequent imports update the same consumer-owned source resource;
runtime database publication and validation belong to rdf9, not this transformer.

Consumers of the earlier experimental output must explicitly migrate assertions
owned by that import. An ontology upsert that omits the old membership predicates
is not sufficient to remove them, and must not delete independently owned user
assertions. No database migration is performed by the transformer.
