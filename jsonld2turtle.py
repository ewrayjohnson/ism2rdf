from rdflib import Graph, URIRef, Namespace
import os
import re

# Make sure rdflib is installed with "pip install rdflib"
# Run with "python3 json2turtle.py"

# Translate all the jsonld files below this directory into turtle in the same
# directory as the original was found.
# Add a constructed ontology IRI based on the pathname
# Declare skos:inScheme to be objectProperty
# Create an OWL file that imports them all + catalog for Protege
# Create a merged file.

owl = Namespace("http://www.w3.org/2002/07/owl#")
rdf = Namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#")
skos = Namespace("http://www.w3.org/2004/02/skos/core#")
imports = []
merged=Graph()

# Run at root of repository
def map_rdf_files(directory,suffix,f):
    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(suffix):
                path=os.path.join(root, file)
                f(os.path.dirname(path), os.path.splitext(os.path.basename(path))[0])

# Add the ontology IRI and replace the declaration of inScheme
def do_fixups(graph,ontology_iri):
    if (len(graph)>0): # Skip if the graph is empty
        graph.remove((skos.inScheme,rdf.type,owl.AnnotationProperty))
        graph.add((skos.inScheme,rdf.type,owl.ObjectProperty))
        graph.add((URIRef(ontology_iri),rdf.type,owl.Ontology))

# parse a json ld file
def read_jsonld(dirname,basename):
    g = Graph()
    result = g.parse(dirname+"/"+basename+".jsonld", format='json-ld')
    return(result)

# Construct an ontology IRI based on the path
def ontology_iri_from_path(dirname,basename):
    prefix_len=len("transformed/schemas/")
    return("urn:us:gov:ic:"+re.sub("/",":",dirname[prefix_len:])+":"+basename)

# convert to turtle, do fixups, and write to file
def convert_to_turtle(dirname, basename):
    g=read_jsonld(dirname,basename)
    dest = dirname+"/"+basename+".ttl"
    ontology_iri = ontology_iri_from_path(dirname,basename)
    if len(g)>0:
        imports.append([ontology_iri,dirname,basename])
    do_fixups(g,ontology_iri);
    for s,p,o in g:
        if o != owl.Ontology:
            merged.add((s,p,o))
    serialized=g.serialize(format="turtle",destination=dest)
    print(dest)

# write a file to import all the ontologies
def write_imports():
    with open('ism-all.ttl','w') as file:
        file.write("<http://ontology.mil/ism/ism.owl> owl:imports\n")
        for iri,dirname,basename in imports[:-1]:
            file.write("<"+iri+">,\n")
        file.write("<"+imports[-1][0]+">.\n")    

# write the catalog file for protege
def write_catalog():
    with open('catalog-v001.xml','w') as file:
        file.write('<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n')
        file.write('<catalog prefer="public" xmlns="urn:oasis:names:tc:entity:xmlns:xml:catalog">\n')
        for iri,dirname,basename in imports:
            file.write('  <uri id="User Entered Import Resolution" name="' + iri + '" ' + 'uri="' + dirname + '/' + basename + '.ttl"/>\n')
        file.write('</catalog>\n')

# write the merged file
def write_merged():
    merged.add((URIRef("http://ontology.mil/ism.owl"),rdf.type,owl.Ontology))
    merged.serialize(format="turtle",destination="ism-merged.ttl")


# Do it for all the files
def convert_all():
    map_rdf_files("./",".jsonld",convert_to_turtle)
    write_imports()
    write_catalog()
    write_merged()
    
# Do it
convert_all()




