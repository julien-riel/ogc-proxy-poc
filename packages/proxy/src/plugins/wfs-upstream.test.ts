import { describe, it, expect } from 'vitest';
import { buildWfsGetFeatureUrl } from './wfs-upstream.js';

describe('wfs-upstream plugin', () => {
  describe('buildWfsGetFeatureUrl', () => {
    const baseUrl = 'https://pavics.ouranos.ca/geoserver/wfs';
    const typeName = 'public:quebec_mrc_boundaries';

    it('builds basic GetFeature URL', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
      });
      expect(url).toContain('service=WFS');
      expect(url).toContain('request=GetFeature');
      expect(url).toContain('typeName=public%3Aquebec_mrc_boundaries');
      expect(url).toContain('startIndex=0');
      expect(url).toContain('maxFeatures=10');
      expect(url).toContain('outputFormat=application%2Fjson');
    });

    it('includes sortBy when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        sortBy: 'NOM_MRC',
      });
      expect(url).toContain('sortBy=NOM_MRC');
    });

    it('includes CQL_FILTER when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        cqlFilter: "NOM_MRC='Acton'",
      });
      expect(url).toContain('CQL_FILTER=');
    });

    it('includes BBOX when provided', () => {
      const url = buildWfsGetFeatureUrl(baseUrl, typeName, {
        startIndex: 0,
        count: 10,
        version: '1.1.0',
        bbox: [-73.6, 45.4, -73.5, 45.5],
      });
      expect(url).toContain('BBOX=');
    });
  });
});
