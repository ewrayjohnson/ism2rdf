/** Shared identity mapping; literals never pass through this class. */
export class UriMapping {
  private readonly namespaces = new Map<string, string>();
  private readonly identities = new Map<string, string>();
  private readonly sources = new Map<string, string>();
  private readonly ontologies = new Map<string, string>();
  private readonly resourceNamespaces = new Map<string, string>();
  private readonly base: string;

  constructor(private readonly authority: string, httpsBase = 'https://ns.dni.ic.gov/') {
    if (!/^urn:[A-Za-z0-9-]+(?::[A-Za-z0-9-]+)*$/.test(authority)) {
      throw new Error('URN authority must contain colon-separated hostname labels');
    }
    const base = new URL(httpsBase);
    if (base.protocol !== 'https:' || base.username || base.password || httpsBase.includes('?') || httpsBase.includes('#')) {
      throw new Error('HTTPS base must be an HTTPS URL without credentials, query or fragment');
    }
    this.base = base.href.endsWith('/') ? base.href : base.href + '/';
  }

  private belongs(iri: string): boolean {
    return iri === this.authority || iri.startsWith(this.authority + ':') || iri.startsWith(this.authority + '#');
  }

  private unique(iri: string, result: string): string {
    const previous = this.identities.get(result);
    if (previous !== undefined && previous !== iri) {
      throw new Error(`URI normalization collision: ${previous} and ${iri} both become ${result}`);
    }
    this.identities.set(result, iri);
    return result;
  }

  namespace(iri: string): string {
    if (!this.belongs(iri)) return iri;
    const existing = this.namespaces.get(iri);
    if (existing) return existing;
    const suffix = iri.slice(this.authority.length).replace(/^:/, '').replace(/[:#]$/, '');
    const components = suffix.split(':');
    if (components[0] === 'cvenum' && components.length >= 3) {
      [components[0], components[1]] = [components[1], components[0]];
    }
    const path = components.map(component => {
      if (component === '.' || component === '..') throw new Error('Namespace cannot contain dot path segments');
      return encodeURIComponent(component);
    }).join('/');
    const result = this.unique(iri, this.base + path + '#');
    this.namespaces.set(iri, result);
    return result;
  }

  source(iri: string, prefix: string): void {
    const previous = this.sources.get(prefix);
    if (previous && previous !== iri) throw new Error(`Source prefix collision: ${prefix} names ${previous} and ${iri}`);
    this.sources.set(prefix, iri);
    this.namespace(iri);
  }

  ontology(iri: string): string {
    if (/^urn:/i.test(iri) && !this.belongs(iri)) throw new Error(`URN outside configured authority ${this.authority}: ${iri}`);
    const existing = this.ontologies.get(iri);
    if (existing) return existing;
    const result = this.belongs(iri) ? this.namespace(iri + '#').slice(0, -1) : iri;
    this.unique(iri, result);
    this.ontologies.set(iri, result);
    return result;
  }

  /** Explicit boundaries for URN-valued resources, independent of schema namespaces. */
  resourceNamespace(iri: string, prefix: string): void {
    if (!this.belongs(iri) || !/[:#]$/.test(iri) || !/^[A-Za-z][A-Za-z0-9_]*$/.test(prefix)) {
      throw new Error(`Invalid resource namespace binding: ${prefix} = ${iri}`);
    }
    this.source(iri, prefix);
    if (iri.endsWith(':')) this.resourceNamespaces.set(iri, prefix);
  }

  uri(iri: string): string {
    const ontology = this.ontologies.get(iri);
    if (ontology) return ontology;
    if (!this.belongs(iri)) {
      if (/^urn:/i.test(iri)) throw new Error(`URN outside configured authority ${this.authority}: ${iri}`);
      // Detect a source HTTPS identifier colliding with a rewritten identifier too.
      return this.unique(iri, iri);
    }
    const resourceNamespace = [...this.resourceNamespaces.keys()]
      .filter(ns => iri.startsWith(ns)).sort((a, b) => b.length - a.length)[0];
    if (resourceNamespace) {
      return this.unique(iri, this.namespace(resourceNamespace) + encodeURIComponent(iri.slice(resourceNamespace.length)));
    }
    // Only fragment namespaces have a known boundary. Inferred colon namespaces
    // must not make mapping depend on which sibling identifier was seen first.
    const namespace = [...this.namespaces.keys()].filter(ns => ns.endsWith('#') && iri.startsWith(ns))
      .sort((a, b) => b.length - a.length)[0];
    if (namespace) return this.unique(iri, this.namespaces.get(namespace)! + iri.slice(namespace.length).replaceAll(':', '%3A'));
    if (iri === this.authority) return this.namespace(iri);
    const split = iri.indexOf('#') >= 0 ? iri.indexOf('#') : iri.lastIndexOf(':');
    return this.unique(iri, this.namespace(iri.slice(0, split + 1)) + iri.slice(split + 1).replaceAll(':', '%3A'));
  }

  context(namespaceMap: Record<string, string>): Record<string, string> {
    const context: Record<string, string> = Object.create(null);
    const entries = Object.entries(namespaceMap).map(([iri, prefix]) => [prefix, iri]);
    // Keep all explicit aliases for namespaces present in this package.
    for (const [prefix, iri] of this.sources) {
      if (Object.prototype.hasOwnProperty.call(namespaceMap, iri)) entries.push([prefix, iri]);
    }
    for (const [prefix, iri] of entries) {
      const normalized = this.namespace(iri);
      if (context[prefix] !== undefined && context[prefix] !== normalized) {
        throw new Error(`Namespace prefix collision: ${prefix} names ${context[prefix]} and ${normalized}`);
      }
      context[prefix] = normalized;
    }
    return context;
  }

  /** Include every emitted HTTPS term namespace, preserving available source aliases. */
  resourceContext(context: Record<string, string>, iris: string[]): void {
    const required = new Set(iris.filter(iri => iri.startsWith(this.base) && iri.includes('#'))
      .map(iri => iri.slice(0, iri.indexOf('#') + 1)));
    for (const namespace of [...required].sort()) {
      for (const [prefix, source] of this.sources) {
        if (this.namespace(source) !== namespace) continue;
        if (context[prefix] !== undefined && context[prefix] !== namespace) {
          throw new Error(`Namespace prefix collision: ${prefix} names ${context[prefix]} and ${namespace}`);
        }
        context[prefix] = namespace;
      }
      if (Object.values(context).includes(namespace)) continue;
      // Encode punctuation in generated aliases so distinct paths cannot collapse.
      const prefix = 'ns_' + namespace.slice(this.base.length, -1)
        .replace(/[^A-Za-z0-9]/g, character => '_' + character.charCodeAt(0).toString(16) + '_');
      if (context[prefix] !== undefined && context[prefix] !== namespace) {
        throw new Error(`Namespace prefix collision: ${prefix} names ${context[prefix]} and ${namespace}`);
      }
      context[prefix] = namespace;
    }
  }
}
