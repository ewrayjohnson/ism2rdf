import jsonld from 'jsonld';
import type { Quad } from '@rdfjs/types';
import type { ContextDefinition } from 'jsonld';

/** Pass RDF/JS terms directly so blank-node labels receive exactly one `_:` prefix. */
export async function serializeJsonld(quads: Quad[], context: ContextDefinition, instanceIds = new Set<string>()): Promise<string> {
  const expanded = await jsonld.fromRDF(quads);
  const compacted = await jsonld.compact(expanded, context);
  return normalizeJsonldForIngest(JSON.stringify(compacted), instanceIds);
}

/**
 * Normalizes JSON-LD node ordering for compatibility with ingest pipelines that
 * resolve predicates in a single pass.
 */
function normalizeJsonldForIngest(jsonldText: string, instanceIds = new Set<string>()): string {
  const parsed = JSON.parse(jsonldText);
  if (!Array.isArray(parsed['@graph'])) {
    const { '@context': context, ...node } = parsed;
    parsed['@graph'] = Object.keys(node).length ? [node] : [];
    for (const key of Object.keys(node)) delete parsed[key];
  }

  const graph = parsed['@graph'] as Array<Record<string, unknown>>;
  // The taxonomy is an XML tree: embed its anonymous nodes in JSON-LD while
  // leaving schema nodes and their references untouched.
  const instances = new Map(graph.filter(node => typeof node['@id'] === 'string' && node['@id'].startsWith('_:') &&
    instanceIds.has(node['@id'].slice(2))).map(node => [node['@id'] as string, node]));
  const referenced = new Set<string>();
  for (const node of instances.values()) {
    for (const value of Object.values(node)) {
      for (const item of Array.isArray(value) ? value : [value]) {
        if (item && typeof item === 'object' && instances.has(item['@id'])) referenced.add(item['@id']);
      }
    }
  }
  const embed = (node: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(
    Object.entries(node).filter(([key]) => key !== '@id').map(([key, value]) => {
      const nested = (item: any): any => item && typeof item === 'object' && instances.has(item['@id'])
        ? embed(instances.get(item['@id'])!) : item;
      return [key, Array.isArray(value) ? value.map(nested) : nested(value)];
    }));
  parsed['@graph'] = graph.filter(node => !instances.has(node['@id'] as string)).concat(
    [...instances].filter(([id]) => !referenced.has(id)).map(([, node]) => embed(node)));
  const propertyTypes = new Set(['owl:DatatypeProperty', 'owl:ObjectProperty', 'rdf:Property']);
  parsed['@graph'].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const rankA = nodeSortRank(a, propertyTypes);
    const rankB = nodeSortRank(b, propertyTypes);
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const idA = typeof a['@id'] === 'string' ? a['@id'] : '';
    const idB = typeof b['@id'] === 'string' ? b['@id'] : '';
    return idA.localeCompare(idB);
  });

  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function nodeSortRank(node: Record<string, unknown>, propertyTypes: Set<string>): number {
  const types = node['@type'];
  const typeList = Array.isArray(types) ? types : (typeof types === 'string' ? [types] : []);
  if (typeList.some((t) => typeof t === 'string' && propertyTypes.has(t))) {
    return 0;
  }
  const id = node['@id'];
  if (typeof id === 'string' && id.startsWith('_:')) {
    return 2;
  }
  return 1;
}

