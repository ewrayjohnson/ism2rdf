import test from 'node:test';
import assert from 'node:assert/strict';
import { UriMapping } from '../dist/uri-mapping.js';

test('explicit resource boundaries retain nested names with reversible encoding', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
  mapping.resourceNamespace('urn:example:org:policy:', 'policy');
  for (const name of ['permissive', 'enterprise:role:permissive', 'propin:1', 'propin:Acme:a+b', 'literal%3Acolon']) {
    const iri = mapping.uri('urn:example:org:policy:' + name);
    assert.equal(iri, 'https://example.org/ns/policy#' + encodeURIComponent(name));
    assert.equal(decodeURIComponent(iri.split('#')[1]), name);
    assert.ok(!iri.split('#')[1].includes(':'));
  }
  const context = {};
  mapping.resourceContext(context, [mapping.uri('urn:example:org:policy:propin:1')]);
  assert.deepEqual(context, { policy: 'https://example.org/ns/policy#' });
  assert.throws(() => mapping.resourceContext({ policy: 'https://other.example/' },
    [mapping.uri('urn:example:org:policy:permissive')]), /prefix collision/);
});

test('inferred namespace mapping is independent of sibling order', () => {
  for (const names of [['a:one', 'a:b:two'], ['a:b:two', 'a:one']]) {
    const mapping = new UriMapping('urn:example:org');
    for (const name of names) mapping.uri('urn:example:org:' + name);
    assert.equal(mapping.uri('urn:example:org:a:b:two'), 'https://ns.dni.ic.gov/a/b#two');
  }
});

test('generated fragments encode colons and reject encoded identity collisions', () => {
  const mapping = new UriMapping('urn:example:org');
  mapping.source('urn:example:org:catalog#', 'cat');
  assert.equal(mapping.uri('urn:example:org:catalog#Pattern:Shape'), 'https://ns.dni.ic.gov/catalog#Pattern%3AShape');
  assert.throws(() => mapping.uri('urn:example:org:catalog#Pattern%3AShape'), /normalization collision/);
});

test('normalizes namespace structure while preserving local names and HTTP identities', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
  mapping.source('urn:example:org:catalog#', 'cat');
  mapping.ontology('urn:example:org:catalog');
  assert.equal(mapping.uri('urn:example:org:catalog#Item'), 'https://example.org/ns/catalog#Item');
  assert.equal(mapping.uri('urn:example:org:catalog'), 'https://example.org/ns/catalog');
  assert.equal(mapping.namespace('urn:example:org'), 'https://example.org/ns/#');
  for (const iri of ['http://example.org/ns#Item', 'https://example.org/ns#Item', '_:b1']) assert.equal(mapping.uri(iri), iri);
  assert.throws(() => mapping.uri('urn:another:org:Item'), /outside configured authority/);
});

test('preserves all explicit aliases without creating directory-derived aliases', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
  mapping.source('urn:example:org:catalog#', 'cat');
  mapping.source('urn:example:org:catalog#', 'catalog');
  mapping.ontology('urn:example:org:catalog');
  const context = mapping.context({ 'urn:example:org:catalog#': 'cat' });
  assert.deepEqual({ ...context }, { cat: 'https://example.org/ns/catalog#', catalog: 'https://example.org/ns/catalog#' });
});

test('reorders controlled vocabularies and rejects semantic mapping collisions', () => {
  for (const order of [
    ['urn:example:org:cvenum:cat:item#', 'urn:example:org:cat:cvenum:item#'],
    ['urn:example:org:cat:cvenum:item#', 'urn:example:org:cvenum:cat:item#'],
  ]) {
    const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
    assert.equal(mapping.namespace(order[0]), 'https://example.org/ns/cat/cvenum/item#');
    assert.throws(() => mapping.namespace(order[1]), /normalization collision/);
  }
});

test('keeps namespace paths distinct and rejects alias reuse', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
  mapping.source('urn:example:org:a:b#', 'ab');
  mapping.source('urn:example:org:a_b#', 'other');
  assert.equal(mapping.namespace('urn:example:org:a:b#'), 'https://example.org/ns/a/b#');
  assert.equal(mapping.namespace('urn:example:org:a_b#'), 'https://example.org/ns/a_b#');
  assert.throws(() => mapping.source('urn:example:org:c#', 'ab'), /Source prefix collision/);
  assert.throws(() => mapping.context({ 'http://example.org/a#': 'same', 'http://example.org/b#': 'same' }), /prefix collision/);
});

test('detects rewritten identities colliding with existing HTTPS identities', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns/');
  mapping.source('urn:example:org:a#', 'a');
  mapping.uri('https://example.org/ns/a#Item');
  assert.throws(() => mapping.uri('urn:example:org:a#Item'), /normalization collision/);
});

test('defaults to the proposed root and preserves case and encoded path components', () => {
  const mapping = new UriMapping('urn:us:gov:ic');
  assert.equal(mapping.namespace('urn:us:gov:ic:ism#'), 'https://ns.dni.ic.gov/ism#');
  assert.equal(mapping.namespace('urn:us:gov:ic:ISM:'), 'https://ns.dni.ic.gov/ISM#');
  assert.equal(mapping.namespace('urn:us:gov:ic:cvenum:ism:classification:all#'), 'https://ns.dni.ic.gov/ism/cvenum/classification/all#');
  assert.equal(mapping.namespace('urn:us:gov:ic:a/b#'), 'https://ns.dni.ic.gov/a%2Fb#');
  assert.throws(() => mapping.namespace('urn:us:gov:ic:a:..#'), /dot path segments/);
});

test('validates HTTPS bases and accepts a base path without a trailing slash', () => {
  const mapping = new UriMapping('urn:example:org', 'https://example.org/ns');
  assert.equal(mapping.namespace('urn:example:org:cat#'), 'https://example.org/ns/cat#');
  for (const base of ['http://example.org/', '/ns/', '', 'https://user:pass@example.org/', 'https://example.org/?x', 'https://example.org/#']) {
    assert.throws(() => new UriMapping('urn:example:org', base));
  }
});
