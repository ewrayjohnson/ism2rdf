import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseStringPromise } from 'xml2js';

test('bundled XML preserves every original JSON group and member, including empty groups', async () => {
  const text = await readFile(new URL('../.ciartifacts/tetragraph-memberships.xml', import.meta.url), 'utf8');
  const parsed = await parseStringPromise(text, { xmlns: true });
  const namespace = 'urn:us:gov:ic:taxonomy:catt:tetragraph';
  const children = (node, name) => Object.values(node).filter(Array.isArray).flat()
    .filter(child => child?.$ns?.uri === namespace && child.$ns.local === name);
  const entries = children(Object.values(parsed)[0], 'Tetragraph').map(entry => {
    const group = children(entry, 'TetraToken')[0]._.trim();
    const membership = children(entry, 'Membership')[0];
    assert.equal(membership.$.dateLastVerified.value, '2022-11-02');
    const members = [...children(membership, 'Country'), ...children(membership, 'Organization')]
      .map(member => member._.trim()).sort();
    if (!members.length) {
      const descriptions = children(membership, 'Description');
      assert.equal(descriptions.length, 1);
      assert.equal(descriptions[0]._ ?? '', '', 'No invented description for missing membership data');
    }
    return [group, members];
  }).sort(([a], [b]) => a.localeCompare(b));
  assert.equal(entries.length, 61);
  assert.equal(new Set(entries.map(([group]) => group)).size, 61);
  assert.equal(entries.filter(([, members]) => members.length === 0).length, 36);
  assert.equal(entries.reduce((count, [, members]) => count + members.length, 0), 766);
  // Fingerprint of all sorted group/member values from the preserved original JSON.
  assert.equal(createHash('sha256').update(JSON.stringify(entries)).digest('hex'),
    '704a3308ea38c214caec0df831c31ca80520b1e8e2551e8a3f2bbf7d2c30999d');
  assert.match(text.slice(0, text.indexOf('<tetra:Tetragraphs')), /notional/);
  assert.doesNotMatch(text.slice(text.indexOf('<tetra:Tetragraphs')), /notional/i);
});
