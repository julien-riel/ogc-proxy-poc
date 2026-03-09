import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../engine/registry.js', () => ({
  getCollection: vi.fn(),
}));

vi.mock('../engine/adapter.js', () => ({
  fetchUpstreamItems: vi.fn(),
}));

vi.mock('../engine/geojson-builder.js', () => ({
  buildFeatureSafe: vi.fn(),
}));

vi.mock('../engine/cql2/evaluator.js', () => ({
  evaluateFilter: vi.fn(),
}));

import { parseGetFeatureGet, parseGetFeaturePost, executeGetFeature } from './get-feature.js';
import { getCollection } from '../engine/registry.js';
import { fetchUpstreamItems } from '../engine/adapter.js';
import { buildFeatureSafe } from '../engine/geojson-builder.js';

describe('WFS GetFeature', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseGetFeatureGet', () => {
    it('parses basic query parameters', () => {
      const params = parseGetFeatureGet({
        typename: 'bornes-fontaines',
        maxfeatures: '50',
        startindex: '10',
        outputformat: 'application/json',
        resulttype: 'results',
        srsname: 'EPSG:4326',
      });
      expect(params.typeName).toBe('bornes-fontaines');
      expect(params.maxFeatures).toBe(50);
      expect(params.startIndex).toBe(10);
      expect(params.outputFormat).toBe('application/json');
      expect(params.resultType).toBe('results');
      expect(params.srsName).toBe('EPSG:4326');
    });

    it('uses defaults for missing parameters', () => {
      const params = parseGetFeatureGet({});
      expect(params.typeName).toBe('');
      expect(params.maxFeatures).toBe(10);
      expect(params.startIndex).toBe(0);
      expect(params.resultType).toBe('results');
    });

    it('accepts typenames (WFS 2.0 parameter)', () => {
      const params = parseGetFeatureGet({ typenames: 'my-type' });
      expect(params.typeName).toBe('my-type');
    });

    it('accepts count (WFS 2.0) over maxfeatures', () => {
      const params = parseGetFeatureGet({ count: '25' });
      expect(params.maxFeatures).toBe(25);
    });

    it('parses cql_filter into filterNode', () => {
      const params = parseGetFeatureGet({ cql_filter: "etat='actif'" });
      expect(params.cqlFilter).toBe("etat='actif'");
      expect(params.filterNode).toBeDefined();
      expect(params.filterNode!.type).toBe('comparison');
    });

    it('throws on CQL filter exceeding max length', () => {
      const longFilter = 'x'.repeat(4097);
      expect(() => parseGetFeatureGet({ cql_filter: longFilter })).toThrow('exceeds maximum length');
    });
  });

  describe('parseGetFeaturePost', () => {
    it('parses basic WFS GetFeature XML', () => {
      const xml = `
        <GetFeature maxFeatures="50" startIndex="10" outputFormat="application/json" resultType="results">
          <Query typeName="bornes-fontaines" srsName="EPSG:4326"/>
        </GetFeature>`;
      const params = parseGetFeaturePost(xml);
      expect(params.typeName).toBe('bornes-fontaines');
      expect(params.maxFeatures).toBe(50);
      expect(params.startIndex).toBe(10);
      expect(params.srsName).toBe('EPSG:4326');
    });

    it('extracts BBOX from Filter', () => {
      const xml = `
        <GetFeature maxFeatures="10">
          <Query typeName="test">
            <Filter>
              <BBOX>
                <Envelope>
                  <lowerCorner>-74 45</lowerCorner>
                  <upperCorner>-73 46</upperCorner>
                </Envelope>
              </BBOX>
            </Filter>
          </Query>
        </GetFeature>`;
      const params = parseGetFeaturePost(xml);
      expect(params.bbox).toEqual([-74, 45, -73, 46]);
    });

    it('uses defaults when attributes are missing', () => {
      const xml = '<GetFeature><Query/></GetFeature>';
      const params = parseGetFeaturePost(xml);
      expect(params.typeName).toBe('');
      expect(params.maxFeatures).toBe(10);
      expect(params.startIndex).toBe(0);
      expect(params.resultType).toBe('results');
    });
  });

  describe('executeGetFeature', () => {
    it('returns null when collection not found', async () => {
      vi.mocked(getCollection).mockReturnValue(undefined);
      const result = await executeGetFeature({
        typeName: 'nonexistent',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });
      expect(result).toBeNull();
    });

    it('returns hits-only response for resultType=hits', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({ items: [{ id: 1 }], total: 42 });
      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'hits',
        srsName: '',
      });
      expect(result).toMatchObject({
        type: 'FeatureCollection',
        totalFeatures: 42,
        numberMatched: 42,
        numberReturned: 0,
        features: [],
      });
    });

    it('returns features for resultType=results', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({
        items: [{ id: 1, x: -73.5, y: 45.5, name: 'A' }],
        total: 1,
      });
      vi.mocked(buildFeatureSafe).mockReturnValue({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-73.5, 45.5] },
        properties: { name: 'A' },
      } as any);
      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });
      expect(result!.type).toBe('FeatureCollection');
      expect(result!.features).toHaveLength(1);
      expect(result!.numberReturned).toBe(1);
    });

    it('reprojects to EPSG:3857 when requested', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({ items: [{ id: 1 }], total: 1 });
      vi.mocked(buildFeatureSafe).mockReturnValue({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      } as any);
      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: 'EPSG:3857',
      });
      const coords = (result!.features[0] as any).geometry.coordinates;
      expect(coords[0]).toBeCloseTo(0, 1);
      expect(coords[1]).toBeCloseTo(0, 1);
      expect(result!.crs.properties.name).toBe('urn:ogc:def:crs:EPSG::3857');
    });

    it('uses CRS84 URN by default', async () => {
      vi.mocked(getCollection).mockReturnValue({ title: 'Test' } as any);
      vi.mocked(fetchUpstreamItems).mockResolvedValue({ items: [], total: 0 });
      const result = await executeGetFeature({
        typeName: 'test',
        maxFeatures: 10,
        startIndex: 0,
        outputFormat: 'application/json',
        resultType: 'results',
        srsName: '',
      });
      expect(result!.crs.properties.name).toBe('urn:ogc:def:crs:OGC:1.3:CRS84');
    });
  });
});
