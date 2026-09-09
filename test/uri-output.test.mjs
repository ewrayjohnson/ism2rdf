import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const read = path => readFile(new URL('../out/' + path, import.meta.url), 'utf8');
const stem = 'convenience/Schema/IC-EDH/IC-EDH';
const doc = JSON.parse(await read('jsonld/' + stem + '.jsonld'));
const graph = new Map(doc['@graph'].map(node => [node['@id'], node]));

test('the requested ISM names survive and expand to the agreed HTTPS namespace', () => {
  assert.equal(doc['@context'].ism, 'https://urn.us.gov.ic/ism#');
  for (const name of ['releasableTo', 'displayOnlyTo', 'SCIcontrols', 'disseminationControls', 'highWaterNATO', 'ownerProducer', 'cuiBasic', 'cuiControlledByOffice', 'cuiDecontrolDate', 'cuiSpecified', 'cuiDecontrolEvent']) {
    assert.ok(graph.has('ism:' + name), name);
  }
  for (const name of ['ISM:IC-ARH', 'ISM:IC-ISM', 'ISM:IC-NTK', 'ICID:IC-ID', 'USAgency:USAgency']) assert.ok(graph.has(name), name);
  for (const prefix of ['ismcvegenerated', 'ismcatcvegenerated', 'usagencycvegenerated']) assert.ok(doc['@context'][prefix], prefix);
  const walk = value => {
    if (Array.isArray(value)) return value.forEach(walk);
    if (!value || typeof value !== 'object') return;
    if (value['@id']) assert.ok(!value['@id'].startsWith('urn:'), value['@id']);
    if (value['skos:notation']) assert.equal(typeof value['skos:notation'], 'string');
    assert.ok(!('@value' in value && '@type' in value), 'Typed literal wrapper');
    Object.values(value).forEach(walk);
  };
  walk(doc);
});

test('JSON-LD, Turtle, N-Triples, TriG and TDF use the same resource and graph URIs', async () => {
  const ttl = await read('ttl/' + stem + '.ttl');
  const nt = await read('nt/' + stem + '.nt');
  const trig = await read('trig/' + stem + '.trig');
  const tdf = JSON.parse(await read('trig/' + stem + '.tdf'));
  assert.ok(ttl.includes('@prefix ism: <https://urn.us.gov.ic/ism#>'));
  assert.ok(trig.includes('@prefix ism: <https://urn.us.gov.ic/ism#>'));
  assert.ok(nt.includes('<https://urn.us.gov.ic/ism#releasableTo>'));
  assert.equal(tdf.graphName, 'https://urn.us.gov.ic/IC-EDH#IC-EDH:graph:convenience');
  assert.ok(trig.includes(`GRAPH <${tdf.graphName}>`));
  assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), trig);
  assert.equal(tdf.payloadSha256, createHash('sha256').update(trig).digest('hex'));
  const bridge = JSON.parse(await read('jsonld/convenience/Schema/cco-marking-bridge.jsonld'));
  assert.equal(bridge['@context'].ism, doc['@context'].ism);
  assert.equal(bridge['@context'].cco, 'http://www.ontologyrepository.com/CommonCoreOntologies/');
});
