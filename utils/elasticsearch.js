/**
 * Elasticsearch-compatible search layer for TubeStream (10k+ videos)
 * USE_ES_URL=http://localhost:9200 → Real Elasticsearch  
 * Otherwise → In-memory inverted index + BM25 scoring + facets
 */
const { Client } = require('@elastic/elasticsearch');

class TubeStreamSearch {
    constructor()
