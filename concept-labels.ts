import xml2js from 'xml2js';

const XSD = 'http://www.w3.org/2001/XMLSchema';
const SKOS = 'http://www.w3.org/2004/02/skos/core#';
export type TextValue = { value: string; language: string };
type Annotation = { documentation: TextValue[]; names: TextValue[] };
export type LabelConfig = {
  propertyLabelVocabularies: Array<{ namespace: string; language: string }>;
  reviewed: Array<{ namespace: string; notation: string; labels: TextValue[]; source: string }>;
};

export function validateLabelConfig(value: any): LabelConfig {
  const text = (item: any) => typeof item?.value === 'string' && item.value.trim() &&
    typeof item.language === 'string' && (!item.language || /^[a-z]+(?:-[a-z0-9]+)*$/i.test(item.language));
  if (!value || !Array.isArray(value.propertyLabelVocabularies) || !Array.isArray(value.reviewed) ||
      value.propertyLabelVocabularies.some((item: any) => typeof item?.namespace !== 'string' ||
        !text({ value: item.namespace, language: item.language })) ||
      value.reviewed.some((item: any) => typeof item?.namespace !== 'string' || !item.namespace ||
        typeof item.notation !== 'string' || typeof item.source !== 'string' || !item.source.trim() ||
        !Array.isArray(item.labels) || !item.labels.length || !item.labels.every(text))) {
    throw new Error('Invalid concept-labels configuration: names require language and source provenance');
  }
  return value;
}

export const facetKey = (type: string, kind: string, value: string) => JSON.stringify([type, kind, value]);

/** A separate ordered parse preserves mixed text and inherited xml:lang without
 * changing the legacy schema parser used for identities and enumeration lists. */
export async function readConceptAnnotations(xml: string): Promise<Map<string, Annotation>> {
  const parsed = await xml2js.parseStringPromise(xml, {
    xmlns: true, explicitChildren: true, preserveChildrenOrder: true, charsAsChildren: true, includeWhiteChars: true,
  });
  const result = new Map<string, Annotation>();
  const attr = (node: any, name: string) => node.$?.[name]?.value;
  const children = (node: any) => node.$$ ?? [];
  const is = (node: any, ns: string, local: string) => node.$ns?.uri === ns && node.$ns.local === local;
  const values = (node: any, language: string): TextValue[] => {
    language = attr(node, 'xml:lang') ?? language;
    // Split explicitly tagged child passages rather than losing their language.
    const parts: TextValue[] = [];
    const collect = (current: any, lang: string) => {
      lang = attr(current, 'xml:lang') ?? lang;
      const block = current.$ns?.uri === 'http://www.w3.org/1999/xhtml' &&
        ['p', 'div', 'li', 'br', 'h1', 'h2', 'h3'].includes(current.$ns.local);
      if (block) parts.push({ value: ' ', language: lang });
      if (!children(current).length) {
        parts.push({ value: current._ ?? '', language: lang });
      } else {
        for (const child of children(current)) collect(child, lang);
      }
      if (block) parts.push({ value: ' ', language: lang });
    };
    collect(node, language);
    const combined: TextValue[] = [];
    for (const part of parts) {
      const previous = combined[combined.length - 1];
      if (previous?.language === part.language) previous.value += part.value;
      else combined.push({ ...part });
    }
    return combined.map(part => ({ ...part, value: part.value.replace(/\s+/g, ' ').trim() })).filter(part => part.value);
  };
  const walk = (node: any, language: string, owner: string) => {
    language = attr(node, 'xml:lang') ?? language;
    if (is(node, XSD, 'simpleType')) owner = attr(node, 'name') ?? owner;
    if (is(node, XSD, 'enumeration') || is(node, XSD, 'pattern')) {
      const key = facetKey(owner, node.$ns.local, attr(node, 'value'));
      const annotation = result.get(key) ?? { documentation: [], names: [] };
      for (const item of children(node).filter((child: any) => is(child, XSD, 'annotation'))) {
        const lang = attr(item, 'xml:lang') ?? language;
        for (const doc of children(item).filter((child: any) => is(child, XSD, 'documentation'))) {
          annotation.documentation.push(...values(doc, lang));
        }
        const names = (child: any, inherited: string) => {
          const childLang = attr(child, 'xml:lang') ?? inherited;
          if (is(child, SKOS, 'prefLabel')) annotation.names.push(...values(child, childLang));
          else if (is(child, SKOS, 'definition')) annotation.documentation.push(...values(child, childLang));
          else for (const nested of children(child)) names(nested, childLang);
        };
        for (const info of children(item).filter((child: any) => is(child, XSD, 'appinfo'))) names(info, lang);
      }
      result.set(key, annotation);
    }
    for (const child of children(node)) walk(child, language, owner);
  };
  walk(Object.values(parsed)[0], '', '');
  return result;
}

/** These are conservative review heuristics, not an authoritative name extractor. */
export function classifyDocumentation(value: string): { kind: 'label' | 'definition' | 'ambiguous'; reason: string } {
  if (/[.!?]\s+\S/.test(value) || /\b(?:is|are|must|shall|should|may|can|will|was|were|has|have|identifies|indicates|specifies|denotes|describes|contains|provides|handles)\b/i.test(value) ||
      /\b(?:that|which|used (?:to|for)|responsible for|in accordance|including|ref\.?\s|information (?:related|requiring)|determined to)\b/i.test(value)) {
    return { kind: 'definition', reason: 'explanatory-prose' };
  }
  if (value.length > 120 || value.split(/\s+/).length > 15) {
    return { kind: 'ambiguous', reason: 'length-review' };
  }
  if (value.split(/\s+/).length <= 8 && /^[\p{L}\p{N}\s,'’()&/\-]+[.!]?$/u.test(value)) {
    return { kind: 'label', reason: 'short-name-like-documentation' };
  }
  return { kind: 'ambiguous', reason: 'unclassified-documentation' };
}

export function resolveConceptLabels(namespace: string, notation: string, annotation: Annotation | undefined,
  config: LabelConfig, propertyLabels: Record<string, string>) {
  const documentation = annotation?.documentation ?? [];
  const candidates: Array<TextValue & { priority: number; reason: string }> = [];
  const decisions: Array<TextValue & { reason: string; outcome: string }> = [];
  const add = (items: TextValue[], priority: number, reason: string) =>
    candidates.push(...items.map(item => ({ ...item, priority, reason })));
  add(annotation?.names ?? [], 3, 'explicit-source-name');
  for (const entry of config.reviewed.filter(entry => entry.namespace === namespace && entry.notation === notation)) {
    add(entry.labels, 2, 'reviewed-name: ' + entry.source);
  }
  for (const entry of config.propertyLabelVocabularies.filter(entry => entry.namespace === namespace)) {
    if (Object.prototype.hasOwnProperty.call(propertyLabels, notation)) {
      add([{ value: propertyLabels[notation], language: entry.language }], 1, 'existing-property-label');
    }
  }
  for (const doc of documentation) {
    const classification = classifyDocumentation(doc.value);
    decisions.push({ ...doc, reason: classification.reason, outcome: classification.kind });
    if (classification.kind === 'label') add([doc], 0, classification.reason);
  }
  const labels: TextValue[] = [];
  const definitions: TextValue[] = [];
  const unique = (items: TextValue[]) => items.filter((item, index) => items.findIndex(other =>
    other.value === item.value && other.language.toLowerCase() === item.language.toLowerCase()) === index);
  for (const language of new Set(candidates.map(item => item.language.toLowerCase()))) {
    const options = candidates.filter(item => item.language.toLowerCase() === language);
    const priority = Math.max(...options.map(item => item.priority));
    const preferred = unique(options.filter(item => item.priority === priority));
    if (preferred.length === 1) {
      const { value, language } = preferred[0];
      labels.push({ value, language });
      decisions.push({ value, language, reason: options.find(item => item.priority === priority)!.reason, outcome: 'selected-label' });
    } else {
      for (const item of preferred) decisions.push({ ...item, reason: 'conflicting-names-in-language', outcome: 'missing-label' });
      definitions.push(...preferred.map(({ value, language }) => ({ value, language })));
    }
  }
  definitions.push(...documentation.filter(doc => !labels.some(label =>
    label.value === doc.value && label.language.toLowerCase() === doc.language.toLowerCase())));
  const missingLanguages = [...new Set([...documentation, ...(annotation?.names ?? [])].map(item => item.language.toLowerCase()))]
    .filter(language => !labels.some(label => label.language.toLowerCase() === language));
  if (!labels.length && !missingLanguages.length) missingLanguages.push('');
  return { labels, definitions: unique(definitions), decisions, missingLanguages };
}
