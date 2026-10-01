import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyDocumentation, facetKey, readConceptAnnotations, resolveConceptLabels, validateLabelConfig } from '../dist/concept-labels.js';

const namespace = 'urn:example:attributes';
const config = validateLabelConfig({ propertyLabelVocabularies: [{ namespace, language: 'en' }], reviewed: [] });
const resolve = (documentation, names = [], ns = namespace, notation = 'TEST', options = config) =>
  resolveConceptLabels(ns, notation, { documentation, names }, options, { cuiControlledByOffice: 'CUI Controlled By Office' });
const en = value => ({ value, language: 'en' });

test('concise names retain supplied wording, including a trailing period', () => {
  for (const value of ['RISK SENSITIVE', 'CUI Basic markings.', 'Group and Individual']) {
    assert.deepEqual(resolve([en(value)]).labels, [en(value)]);
  }
});

test('definitions are never truncated, even when brief; absent names are reported', () => {
  const prose = 'Critical information determined to give evidence of the planning and execution of sensitive government activities. This process identifies unclassified information that must be protected.';
  for (const value of [prose, 'Identifies who approved release.', 'Ref DOD INSTRUCTION 5200.48.']) {
    const result = resolve([en(value)]);
    assert.deepEqual(result.labels, []);
    assert.deepEqual(result.definitions, [en(value)]);
    assert.deepEqual(result.missingLanguages, ['en']);
  }
  assert.equal(classifyDocumentation('Unusual '.repeat(20).trim()).kind, 'ambiguous');
  assert.deepEqual(resolve([]).missingLanguages, ['']);
});

test('existing property labels apply only to explicitly configured vocabularies', () => {
  const docs = [en('Office in an agency or department that is responsible for labeling and controlling information as CUI. Ref DOD INSTRUCTION 5200.48.')];
  assert.deepEqual(resolve(docs, [], namespace, 'cuiControlledByOffice').labels, [en('CUI Controlled By Office')]);
  assert.deepEqual(resolve(docs, [], namespace, 'cuiControlledByOffice').definitions, docs);
  assert.deepEqual(resolve(docs, [], 'urn:example:unrelated', 'cuiControlledByOffice').labels, []);
});

test('reviewed names carry provenance and explicit source names take precedence per language', () => {
  const reviewed = { propertyLabelVocabularies: [], reviewed: [{ namespace, notation: 'TEST', labels: [en('Reviewed')], source: 'Approved vocabulary release' }] };
  assert.deepEqual(resolve([], [], namespace, 'TEST', reviewed).labels, [en('Reviewed')]);
  assert.deepEqual(resolve([], [en('Source')], namespace, 'TEST', reviewed).labels, [en('Source')]);
  assert.throws(() => validateLabelConfig({ ...reviewed, reviewed: [{ ...reviewed.reviewed[0], source: '' }] }), /provenance/);
});

test('conflicting labels are reported instead of selecting arbitrarily', () => {
  const result = resolve([en('First Name'), en('Second Name')]);
  assert.deepEqual(result.labels, []);
  assert.equal(result.definitions.length, 2);
  assert.ok(result.decisions.some(item => item.reason === 'conflicting-names-in-language'));
});

test('ordered XML extraction preserves inline text, paragraphs, language inheritance and resets', async () => {
  const annotations = await readConceptAnnotations(`<s:schema xmlns:s="http://www.w3.org/2001/XMLSchema"
    xmlns:h="http://www.w3.org/1999/xhtml" xmlns:k="http://www.w3.org/2004/02/skos/core#" xml:lang="en">
    <s:simpleType name="Values"><s:union><s:simpleType><s:restriction base="s:token">
    <s:enumeration value="X"><s:annotation><s:documentation><h:p>This is <h:em>complete</h:em> text.</h:p><h:p>Second paragraph.</h:p></s:documentation>
    <s:documentation xml:lang="fr">Information qui décrit le concept.</s:documentation>
    <s:documentation xml:lang="">Untagged definition that remains untagged.</s:documentation>
    <s:appinfo><k:prefLabel>Office</k:prefLabel><k:prefLabel xml:lang="fr">Bureau</k:prefLabel></s:appinfo>
    </s:annotation></s:enumeration>
    <s:pattern value="[A-Z]+"><s:annotation xml:lang="de"><s:documentation>Kurzname</s:documentation></s:annotation></s:pattern>
    </s:restriction></s:simpleType></s:union></s:simpleType></s:schema>`);
  const entry = annotations.get(facetKey('Values', 'enumeration', 'X'));
  assert.deepEqual(entry.documentation, [en('This is complete text. Second paragraph.'),
    { value: 'Information qui décrit le concept.', language: 'fr' },
    { value: 'Untagged definition that remains untagged.', language: '' }]);
  const result = resolve(entry.documentation, entry.names);
  assert.deepEqual(result.labels, [en('Office'), { value: 'Bureau', language: 'fr' }]);
  assert.deepEqual(result.definitions, entry.documentation);
  assert.deepEqual(annotations.get(facetKey('Values', 'pattern', '[A-Z]+')).documentation,
    [{ value: 'Kurzname', language: 'de' }]);
});

test('adjacent inline elements retain separating whitespace and child language overrides', async () => {
  const annotations = await readConceptAnnotations(`<schema xmlns="http://www.w3.org/2001/XMLSchema"
    xmlns:h="http://www.w3.org/1999/xhtml" xml:lang="en"><simpleType name="Values"><restriction base="string">
    <enumeration value="X"><annotation><documentation><h:span>First</h:span> <h:span>Name</h:span></documentation>
    <documentation><h:p xml:lang="fr">Nom français</h:p><h:p xml:lang="de">Deutscher Name</h:p></documentation>
    </annotation></enumeration></restriction></simpleType></schema>`);
  assert.deepEqual(annotations.get(facetKey('Values', 'enumeration', 'X')).documentation,
    [en('First Name'), { value: 'Nom français', language: 'fr' }, { value: 'Deutscher Name', language: 'de' }]);
});
