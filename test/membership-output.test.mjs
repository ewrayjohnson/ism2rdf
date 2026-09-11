import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Parser } from 'n3';
import jsonld from 'jsonld';
import { parseStringPromise } from 'xml2js';
import { UriMapping } from '../dist/uri-mapping.js';

const read = file => readFile(new URL('../' + file, import.meta.url), 'utf8');
const json = async file => JSON.parse((await read(file)).replace(/^\uFEFF/, ''));
const mapping = new UriMapping(process.env.ISM2RDF_URN_AUTHORITY ?? 'urn:us:gov:ic', process.env.ISM2RDF_HTTPS_BASE);
const config = await json('.ciartifacts/config/membership-map.json');
const tetra = mapping.namespace(config.schemaNamespace + '#');
const rootOf = quads => quads.find(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && q.object.value === tetra + 'Tetragraphs')?.subject;
const artifactPath = (entry, format) => 'out/' + format + '/' + entry.mode + '/' + entry.trigPath.replace(/\.trig$/, '.' + format);
const entries = (await Promise.all(['standalone', 'convenience'].map(async mode => (await json('out/trig/' + mode + '/manifest.json')).entries))).flat();
const supplement = entries.find(entry => entry.category === 'Membership');
assert.ok(supplement);
const original = new Parser({ format: 'N-Triples' }).parse(await read(artifactPath(supplement, 'nt')));
const typed = (quads, type) => quads.filter(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' && q.object.value === tetra + type);
// Compare the anonymous tree structurally: serializer blank-node labels are not identities.
const signature = quads => {
  const root = rootOf(quads);
  if (!root) return [];
  const walk = subject => {
    assert.equal(subject.termType, 'BlankNode');
    return quads.filter(q => q.subject.equals(subject)).map(q => JSON.stringify([q.predicate.value,
      q.object.termType === 'BlankNode' ? walk(q.object) : [q.object.termType, q.object.value, q.object.datatype?.value]])).sort();
  };
  return walk(root);
};

test('every supplied XML element and attribute survives in RDF without CVE references', async () => {
  const root = Object.values(await parseStringPromise(await read('.ciartifacts/' + config.file), { xmlns: true }))[0];
  const find = (id, predicate) => original.filter(q => q.subject.value === id && q.predicate.value === predicate);
  const walk = (node, id) => {
    const ismAttrs = Object.values(node.$ ?? {}).filter(attr => attr.uri === 'urn:us:gov:ic:ism');
    const compactPair = config.compact !== false && ismAttrs.length === 2 &&
      ismAttrs.some(attr => attr.local === 'classification' && attr.value === 'U') &&
      ismAttrs.some(attr => attr.local === 'ownerProducer' && attr.value === 'USA') &&
      !Object.values(node).filter(Array.isArray).flat().some(child => child.$ns?.uri === 'urn:us:gov:ic:ism');
    for (const [name, attr] of Object.entries(node.$ ?? {})) {
      if (name === 'xmlns' || name.startsWith('xmlns:')) continue;
      if (compactPair && attr.uri === 'urn:us:gov:ic:ism') {
        assert.equal(find(id, mapping.namespace(attr.uri + '#') + attr.local).length, 0);
        continue;
      }
      assert.ok(find(id, mapping.namespace((attr.uri || node.$ns.uri) + '#') + (attr.local || name)).some(q => q.object.value === attr.value), name);
    }
    if (node._ !== undefined) assert.ok(find(id, 'http://www.w3.org/1999/02/22-rdf-syntax-ns#value').some(q => q.object.value === node._));
    for (const values of Object.values(node).filter(Array.isArray)) {
      for (const [index, child] of values.entries()) {
        const matches = find(id, mapping.namespace(child.$ns.uri + '#') + child.$ns.local);
        const childAttrs = Object.entries(child.$ ?? {}).filter(([key]) => key !== 'xmlns' && !key.startsWith('xmlns:')).map(([, attr]) => attr);
        const omittedPair = config.compact !== false && childAttrs.length === 2 &&
          childAttrs.every(attr => attr.uri === 'urn:us:gov:ic:ism') &&
          childAttrs.some(attr => attr.local === 'classification' && attr.value === 'U') &&
          childAttrs.some(attr => attr.local === 'ownerProducer' && attr.value === 'USA');
        const emptyDescription = child.$ns.local === 'Description' && child._ === undefined;
        const nested = Object.values(child).some(Array.isArray) || childAttrs.length > 0 && !omittedPair || child._ === undefined && !emptyDescription;
        if (!nested) assert.ok(matches.some(q => q.object.termType === 'Literal' && q.object.value === (child._ ?? '')));
        else {
          assert.equal(matches[index].object.termType, 'BlankNode');
          walk(child, matches[index].object.value);
        }
      }
    }
  };
  walk(root, rootOf(original).value);
  assert.ok(original.every(q => q.subject.termType === 'BlankNode'));
  assert.ok(original.every(q => !q.subject.value.includes('/cvenum/') && !(q.object.termType === 'NamedNode' && q.object.value.includes('/cvenum/'))));
});

test('taxonomy graph is consistent across formats and packaged with its defining schema', async () => {
  let included = 0;
  for (const entry of entries.filter(entry => ['Schema', 'Membership'].includes(entry.category))) {
    const nt = new Parser({ format: 'N-Triples' }).parse(await read(artifactPath(entry, 'nt')));
    const hasSchema = nt.some(q => q.subject.value === mapping.ontology(config.schemaNamespace));
    const wanted = entry.category === 'Membership' || entry.mode === 'convenience' && hasSchema;
    assert.equal(typed(nt, 'Tetragraphs').length, wanted ? 1 : 0, 'One taxonomy per package, not per CVE: ' + entry.trigPath);
    assert.equal(typed(nt, 'Tetragraph').length, wanted ? typed(original, 'Tetragraph').length : 0, 'No per-CVE record copies: ' + entry.trigPath);
    assert.ok(!nt.some(q => q.subject.value.includes('/cvenum/') &&
      [tetra + 'Membership', 'http://www.w3.org/2000/01/rdf-schema#member', 'http://www.w3.org/2004/02/skos/core#member'].includes(q.predicate.value)), 'No membership attached to CVEs');
    const expected = wanted ? signature(original) : [];
    assert.deepEqual(signature(nt), expected, entry.trigPath);
    if (wanted) included++;
    for (const [format, syntax] of [['ttl', 'Turtle'], ['trig', 'TriG']]) {
      const content = await read(artifactPath(entry, format));
      assert.deepEqual(signature(new Parser({ format: syntax }).parse(content)), expected, format + ': ' + entry.trigPath);
      if (format === 'trig') {
        const tdf = await json('out/trig/' + entry.mode + '/' + entry.tdfPath);
        assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), content);
      }
    }
    if (wanted) {
      const doc = await json(artifactPath(entry, 'jsonld'));
      const taxonomy = doc['@graph'].find(node => node['@type'] === 'tetra:Tetragraphs');
      assert.ok(taxonomy, 'Nested taxonomy root');
      const checkAnonymous = node => {
        if (!node || typeof node !== 'object') return;
        assert.ok(!('@id' in node), 'No invented identity on XML elements');
        Object.values(node).forEach(value => (Array.isArray(value) ? value : [value]).forEach(checkAnonymous));
      };
      checkAnonymous(taxonomy);
      const firstToken = taxonomy['tetra:Tetragraph'][0]['tetra:TetraToken'];
      assert.equal(config.compact === false ? firstToken['rdf:value'] : firstToken, 'ACGU');
      const nquads = await jsonld.toRDF(doc, { format: 'application/n-quads' });
      assert.deepEqual(signature(new Parser({ format: 'N-Quads' }).parse(nquads)), expected, 'JSON-LD: ' + entry.trigPath);
      assert.ok(Object.values(doc['@context']).some(value => value?.['@type'] === 'http://www.w3.org/2001/XMLSchema#date'));
      const dates = JSON.stringify(doc['@graph']);
      assert.ok(dates.includes('2022-11-02'));
    }
  }
  assert.ok(included >= 3, 'Standalone taxonomy, taxonomy convenience and IC-EDH convenience include the instance');
});
