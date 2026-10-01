import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Parser, Writer } from 'n3';
import jsonld from 'jsonld';

export const skos = 'http://www.w3.org/2004/02/skos/core#';
export const isConceptText = q => [skos + 'prefLabel', skos + 'definition'].includes(q.predicate.value);
export const readOutput = file => readFile(new URL('../out/' + file, import.meta.url), 'utf8');
export const schemaEntries = async () => (await Promise.all(['standalone', 'convenience'].map(async mode =>
  JSON.parse(await readOutput(`trig/${mode}/manifest.json`)).entries.filter(entry => entry.category === 'Schema')))).flat();
export const artifact = (entry, format) => `${format}/${entry.mode}/${entry.trigPath.replace(/\.trig$/, '.' + format)}`;

// Canonicalize blank nodes; every statement except concept text must stay unchanged.
export async function structuralSignature() {
  const signatures = [];
  for (const entry of await schemaEntries()) {
    const quads = new Parser({ format: 'N-Triples' }).parse(await readOutput(artifact(entry, 'nt'))).filter(q => !isConceptText(q));
    const nquads = new Writer({ format: 'N-Quads' }).quadsToString(quads);
    const canonical = await jsonld.canonize(nquads, { inputFormat: 'application/n-quads', algorithm: 'URDNA2015' });
    signatures.push([entry.mode, entry.trigPath, entry.graphName, createHash('sha256').update(canonical).digest('hex')]);
  }
  return createHash('sha256').update(JSON.stringify(signatures.sort())).digest('hex');
}
