# Migration from URN output

The current unreleased change normalizes RDF resource URNs into HTTPS identifiers.
It preserves the committed schema conversion model; it does not add a separate
NTK converter, a policy evaluator, or expanded XML content-model support.

## What changes

With the default authority, namespace components after `urn:us:gov:ic` form an
underscore-separated path under `https://urn.us.gov.ic/`. Local identifiers remain
after `#`. The configured authority boundary is explicit, not inferred by counting
components in each input URI.

| Before | After |
| --- | --- |
| `urn:us:gov:ic:ism#releasableTo` | `https://urn.us.gov.ic/ism#releasableTo` |
| `urn:us:gov:ic:ntk#Access` | `https://urn.us.gov.ic/ntk#Access` |
| `urn:us:gov:ic:ISM:IC-NTK` | `https://urn.us.gov.ic/ISM#IC-NTK` |
| `urn:us:gov:ic:IC-ID:IC-ID` | `https://urn.us.gov.ic/IC-ID#IC-ID` |
| `urn:us:gov:ic:USAgency:USAgency` | `https://urn.us.gov.ic/USAgency#USAgency` |
| `urn:us:gov:ic:ISM:IC-NTK:graph:standalone` | `https://urn.us.gov.ic/ISM#IC-NTK:graph:standalone` |

These are new RDF identities, even where the compact spelling stays the same.
The generator does not emit equivalence assertions or update downstream data.

Document aliases no longer disappear through collisions with source aliases:

| Document namespace | Current alias | Distinct source vocabulary alias |
| --- | --- | --- |
| `https://urn.us.gov.ic/ISM#` | `ISM` | `ism` |
| `https://urn.us.gov.ic/IC-ID#` | `ICID` | `icid` |
| `https://urn.us.gov.ic/ISMCAT#` | `ISMCAT` | `ismcat` |
| `https://urn.us.gov.ic/USAgency#` | `USAgency` | `usagency` |

Old outputs could omit a document alias or use a numeric suffix in some contexts.
Use the generated context rather than carrying those old aliases forward.
Prefixes are case-sensitive. The code preserves existing generated names when
available, tries source-derived case and component boundaries for collisions,
and errors if no distinct candidate remains.

## What stays the same

These compact property names retain their exact spelling and case. All now expand
under `https://urn.us.gov.ic/ism#`:

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

- Existing source vocabulary aliases, including `ntk`, remain in use.
- `ismcvegenerated`, `ismcatcvegenerated`, and `usagencycvegenerated` retain their spelling. Their namespace URIs are normalized.
- Local names, including the complete `...:Shape` suffix, are not shortened.
- `skos:notation` and enumeration values retain their plain-string form. No new typed-literal wrappers are introduced.
- Existing HTTP/HTTPS identifiers, such as RDF, OWL, BFO and CCO terms, remain unchanged.
- Literal strings and source files are unchanged. Source-URI text inside a literal is not a resource reference and is not rewritten.
- Output directories and extensions remain the same. Blank-node labels are internal identifiers and may vary between runs.

The XSD serializer now emits proper blank-node terms instead of invalid
`<_:...>` IRIs in N-Triples. JSON-LD blank-node references remain reference objects.

## Update a consumer

1. Preserve the old output and record its namespace mappings before replacing it.
2. Stage the intended source set and regenerate all formats using [USAGE](USAGE.md).
   Use a clean output tree when sources were removed or renamed; generation does
   not remove obsolete artifacts.
3. Deploy the matching ontology files, normalized bridge, and TriG/TDF manifests
   together. TDF payload hashes change when resource identifiers change.
4. Update namespace registries and any stored full-URN references in queries,
   rules, data, caches and graph names. Updating the displayed prefix alone is
   insufficient when a consumer stores expanded identifiers.
5. Rebuild or migrate the downstream dataset through that project's own procedure.
   Do not treat a mixture of old URNs and new HTTPS identifiers as one identity.
6. Verify expanded identities and persisted counts, not just successful parsing.
   For example, confirm that `ism:releasableTo` resolves to
   `https://urn.us.gov.ic/ism#releasableTo` and that all referenced ontology
   documents are retained.

For compact identifiers, resolve a declared prefix at the first colon and keep
the entire remainder. `ISM:IC-NTK:graph:standalone` has prefix `ISM` and local name
`IC-NTK:graph:standalone`. Full HTTP/HTTPS IRIs are already absolute. Blank-node
references are handled separately from prefix expansion.

This repository does not alter RDF9 or any other consumer automatically.
`ISM2RDF_URN_AUTHORITY` selects the input authority; it is not a switch that restores
legacy URN output. Returning to old identities requires the previous generator
and a matching downstream dataset.

## Previous launch/source instructions

Older usage documentation described URL downloads, ZIP inputs, `.env` source
settings, `--source` and `--force-refresh`. Those paths are not used by the current
loader. See [USAGE](USAGE.md) for manual staging, source replacement in disconnected
environments, the supported authority setting, and the Node.js ESM launch command.
