import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseStringPromise } from 'xml2js';
import { Parser } from 'n3';
import jsonld from 'jsonld';

const source = await readFile(new URL('../.ciartifacts/Schema/ISM/CVEGenerated/CVEnumNTKAccessPolicy.xsd', import.meta.url), 'utf8');
const schema = (await parseStringPromise(source))['xsd:schema'];
const restrictions = schema['xsd:simpleType'][0]['xsd:union'][0]['xsd:simpleType'].map(t => t['xsd:restriction'][0]);
const values = restrictions.flatMap(r => (r['xsd:enumeration'] ?? []).map(e => e.$.value));
const pattern = restrictions.find(r => r['xsd:pattern'])['xsd:pattern'][0].$.value;
const read = file => readFile(new URL('../out/' + file, import.meta.url), 'utf8');
const base = 'https://ns.dni.ic.gov/aces/ntk#';
const skos = 'http://www.w3.org/2004/02/skos/core#';
const profileSource = await readFile(new URL('../.ciartifacts/Schema/ISM/CVEGenerated/CVEnumNTKProfileDes.xsd', import.meta.url), 'utf8');
const profileSchema = (await parseStringPromise(profileSource))['xsd:schema'];
const profiles = profileSchema['xsd:simpleType'][0]['xsd:restriction'][0]['xsd:enumeration'].map(e => e.$.value);

test('all policy enumerations survive as single-colon CURIEs and unchanged literals in every format', async () => {
  for (const stem of ['standalone/Schema/ISM/CVEGenerated/CVEnumNTKAccessPolicy',
    'convenience/Schema/ISM/CVEGenerated/CVEnumNTKAccessPolicy', 'convenience/Schema/IC-EDH/IC-EDH']) {
    const doc = JSON.parse(await read(`jsonld/${stem}.jsonld`));
    assert.equal(doc['@context'].acesntk, base);
    if (stem.endsWith('IC-EDH')) {
      assert.equal(doc['@context'].ntkprofile, 'https://ns.dni.ic.gov/ntk/profile#');
      for (const notation of profiles) {
        assert.ok(doc['@graph'].some(node => node['@id'] === 'ntkprofile:' + notation.split(':').at(-1)
          && node['skos:notation'] === notation));
      }
    }
    for (const value of values) {
      const local = encodeURIComponent(value.slice('urn:us:gov:ic:aces:ntk:'.length));
      const node = doc['@graph'].find(n => n['@id'] === 'acesntk:' + local);
      assert.ok(node, value);
      assert.equal(node['@id'].split(':').length, 2);
      assert.equal(node['skos:notation'], value);
    }
    const datasets = [new Parser({ format: 'N-Quads' }).parse(await jsonld.toRDF(doc, { format: 'application/n-quads' }))];
    for (const [format, syntax] of [['nt', 'N-Triples'], ['ttl', 'Turtle'], ['trig', 'TriG']]) {
      datasets.push(new Parser({ format: syntax }).parse(await read(`${format}/${stem}.${format}`)));
    }
    const tdf = JSON.parse(await read(`trig/${stem}.tdf`));
    datasets.push(new Parser({ format: 'TriG' }).parse(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8')));
    for (const quads of datasets) {
      if (stem.endsWith('IC-EDH')) for (const notation of profiles) {
        assert.ok(quads.some(q => q.subject.value === 'https://ns.dni.ic.gov/ntk/profile#' + notation.split(':').at(-1)
          && q.predicate.value === skos + 'notation' && q.object.termType === 'Literal' && q.object.value === notation));
      }
      for (const value of values) {
        const iri = base + encodeURIComponent(value.slice('urn:us:gov:ic:aces:ntk:'.length));
        assert.ok(quads.some(q => q.subject.value === iri && q.predicate.value === skos + 'notation'
          && q.object.termType === 'Literal' && q.object.value === value));
        assert.ok(quads.some(q => q.predicate.value === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#first'
          && q.object.termType === 'Literal' && q.object.value === value));
      }
      assert.ok(quads.some(q => q.predicate.value === 'http://www.w3.org/ns/shacl#pattern' && q.object.value === pattern));
      for (const q of quads) for (const term of [q.subject, q.predicate, q.object]) {
        if (term.termType !== 'NamedNode') continue;
        assert.ok(!term.value.startsWith('urn:'), term.value);
        if (term.value.startsWith('https://ns.dni.ic.gov/') && term.value.includes('#')) {
          assert.ok(!term.value.slice(term.value.indexOf('#') + 1).includes(':'), term.value);
        }
      }
    }
  }
});

test('packaging adds no policy concepts to standalone EDH and no synthetic EDH imports', async () => {
  const standalone = JSON.parse(await read('jsonld/standalone/Schema/IC-EDH/IC-EDH.jsonld'));
  const convenience = JSON.parse(await read('jsonld/convenience/Schema/IC-EDH/IC-EDH.jsonld'));
  const header = doc => doc['@graph'].find(n => n['@id'] === 'https://ns.dni.ic.gov/edh');
  assert.deepEqual(header(convenience)['owl:imports'], header(standalone)['owl:imports']);
  assert.ok(!standalone['@graph'].some(n => [...values, ...profiles].includes(n['skos:notation'])));
});
