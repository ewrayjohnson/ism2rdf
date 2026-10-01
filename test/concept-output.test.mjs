import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Parser } from 'n3';
import jsonld from 'jsonld';
import { artifact, isConceptText, readOutput, schemaEntries, skos, structuralSignature } from './concept-output-signature.mjs';

const textSignature = quads => [...new Set(quads.filter(isConceptText).map(q =>
  JSON.stringify([q.subject.value, q.predicate.value, q.object.value, q.object.language])))].sort();

test('all schema identities, notation, scheme memberships and enumeration lists match the pre-change baseline', async () => {
  // Captured from all 88 schema artifacts before the label change, including IC-EDH.
  assert.equal(await structuralSignature(), 'bcdb4f30be5eeebe283a5d763f6c007ab125a30ba21e7d992db81899046d1f43');
});

test('every generated schema format retains identical concept text and language tags', async () => {
  for (const entry of await schemaEntries()) {
    const nt = new Parser({ format: 'N-Triples' }).parse(await readOutput(artifact(entry, 'nt')));
    const expected = textSignature(nt);
    const languages = new Set();
    for (const label of nt.filter(q => q.predicate.value === skos + 'prefLabel')) {
      const key = JSON.stringify([label.subject.value, label.object.language]);
      assert.ok(!languages.has(key), 'At most one preferred label per language: ' + key);
      languages.add(key);
    }
    for (const [format, syntax] of [['ttl', 'Turtle'], ['trig', 'TriG']]) {
      const text = await readOutput(artifact(entry, format));
      assert.deepEqual(textSignature(new Parser({ format: syntax }).parse(text)), expected, artifact(entry, format));
      if (format === 'trig') {
        const tdf = JSON.parse(await readOutput(`trig/${entry.mode}/${entry.tdfPath}`));
        assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), text);
      }
    }
    const doc = JSON.parse(await readOutput(artifact(entry, 'jsonld')));
    const nquads = await jsonld.toRDF(doc, { format: 'application/n-quads' });
    assert.deepEqual(textSignature(new Parser({ format: 'N-Quads' }).parse(nquads)), expected, artifact(entry, 'jsonld'));
  }
});

test('outputs use curated attribute labels, retain concise names and report OPSEC without inventing a name', async () => {
  const data = JSON.parse(await readOutput('jsonld/convenience/Schema/IC-EDH/IC-EDH.jsonld'));
  const graph = new Map(data['@graph'].map(node => [node['@id'], node]));
  const opsec = graph.get('ismcuibasic:OPSEC');
  assert.equal(opsec['skos:notation'], 'OPSEC');
  assert.equal(opsec['skos:prefLabel'], undefined);
  assert.equal(data['@context']['@language'], undefined);
  for (const name of ['prefLabel', 'definition']) {
    assert.deepEqual(data['@context'][`skos:${name}`], { '@id': skos + name, '@language': 'en' });
  }
  assert.match(opsec['skos:definition'], /^Critical information determined/);
  assert.match(opsec['skos:definition'], /CUI Senior Agency Official\.$/);
  const attributes = JSON.parse(await readOutput('jsonld/standalone/Schema/ISM/CVEGenerated/CVEnumISMAttributes.jsonld'));
  const attrs = attributes['@graph'].find(node => node['skos:notation'] === 'cuiControlledByOffice');
  assert.equal(attrs['skos:prefLabel'], 'CUI Controlled By Office');
  assert.match(attrs['skos:definition'], /Ref DOD INSTRUCTION 5200.48\.$/);
  assert.deepEqual(attributes['@graph'].find(node => node['skos:notation'] === 'cuiBasic')['skos:prefLabel'],
    'CUI Basic');
  const report = JSON.parse(await readOutput('concept-label-report.json'));
  const gap = report.find(entry => entry.namespace === 'urn:us:gov:ic:cvenum:ism:cuibasic' && entry.notation === 'OPSEC');
  assert.deepEqual(gap.missingLanguages, ['en']);
  assert.ok(gap.decisions.some(item => item.reason === 'explanatory-prose'));
  assert.ok(report.some(entry => entry.labels.some(label => label.value === 'RISK SENSITIVE')));
});

test('multilingual source names and definitions survive the complete generator and all serializers', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = path.resolve(root, 'out');
  const fixture = await mkdtemp(path.join(output, 'concept-language-test-'));
  try {
    for (const name of ['index.js', 'uri-mapping.js', 'membership-map.js', 'concept-labels.js']) {
      await copyFile(path.join(root, 'dist', name), path.join(fixture, name));
    }
    await writeFile(path.join(fixture, 'package.json'), '{"type":"module"}');
    for (const dir of ['Schema', 'Schematron', 'config']) await mkdir(path.join(fixture, '.ciartifacts', dir), { recursive: true });
    await copyFile(path.join(root, '.ciartifacts/config/defaultPrefixes.json'), path.join(fixture, '.ciartifacts/config/defaultPrefixes.json'));
    await writeFile(path.join(fixture, '.ciartifacts/config/cco-marking-bridge.jsonld'), '{"@context":{}}');
    await writeFile(path.join(fixture, '.ciartifacts/Schema/Example.xsd'), `<s:schema xmlns:s="http://www.w3.org/2001/XMLSchema"
      xmlns:ex="urn:us:gov:ic:example" xmlns:skos="http://www.w3.org/2004/02/skos/core#" targetNamespace="urn:us:gov:ic:example" xml:lang="en">
      <s:simpleType name="Values"><s:annotation><s:documentation>Example vocabulary</s:documentation></s:annotation>
      <s:restriction base="s:token"><s:enumeration value="A"><s:annotation>
      <s:documentation>This is the full English definition.</s:documentation>
      <s:documentation xml:lang="fr">Ceci est la définition française complète.</s:documentation>
      <s:appinfo><skos:prefLabel>Office</skos:prefLabel><skos:prefLabel xml:lang="fr">Bureau</skos:prefLabel></s:appinfo>
      </s:annotation></s:enumeration><s:enumeration value="B"><s:annotation>
      <s:documentation xml:lang="">Untagged Name</s:documentation>
      </s:annotation></s:enumeration></s:restriction></s:simpleType></s:schema>`);
    execFileSync(process.execPath, [path.join(fixture, 'index.js')], { cwd: fixture, stdio: 'pipe' });
    for (const mode of ['standalone', 'convenience']) {
      const file = format => path.join(fixture, `out/${format}/${mode}/Schema/Example.${format}`);
      const nt = new Parser({ format: 'N-Triples' }).parse(await readFile(file('nt'), 'utf8'));
      assert.equal(nt.filter(q => q.predicate.value === skos + 'prefLabel').length, 3);
      assert.equal(nt.filter(q => q.predicate.value === skos + 'definition').length, 2);
      assert.deepEqual(nt.filter(isConceptText).map(q => q.object.language).sort(), ['', 'en', 'en', 'fr', 'fr']);
      for (const [format, syntax] of [['ttl', 'Turtle'], ['trig', 'TriG']]) {
        assert.deepEqual(textSignature(new Parser({ format: syntax }).parse(await readFile(file(format), 'utf8'))), textSignature(nt));
      }
      const doc = JSON.parse(await readFile(file('jsonld'), 'utf8'));
      const concept = doc['@graph'].find(node => node['skos:notation'] === 'A');
      assert.equal(concept['skos:prefLabel'], 'Office');
      assert.ok(Object.values(concept).flat().some(value => value['@language'] === 'fr' && value['@value'] === 'Bureau'));
      const expanded = new Parser({ format: 'N-Quads' }).parse(await jsonld.toRDF(doc, { format: 'application/n-quads' }));
      assert.ok(expanded.filter(q => q.predicate.value === skos + 'notation').every(q => q.object.language === ''));
      assert.deepEqual(textSignature(new Parser({ format: 'N-Quads' }).parse(await jsonld.toRDF(doc, { format: 'application/n-quads' }))), textSignature(nt));
      const tdf = JSON.parse(await readFile(file('trig').replace(/\.trig$/, '.tdf'), 'utf8'));
      assert.equal(Buffer.from(tdf.payloadBase64, 'base64').toString('utf8'), await readFile(file('trig'), 'utf8'));
    }
  } finally {
    assert.ok(path.resolve(fixture).startsWith(output + path.sep));
    await rm(fixture, { recursive: true, force: true });
  }
});
