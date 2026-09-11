import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { taxonomyRdf } from '../dist/membership-map.js';
import { UriMapping } from '../dist/uri-mapping.js';

const xml = readFileSync(new URL('./fixtures/tetragraph-memberships.xml', import.meta.url), 'utf8');
const schema = fileURLToPath(new URL('../.ciartifacts/Schema/ISMCAT/Tetragraph.xsd', import.meta.url));
const mapping = new UriMapping('urn:us:gov:ic');
const read = input => taxonomyRdf(input, schema, mapping);
const signature = quads => quads.map(q => JSON.stringify([q.subject.value, q.predicate.value, q.object.termType, q.object.value, q.object.datatype?.value])).sort();
const ns = mapping.namespace('urn:us:gov:ic:taxonomy:catt:tetragraph#');

test('compact defaults to omitting only the exact isolated U/USA pair; full mode preserves it', async () => {
  const ism = mapping.namespace('urn:us:gov:ic:ism#');
  const full = await taxonomyRdf(xml, schema, mapping, { compact: false });
  const compact = await read(xml);
  const tokenId = full.quads.find(q => q.object.value === 'FVEY').subject.value;
  const onToken = result => result.quads.filter(q => q.subject.value === tokenId && q.predicate.value.startsWith(ism));
  assert.equal(onToken(full).length, 2);
  assert.equal(onToken(compact).length, 0);
  assert.ok(compact.quads.some(q => q.predicate.value === ns + 'TetraToken' && q.object.termType === 'Literal' && q.object.value === 'FVEY'));
  assert.ok(!compact.quads.some(q => q.subject.value === tokenId));
  const securityId = full.quads.find(q => q.object.value === mapping.namespace('urn:us:gov:ic:arh#') + 'Security').subject.value;
  assert.deepEqual(signature(compact.quads.filter(q => q.subject.value === securityId)), signature(full.quads.filter(q => q.subject.value === securityId)), 'Other ISM properties preserve the entire security object');
  assert.deepEqual(signature((await read(xml.replaceAll('ism:', 'marking:').replace('xmlns:ism=', 'xmlns:marking='))).quads), signature(compact.quads));
  for (const replacement of ['ism:classification="C" ism:ownerProducer="USA"', 'ism:classification="U" ism:ownerProducer="CAN"']) {
    const changed = xml.replace('<tetra:TetraToken ism:classification="U" ism:ownerProducer="USA"', '<tetra:TetraToken ' + replacement);
    const preserved = await taxonomyRdf(changed, schema, mapping, { compact: false });
    assert.deepEqual(signature(onToken(await read(changed))), signature(onToken(preserved)));
  }
});

test('XML values are independent of prefix spelling and instances have no named identities', async () => {
  const original = await read(xml);
  assert.ok(original.quads.every(q => q.subject.termType === 'BlankNode'));
  assert.deepEqual(signature((await read(xml.replaceAll('tetra:', 'catt:').replace('xmlns:tetra=', 'xmlns:catt='))).quads), signature(original.quads));
  assert.deepEqual(original.quads.filter(q => q.predicate.value === ns + 'Country').map(q => q.object.value), ['AUS', 'CAN', 'GBR', 'NZL', 'USA']);
  assert.ok(original.quads.filter(q => q.predicate.value === ns + 'Country').every(q => q.object.termType === 'Literal'));
  const reduced = await read(xml.replace('<tetra:Country>AUS</tetra:Country>', ''));
  assert.deepEqual([...new Set(reduced.quads.map(q => q.subject.value))], [...new Set(original.quads.map(q => q.subject.value))]);
});

test('descriptions, suppression, deprecation and dates retain distinct source meanings', async () => {
  for (const [name, alternative] of [
    ['MembershipSupressed', '<tetra:MembershipSupressed/>'],
    ['Description', '<tetra:Description ism:classification="U" ism:ownerProducer="USA">Unspecified example</tetra:Description>'],
    ['Description', '<tetra:Description ism:classification="U" ism:ownerProducer="USA"/>'],
  ]) {
    const { quads } = await read(xml.replace(/<tetra:Country>[\s\S]*<\/tetra:Country>/, alternative).replace('decomposable="Yes"', 'decomposable="Yes" deprecated="2023-01-01"'));
    assert.ok(quads.some(q => q.predicate.value === ns + name));
    const memberValue = quads.find(q => q.predicate.value === ns + name).object;
    assert.equal(memberValue.termType, name === 'Description' ? 'Literal' : 'BlankNode');
    if (name === 'Description' && alternative.endsWith('/>')) assert.equal(memberValue.value, '');
    assert.ok(!quads.some(q => q.predicate.value === ns + 'Country'));
    for (const field of ['dateLastVerified', 'deprecated']) {
      assert.equal(quads.find(q => q.predicate.value === ns + field).object.datatype.value, 'http://www.w3.org/2001/XMLSchema#date');
    }
  }
});

test('XSD validation rejects invalid source data', async () => {
  for (const input of [
    '{}', xml.replaceAll('urn:us:gov:ic:taxonomy:catt:tetragraph', 'urn:wrong'),
    xml.replace('dateLastVerified="2022-11-02"', ''),
    xml.replace('dateLastVerified="2022-11-02"', 'dateLastVerified="not-a-date"'),
    xml.replace('decomposable="Yes"', 'decomposable="Maybe"'),
    xml.replace('<tetra:Country>AUS</tetra:Country>', '<tetra:Country>BOGUS</tetra:Country>'),
    xml.replace(/<tax:IRM>[\s\S]*?<\/tax:IRM>/, ''),
  ]) await assert.rejects(() => read(input), /Invalid tetragraph XML/);
  const entry = xml.match(/<tetra:Tetragraph [\s\S]*?<\/tetra:Tetragraph>/)[0];
  await assert.rejects(() => read(xml.replace('</tetra:Tetragraphs>', entry + '</tetra:Tetragraphs>')), /Duplicate tetragraph/);
});
