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
