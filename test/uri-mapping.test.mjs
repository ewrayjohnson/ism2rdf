import test from 'node:test';
import assert from 'node:assert/strict';
import { UriMapping } from '../dist/uri-mapping.js';

test('normalizes namespace structure while preserving local names and HTTP identities', () => {
  const mapping = new UriMapping('urn:example:org');
  mapping.source('urn:example:org:catalog#', 'cat');
  mapping.document('urn:example:org:CAT:');
  assert.equal(mapping.uri('urn:example:org:catalog#Item'), 'https://urn.example.org/catalog#Item');
  assert.equal(mapping.uri('urn:example:org:CAT:Schema:graph:standalone'), 'https://urn.example.org/CAT#Schema:graph:standalone');
  assert.equal(mapping.namespace('urn:example:org'), 'https://urn.example.org#');
  for (const iri of ['http://example.org/ns#Item', 'https://example.org/ns#Item', '_:b1']) assert.equal(mapping.uri(iri), iri);
  assert.throws(() => mapping.uri('urn:another:org:Item'), /outside configured authority/);
});

test('keeps working aliases and uses case for collisions regardless of import order', () => {
  const documents = ['urn:example:org:CAT:', 'urn:example:org:CAT:CVEGenerated:'];
  const make = order => {
    const mapping = new UriMapping('urn:example:org');
    mapping.source('urn:example:org:catalog#', 'cat');
    order.forEach(iri => mapping.document(iri));
    return mapping.context({ 'urn:example:org:catalog#': 'cat', [documents[0]]: 'cat', [documents[1]]: 'catcvegenerated' });
  };
  const context = make(documents);
  assert.deepEqual(context, make([...documents].reverse()));
  assert.equal(context.cat, 'https://urn.example.org/catalog#');
  assert.equal(context.CAT, 'https://urn.example.org/CAT#');
  assert.equal(context.catcvegenerated, 'https://urn.example.org/CAT_CVEGenerated#');
  assert.ok(!Object.keys(context).some(prefix => /\d$/.test(prefix)));
});

test('rejects ambiguous namespace flattening and source alias reuse', () => {
  const mapping = new UriMapping('urn:example:org');
  mapping.source('urn:example:org:a:b#', 'ab');
  assert.throws(() => mapping.source('urn:example:org:a_b#', 'other'), /normalization collision/);
  assert.throws(() => mapping.source('urn:example:org:c#', 'ab'), /Source prefix collision/);
  assert.throws(() => mapping.context({ 'http://example.org/a#': 'same', 'http://example.org/b#': 'same' }), /prefix collision/);
});

test('detects rewritten identities colliding with existing HTTPS identities', () => {
  const mapping = new UriMapping('urn:example:org');
  mapping.source('urn:example:org:a#', 'a');
  mapping.uri('https://urn.example.org/a#Item');
  assert.throws(() => mapping.uri('urn:example:org:a#Item'), /normalization collision/);
});
