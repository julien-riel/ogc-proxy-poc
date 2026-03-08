import { getRegistry } from '../engine/registry.js';

/**
 * Builds an OpenAPI 3.0 spec from the registry configuration.
 */
export function buildOpenApiSpec(baseUrl: string): Record<string, unknown> {
  const registry = getRegistry();
  const collectionIds = Object.keys(registry.collections);

  const collectionPaths: Record<string, unknown> = {};
  for (const id of collectionIds) {
    collectionPaths[`/collections/${id}/items`] = {
      get: {
        summary: `Get features from ${id}`,
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'offset', in: 'query', schema: { type: 'integer', default: 0 } },
          { name: 'bbox', in: 'query', schema: { type: 'string' } },
          { name: 'filter', in: 'query', schema: { type: 'string' } },
          { name: 'filter-lang', in: 'query', schema: { type: 'string', enum: ['cql2-text'] } },
        ],
        responses: {
          '200': { description: 'GeoJSON FeatureCollection' },
          '400': { description: 'Invalid request' },
          '404': { description: 'Collection not found' },
        },
      },
    };
    collectionPaths[`/collections/${id}/items/{featureId}`] = {
      get: {
        summary: `Get a single feature from ${id}`,
        parameters: [{ name: 'featureId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'GeoJSON Feature' },
          '404': { description: 'Feature not found' },
        },
      },
    };
  }

  return {
    openapi: '3.0.0',
    info: { title: 'OGC Proxy Municipal', version: '0.1.0', description: 'Interface GIS commune aux APIs maison' },
    servers: [{ url: baseUrl }],
    paths: {
      '/': {
        get: { summary: 'Landing page', responses: { '200': { description: 'Landing page' } } },
      },
      '/conformance': {
        get: { summary: 'Conformance classes', responses: { '200': { description: 'Conformance declaration' } } },
      },
      '/collections': {
        get: { summary: 'List collections', responses: { '200': { description: 'Collections list' } } },
      },
      ...collectionPaths,
    },
  };
}
