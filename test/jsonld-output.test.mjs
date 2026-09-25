import test from 'node:test';
import assert from 'node:assert/strict';
import rdf from '@rdfjs/data-model';
import jsonld from 'jsonld';
import { serializeJsonld } from '../dist/jsonld-output.js';

const ns = 'https://example.org/taxonomy#';
const named = name => rdf.namedNode(ns + name);
const type = rdf.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
const context = { ex: ns, owl: 'http://www.w3.org/2002/07/owl#' };
const canonical = doc => jsonld.canonize(doc, { algorithm: 'URDNA2015', format: 'application/n-quads' });

test('JSON-LD embeds taxonomy blank nodes and preserves schema blank-node references', async () => {
  const root = rdf.blankNode('taxonomyInstance0');
  const child = rdf.blankNode('taxonomyInstance1');
  const restriction = rdf.blankNode('restriction');
  const quads = [
    rdf.quad(root, type, named('Root')),
    rdf.quad(root, named('child'), child),
    rdf.quad(child, named('value'), rdf.literal('ACGU')),
    rdf.quad(named('Schema'), named('restriction'), restriction),
    rdf.quad(named('OtherSchema'), named('restriction'), restriction),
    rdf.quad(restriction, type, rdf.namedNode(context.owl + 'Restriction')),
  ];
  const serialized = await serializeJsonld(quads, context, new Set([root.value, child.value]));
  assert.ok(!serialized.includes('_:_:'), 'Blank-node prefix is applied once');
  const doc = JSON.parse(serialized);
  const taxonomy = doc['@graph'].find(node => node['@type'] === 'ex:Root');
  assert.deepEqual(taxonomy, { '@type': 'ex:Root', 'ex:child': { 'ex:value': 'ACGU' } });
  const schema = doc['@graph'].find(node => node['@id'] === 'ex:Schema');
  assert.equal(schema['ex:restriction']['@id'], '_:restriction');
  assert.equal(await canonical(doc), await canonical(await jsonld.fromRDF(quads)));
});

test('JSON-LD embeds a single anonymous taxonomy node without losing its properties', async () => {
  const root = rdf.blankNode('taxonomyInstance0');
  const quads = [rdf.quad(root, type, named('Root'))];
  const doc = JSON.parse(await serializeJsonld(quads, context, new Set([root.value])));
  assert.deepEqual(doc['@graph'], [{ '@type': 'ex:Root' }]);
  assert.equal(await canonical(doc), await canonical(await jsonld.fromRDF(quads)));
});
