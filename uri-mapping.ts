/** Shared identity mapping; literals never pass through this class. */
export class UriMapping {
  private readonly namespaces = new Map<string, string>();
  private readonly identities = new Map<string, string>();
  private readonly sources = new Map<string, string>();
  private readonly documents = new Set<string>();
  private readonly host: string;

  constructor(private readonly authority: string) {
    if (!/^urn:[A-Za-z0-9-]+(?::[A-Za-z0-9-]+)*$/.test(authority)) {
      throw new Error('URN authority must contain colon-separated hostname labels');
    }
    this.host = `https://${authority.replace(/:/g, '.').toLowerCase()}`;
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
    const path = suffix.split(':').map(encodeURIComponent).join('_');
    const result = this.unique(iri, this.host + (path ? '/' + path : '') + '#');
    this.namespaces.set(iri, result);
    return result;
  }

  source(iri: string, prefix: string): void {
    const previous = this.sources.get(prefix);
    if (previous && previous !== iri) throw new Error(`Source prefix collision: ${prefix} names ${previous} and ${iri}`);
    this.sources.set(prefix, iri);
    this.namespace(iri);
  }

  document(iri: string): void {
    this.documents.add(iri);
    this.namespace(iri);
  }

  uri(iri: string): string {
    if (!this.belongs(iri)) {
      if (/^urn:/i.test(iri)) throw new Error(`URN outside configured authority ${this.authority}: ${iri}`);
      // Detect a source HTTPS identifier colliding with a rewritten identifier too.
      return this.unique(iri, iri);
    }
    const namespace = [...this.namespaces.keys()].filter(ns => iri.startsWith(ns)).sort((a, b) => b.length - a.length)[0];
    if (namespace) return this.unique(iri, this.namespaces.get(namespace)! + iri.slice(namespace.length));
    if (iri === this.authority) return this.namespace(iri);
    const split = iri.indexOf('#') >= 0 ? iri.indexOf('#') : iri.lastIndexOf(':');
    return this.unique(iri, this.namespace(iri.slice(0, split + 1)) + iri.slice(split + 1));
  }

  context(namespaceMap: Record<string, string>): Record<string, string> {
    const aliases = new Map(this.sources);
    const generated = new Map<string, string>();
    // Sort the complete document set so aliases cannot depend on import order.
    for (const iri of [...this.documents].sort()) {
      const parts = iri.slice(this.authority.length).split(':').filter(Boolean);
      const caseName = parts.join('').replace(/[^A-Za-z0-9]/g, '');
      const candidates = [caseName.toLowerCase(), caseName, parts.join('_').replace(/[^A-Za-z0-9_]/g, '')]
        .map(name => /^[A-Za-z]/.test(name) ? name : `ns${name}`);
      const prefix = candidates.find(name => !aliases.has(name) || aliases.get(name) === iri);
      if (!prefix) throw new Error(`Cannot derive a distinct document prefix for ${iri}`);
      aliases.set(prefix, iri);
      generated.set(iri, prefix);
    }
    const context: Record<string, string> = Object.create(null);
    for (const [iri, originalPrefix] of Object.entries(namespaceMap)) {
      const prefix = generated.get(iri) ?? originalPrefix;
      const normalized = this.namespace(iri);
      if (context[prefix] !== undefined && context[prefix] !== normalized) {
        throw new Error(`Namespace prefix collision: ${prefix} names ${context[prefix]} and ${normalized}`);
      }
      context[prefix] = normalized;
    }
    return context;
  }
}
