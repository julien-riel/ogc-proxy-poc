import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getCollection: vi.fn(),
}));

vi.mock('../utils/base-url.js', () => ({
  getBaseUrl: vi.fn().mockReturnValue('http://localhost:3000/ogc'),
}));

import { getQueryables } from './queryables.js';
import { getCollection } from '../engine/registry.js';

function mockReqRes(collectionId: string) {
  const req = { params: { collectionId } } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res };
}

describe('getQueryables', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 404 when collection not found', () => {
    vi.mocked(getCollection).mockReturnValue(undefined);
    const { req, res } = mockReqRes('nonexistent');
    getQueryables(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'NotFound' }));
  });

  it('returns queryable properties for a valid collection', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Bornes-fontaines',
      upstream: {} as any,
      geometry: { type: 'Point', xField: 'x', yField: 'y' },
      idField: 'id',
      properties: [
        { name: 'etat', type: 'string', filterable: true, sortable: true },
        { name: 'arrondissement', type: 'string', filterable: true },
        { name: 'internal_id', type: 'int', filterable: false },
      ],
    } as any);
    const { req, res } = mockReqRes('bornes-fontaines');
    getQueryables(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'Bornes-fontaines',
        properties: expect.objectContaining({
          etat: { type: 'string', 'x-ogc-sortable': true },
          arrondissement: { type: 'string' },
          geometry: { $ref: 'https://geojson.org/schema/Point.json' },
        }),
      }),
    );
    const calledProps = res.json.mock.calls[0][0].properties;
    expect(calledProps.internal_id).toBeUndefined();
  });

  it('maps property types correctly', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Test',
      upstream: {} as any,
      geometry: { type: 'Polygon', wktField: 'wkt' },
      idField: 'id',
      properties: [
        { name: 'count', type: 'int', filterable: true },
        { name: 'value', type: 'double', filterable: true },
        { name: 'active', type: 'boolean', filterable: true },
        { name: 'unknown_type', type: 'custom', filterable: true },
      ],
    } as any);
    const { req, res } = mockReqRes('test');
    getQueryables(req, res);
    const props = res.json.mock.calls[0][0].properties;
    expect(props.count.type).toBe('integer');
    expect(props.value.type).toBe('number');
    expect(props.active.type).toBe('boolean');
    expect(props.unknown_type.type).toBe('string');
    expect(props.geometry.$ref).toBe('https://geojson.org/schema/Polygon.json');
  });

  it('uses LineString geometry ref', () => {
    vi.mocked(getCollection).mockReturnValue({
      title: 'Test',
      upstream: {} as any,
      geometry: { type: 'LineString', coordsField: 'coords' },
      idField: 'id',
      properties: [],
    } as any);
    const { req, res } = mockReqRes('test');
    getQueryables(req, res);
    const props = res.json.mock.calls[0][0].properties;
    expect(props.geometry.$ref).toBe('https://geojson.org/schema/LineString.json');
  });
});
