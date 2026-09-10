import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseStringPromise } from 'xml2js';

const read = path => readFile(new URL('../out/' + path, import.meta.url), 'utf8');
const stem = 'convenience/Schema/IC-EDH/IC-EDH';
const doc = JSON.parse(await read('jsonld/' + stem + '.jsonld'));
const graph = new Map(doc['@graph'].map(node => [node['@id'], node]));

test('the requested ISM names survive and expand to the agreed HTTPS namespace', () => {
  assert.equal(doc['@context'].ism, 'https://ns.dni.ic.gov/ism#');
  for (const prefix of ['ISM', 'USAgency', 'ICID', 'ismcvegenerated', 'ismcatcvegenerated', 'usagencycvegenerated']) {
    assert.ok(!(prefix in doc['@context']), prefix);
  }
  for (const name of ['releasableTo', 'displayOnlyTo', 'SCIcontrols', 'disseminationControls', 'highWaterNATO', 'ownerProducer', 'cuiBasic', 'cuiControlledByOffice', 'cuiDecontrolDate', 'cuiSpecified', 'cuiDecontrolEvent']) {
    assert.ok(graph.has('ism:' + name), name);
  }
  for (const name of ['arh', 'ism', 'ntk', 'id', 'usagency']) assert.ok(graph.has('https://ns.dni.ic.gov/' + name), name);
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
  assert.ok(ttl.includes('@prefix ism: <https://ns.dni.ic.gov/ism#>'));
  assert.ok(trig.includes('@prefix ism: <https://ns.dni.ic.gov/ism#>'));
  assert.ok(nt.includes('<https://ns.dni.ic.gov/ism#releasableTo>'));
  assert.equal(tdf.graphName, 'https://ns.dni.ic.gov/edh/graph/convenience');
  assert.ok(trig.includes(`GRAPH <${tdf.graphName}>`));
  assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), trig);
  assert.equal(tdf.payloadSha256, createHash('sha256').update(trig).digest('hex'));
  const bridge = JSON.parse(await read('jsonld/convenience/Schema/cco-marking-bridge.jsonld'));
  assert.equal(bridge['@context'].ism, doc['@context'].ism);
  assert.equal(bridge['@context'].ismclassall, 'https://ns.dni.ic.gov/ism/cvenum/classification/all#');
  assert.equal(bridge['@context'].cco, 'http://www.ontologyrepository.com/CommonCoreOntologies/');
});

const readOntology = async (namespace, mode = 'standalone') => {
  const manifest = JSON.parse(await read(`trig/${mode}/manifest.json`));
  const entry = manifest.entries.find(entry => entry.category === 'Schema' &&
    entry.graphName === `https://ns.dni.ic.gov/${namespace}/graph/${mode}`);
  assert.ok(entry, namespace);
  return JSON.parse(await read(`jsonld/${mode}/${entry.trigPath.replace(/\.trig$/, '.jsonld')}`));
};
const ontologyIds = data => data['@graph']
  .filter(node => [node['@type']].flat().includes('owl:Ontology'))
  .map(node => node['@id']).sort();

test('shared SAR namespace assembles both sources with metadata and no self-import', async () => {
  const data = await readOntology('ism/cvenum/sar');
  const ontology = 'https://ns.dni.ic.gov/ism/cvenum/sar';
  assert.deepEqual(ontologyIds(data), [ontology]);
  const nodes = new Map(data['@graph'].map(node => [node['@id'], node]));
  for (const name of ['CVEnumISMSAR', 'CVEnumISMSARValues', 'CVEnumISMSARAuthorities']) {
    assert.ok(nodes.has('ismsar:' + name), name);
  }
  const header = nodes.get(ontology);
  assert.deepEqual([header['dcterms:source']].flat().sort(), [
    'ISM/CVEGenerated/CVEnumISMSAR.xsd',
    'ISM/CVEGenerated/CVEnumISMSARAuthorities.xsd',
  ]);
  assert.equal(header['owl:versionInfo'], '202111.202211');
  assert.ok(!JSON.stringify(header['owl:imports'] ?? []).includes(ontology));
});

test('ISM is independently consumable and its convenience graph includes only its import closure', async () => {
  const standalone = await readOntology('ism');
  const convenience = await readOntology('ism', 'convenience');
  assert.deepEqual(ontologyIds(standalone), ['https://ns.dni.ic.gov/ism']);
  const expected = new Set();
  const visit = async namespace => {
    const uri = 'https://ns.dni.ic.gov/' + namespace;
    if (expected.has(uri)) return;
    expected.add(uri);
    const data = await readOntology(namespace);
    const header = data['@graph'].find(node => node['@id'] === uri);
    for (const ref of [header['owl:imports'] ?? []].flat()) {
      const id = ref['@id'];
      assert.ok(id.startsWith('https://ns.dni.ic.gov/'), id);
      await visit(id.slice('https://ns.dni.ic.gov/'.length));
    }
  };
  await visit('ism');
  assert.deepEqual(ontologyIds(convenience), [...expected].sort());
  assert.ok(!expected.has('https://ns.dni.ic.gov/edh'));
  assert.ok(!expected.has('https://ns.dni.ic.gov/ntk'));
  const nodes = new Set(convenience['@graph'].map(node => node['@id']));
  for (const name of ['releasableTo', 'displayOnlyTo', 'SCIcontrols', 'disseminationControls', 'highWaterNATO', 'ownerProducer', 'cuiBasic', 'cuiControlledByOffice', 'cuiDecontrolDate', 'cuiSpecified', 'cuiDecontrolEvent']) {
    assert.ok(nodes.has('ism:' + name), name);
  }
});

test('manifests retain source artifact locations and shared ontology graph identities', async () => {
  for (const mode of ['standalone', 'convenience']) {
    const manifest = JSON.parse(await read(`trig/${mode}/manifest.json`));
    const entries = (Array.isArray(manifest) ? manifest : manifest.entries).filter(entry => entry.category === 'Schema');
    assert.equal(entries.length, 44);
    assert.equal(new Set(entries.map(entry => entry.graphName)).size, 43);
    for (const entry of entries) {
      assert.ok(entry.graphName.endsWith('/graph/' + mode), entry.graphName);
      assert.ok(!entry.graphName.includes('CVEGenerated'));
      const trig = await read(`trig/${mode}/${entry.trigPath}`);
      const tdf = JSON.parse(await read(`trig/${mode}/${entry.tdfPath}`));
      assert.equal(tdf.graphName, entry.graphName);
      assert.equal(tdf.payloadSha256, entry.payloadSha256);
      assert.equal(createHash('sha256').update(trig).digest('hex'), entry.payloadSha256);
      assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), trig);
      assert.ok(trig.includes(`GRAPH <${entry.graphName}>`));
    }
  }
});

test('assembled ontologies and their direct imports match the staged XSD declarations', async () => {
  const inventory = new Map();
  const scan = async directory => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const location = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await scan(location);
      else if (entry.name.endsWith('.xsd')) {
        const parsed = await parseStringPromise(await readFile(location, 'utf8'));
        const schema = Object.values(parsed)[0];
        const namespace = schema.$.targetNamespace;
        if (!inventory.has(namespace)) inventory.set(namespace, new Set());
        for (const [key, values] of Object.entries(schema)) {
          if (!key.endsWith(':import')) continue;
          for (const value of values) {
            if (value.$.namespace !== namespace) inventory.get(namespace).add(value.$.namespace);
          }
        }
      }
    }
  };
  await scan(new URL('../.ciartifacts/Schema/', import.meta.url));
  const mapped = namespace => {
    const parts = namespace.slice('urn:us:gov:ic:'.length).split(':');
    if (parts[0] === 'cvenum') parts.splice(0, 2, parts[1], parts[0]);
    return parts.join('/');
  };
  assert.equal(inventory.size, 43);
  for (const [namespace, imports] of inventory) {
    const relative = mapped(namespace);
    const uri = 'https://ns.dni.ic.gov/' + relative;
    const data = await readOntology(relative);
    assert.deepEqual(ontologyIds(data), [uri]);
    const header = data['@graph'].find(node => node['@id'] === uri);
    const actual = [header['owl:imports'] ?? []].flat().map(ref => ref['@id']).sort();
    assert.deepEqual(actual, [...imports].map(ns => 'https://ns.dni.ic.gov/' + mapped(ns)).sort(), namespace);
  }
});

test('all schema output paths mirror sources and shared-namespace aliases contain identical payloads', async () => {
  const paths = [];
  const scan = async (directory, relative = '') => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const location = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await scan(location, relative + entry.name + '/');
      else if (entry.name.endsWith('.xsd')) paths.push('Schema/' + relative + entry.name.replace(/\.xsd$/, '.trig'));
    }
  };
  await scan(new URL('../.ciartifacts/Schema/', import.meta.url));
  for (const mode of ['standalone', 'convenience']) {
    const manifest = JSON.parse(await read(`trig/${mode}/manifest.json`));
    const entries = manifest.entries.filter(entry => entry.category === 'Schema');
    assert.deepEqual(entries.map(entry => entry.trigPath.replaceAll('\\\\', '/')).sort(), paths.sort());
    const sar = entries.filter(entry => entry.graphName === `https://ns.dni.ic.gov/ism/cvenum/sar/graph/${mode}`);
    assert.equal(sar.length, 2);
    assert.equal(sar[0].payloadSha256, sar[1].payloadSha256);
    for (const format of ['jsonld', 'ttl', 'nt', 'trig']) {
      const outputs = await Promise.all(sar.map(entry => read(`${format}/${mode}/${entry.trigPath.replace(/\.trig$/, '.' + format)}`)));
      assert.equal(outputs[0], outputs[1], format);
    }
  }
});
