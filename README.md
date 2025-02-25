#ism2rdf
Information Security Markings XML (.xsd) to RDF (.jsonld)

# https://eulersharp.sourceforge.net/2003/03swap/countries.html
# https://www.loc.gov/standards/mads/rdf/mads2skos-20101119.ttl
# https://www.loc.gov/catworkshop/courses/metadatastandards/pdf/MSATraineeManual.pdf (skos:notation)
# https://credreg.net/ctdl/handbook


<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
	xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:owl="http://www.w3.org/2002/07/owl#">
  <owl:Ontology>
    <owl:imports>
      <owl:Ontology rdf:about="file:/C:/projects/ism2rdf/transformed/schemas/ISM/CVEGenerated/CVEnumISMClassificationAll.rdf"/>
    </owl:imports>
    <owl:imports>
      <owl:Ontology rdf:about="file:/C:/projects/ism2rdf/transformed/schemas/ISM/CVEGenerated/CVEnumISM25X.rdf"/>
    </owl:imports>
    <owl:imports>
      <owl:Ontology rdf:about="file:/C:/projects/ism2rdf/transformed/schemas/ISM/CVEGenerated/CVEnumISMatomicEnergyMarkings.rdf"/>
    </owl:imports>
    <owl:imports>
      <owl:Ontology rdf:about="file:/C:/projects/ism2rdf/transformed/schemas/ISM/CVEGenerated/CVEnumISMCompliesWith.rdf"/>
    </owl:imports>
  </owl:Ontology>
</rdf:RDF>

dirname = ".ciartifacts\\schemas\\ISMCAT"
importPath = ".ciartifacts\\schemas\\ISM\\IC-ARH.xsd"