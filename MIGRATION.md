# Migration to namespace-based ontology assembly

The unreleased transformer now assembles one schema ontology per XSD target
namespace. This replaces document identities derived from relative filenames
and assembly folders. See [README](README.md#ontology-assembly-and-dependencies)
for the assembly contract and [USAGE](USAGE.md) for execution and configuration.

## Identity changes

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
- External HTTP/HTTPS vocabulary identifiers, including the existing CCO bridge
  namespace. This is not a migration to CCO v2 identifiers.
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
