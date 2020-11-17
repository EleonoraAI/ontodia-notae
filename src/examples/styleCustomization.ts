import { createElement, ClassAttributes } from 'react';
import * as ReactDOM from 'react-dom';

import { Workspace, WorkspaceProps, SparqlDataProvider, LinkTemplate, makeSerializedDiagram, Halo, ElementLayer} from '../index';

import { onPageLoad, tryLoadLayoutFromLocalStorage, saveLayoutToLocalStorage } from './common';

import {
    CompositeDataProvider,
    SparqlQueryMethod,
    OWLRDFSSettings
 } from '../index';

import { OWLStatsSettings, DBPediaSettings  } from '../ontodia/data/sparql/sparqlDataProviderSettings';

import { ExampleMetadataApi, ExampleValidationApi } from './resources/exampleMetadataApi';
import { isRdfIri } from '../ontodia/data/sparql/sparqlModels';
import { LINK_SHOW_IRI } from '../ontodia/customization/defaultLinkStyles';
import { IriClickIntent } from '../ontodia/diagram/view';
import { HaloLink } from '../ontodia/widgets/haloLink';
import { LABEL_URIS } from '../ontodia/data/rdf/rdfCacheableStore';
import { getUriLocalName } from '../ontodia/data/utils';
import { elementInfo } from '../ontodia/data/sparql/blankNodes';
import { Element } from '../ontodia/diagram/elements';
import { emptyElementInfo } from '../ontodia/data/sparql/responseHandler';


const certificateIcon = require<string>('../../images/font-awesome/certificate-solid.svg');
const cogIcon = require<string>('../../images/font-awesome/cog-solid.svg');

const CUSTOM_LINK_TEMPLATE: LinkTemplate = {
    markerSource: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'M0,3a3,3 0 1,0 6,0a3,3 0 1,0 -6,0',
        width: 6,
        height: 6,
    },
    markerTarget: {
        fill: '#4b4a67',
        stroke: '#4b4a67',
        d: 'm 20,5.88 -10.3,-5.95 0,5.6 -9.7,-5.6 0,11.82 9.7,-5.53 0,5.6 z',
        width: 20,
        height: 12,
    },
    renderLink: () => ({
        connection: {
            stroke: '#3c4260',
            'stroke-width': 2,
        },
        connector: {name: 'rounded'},
        label: {
            attrs: {text: {fill: '#3c4260'}},
        },
    }),
};

// console.log(Halo{IRI_element})

function onWorkspaceMounted(workspace: Workspace) {
    if (!workspace) { return; }
    
    const diagram = tryLoadLayoutFromLocalStorage();
    workspace.getModel().importLayout({
        diagram,
        validateLinks: true,
          
        dataProvider: new CompositeDataProvider([

            new SparqlDataProvider(
                {
                endpointUrl: 'http://localhost:9999/blazegraph/namespace/kb/sparql',
                imagePropertyUris: [
                    'http://xmlns.com/foaf/0.1/img',
                ],
                // queryMethod: SparqlQueryMethod.POST
                }, 
                {...OWLRDFSSettings, ...{
                    fullTextSearch: {
                        prefix: 'PREFIX bds: <http://www.bigdata.com/rdf/search#>' + '\n',
                        queryPattern: `
                    ?inst rdfs:label ?searchLabel.
                    SERVICE bds:search {
                            ?searchLabel bds:search "\${text}*" ;
                            bds:minRelevance '0.4' ;
                            bds:matchAllTerms 'true';
                            bds:relevance ?score;
                            bds:rank ?rank .
                    }
                    `
                    },
                    elementInfoQuery: `
                    CONSTRUCT {
                        ?inst rdf:type ?class;
                            rdfs:label ?label;
                            ?propType ?propValue.
                    }
                    WHERE {
                        OPTIONAL {?inst rdf:type ?class . }
                        OPTIONAL {?inst \${dataLabelProperty} ?label}
                        OPTIONAL {?inst ?propType ?propValue.
                        FILTER (isLiteral(?propValue)) }
                        VALUES ?labelProp { rdfs:label foaf:name }
                    } VALUES (?inst) {\${ids}}
                    `
                    ,}
                }   
            ),
      
            new SparqlDataProvider(
                {
                  endpointUrl: "http://dbpedia.org/sparql",
                  imagePropertyUris: [
                    "http://xmlns.com/foaf/0.1/depiction",
                    "http://xmlns.com/foaf/0.1/img"
                  ],
                  queryMethod: SparqlQueryMethod.GET
                },
                // DBPediaSettings
                // ?searchLabel bif:contains "\${text}".
                {...DBPediaSettings, ...{
                  fullTextSearch: {
                    prefix: 'PREFIX dbo: <http://dbpedia.org/ontology/>\n',
                    queryPattern: `
                          ?inst rdfs:label ?searchLabel.
                          ?searchLabel bif:contains "\${text}".
                          ?inst dbo:wikiPageID ?origScore .
                          BIND(0-?origScore as ?score)
                    `,
                  },
        
                  // extractLabel: true,
        
                  classTreeQuery: `
                    SELECT distinct ?class ?label ?parent WHERE {
                    ?class rdfs:label ?label.
                    OPTIONAL {?class rdfs:subClassOf ?parent}
                    ?root rdfs:subClassOf owl:Thing.
                    ?class rdfs:subClassOf? | rdfs:subClassOf/rdfs:subClassOf ?root
                     }
        
                    `,
                  
                  elementInfoQuery: `
                      CONSTRUCT {
                          ?inst rdf:type ?class .
                          ?inst rdfs:label ?label .
                          ?inst ?propType ?propValue.
                      } WHERE {
                          VALUES (?inst) {\${ids}}
                          ?inst rdf:type ?class .
                          ?inst rdfs:label ?label .
                          FILTER (!contains(str(?class), 'http://dbpedia.org/class/yago'))
                          OPTIONAL {?inst ?propType ?propValue.
                          FILTER (isLiteral(?propValue)) }
                      }
                      
                  `,
        
                  filterElementInfoPattern: `
                      OPTIONAL {?inst rdf:type ?foundClass. FILTER (!contains(str(?foundClass), 'http://dbpedia.org/class/yago'))}
                      BIND (coalesce(?foundClass, owl:Thing) as ?class)
                      OPTIONAL {?inst \${dataLabelProperty} ?label}
                      `,
        
                  imageQueryPattern: ` { ?inst ?linkType ?fullImage } UNION { [] ?linkType ?inst. BIND(?inst as ?fullImage) }
                          BIND(CONCAT("https://commons.wikimedia.org/w/thumb.php?f=",
                          STRAFTER(STR(?fullImage), "Special:FilePath/"), "&w=200") AS ?image)
                  `,
                 
                }}   
              ),


          ],
          {mergeMode: 'fetchAll'}
          ),
    });
}

const props: WorkspaceProps & ClassAttributes<Workspace> = {
    ref: onWorkspaceMounted,
    languages: [
        {code: 'en', label: 'English'},
        {code: 'it', label: 'Italian'},
        {code: 'ru', label: 'Russian'},
    ],
    language: 'it',
    onSaveDiagram: workspace => {
        const diagram = workspace.getModel().exportLayout();
        window.location.hash = saveLayoutToLocalStorage(diagram);
        window.location.reload();
    },
    // metadataApi: new ExampleMetadataApi(),
    // validationApi: new ExampleValidationApi(),
    viewOptions: {
        onIriClick: ({iri}) => window.open(iri),
        groupBy: [
            {linkType: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type', linkDirection: 'out'},
        ],
    },
    typeStyleResolver: types => {
        if (types.indexOf('http://www.w3.org/2000/01/rdf-schema#Class') !== -1) {
            return {icon: certificateIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#Class') !== -1) {
            return {icon: certificateIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#ObjectProperty') !== -1) {
            return {icon: cogIcon};
        } else if (types.indexOf('http://www.w3.org/2002/07/owl#DatatypeProperty') !== -1) {
            return {color: '#046380'};
        } else {
            return undefined;
        }
    },
    linkTemplateResolver: type => CUSTOM_LINK_TEMPLATE,
    
};



onPageLoad(container => ReactDOM.render(createElement(Workspace, props), container) );

