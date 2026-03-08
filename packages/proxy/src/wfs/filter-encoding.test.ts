import { describe, it, expect } from 'vitest';
import { parseFilterXml } from './filter-encoding.js';

describe('parseFilterXml', () => {
  describe('edge cases', () => {
    it('returns null for null input', () => {
      expect(parseFilterXml(null as unknown as Record<string, unknown>)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(parseFilterXml('string' as unknown as Record<string, unknown>)).toBeNull();
    });

    it('returns null for unknown operator', () => {
      expect(parseFilterXml({ UnknownOp: { PropertyName: 'x', Literal: 1 } })).toBeNull();
    });
  });

  describe('comparison operators', () => {
    it('parses PropertyIsEqualTo', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { PropertyName: 'status', Literal: 'active' },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'status',
        operator: '=',
        value: 'active',
      });
    });

    it('parses PropertyIsNotEqualTo', () => {
      const result = parseFilterXml({
        PropertyIsNotEqualTo: { PropertyName: 'status', Literal: 'deleted' },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'status',
        operator: '<>',
        value: 'deleted',
      });
    });

    it('parses PropertyIsLessThan', () => {
      const result = parseFilterXml({
        PropertyIsLessThan: { PropertyName: 'age', Literal: 18 },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'age',
        operator: '<',
        value: 18,
      });
    });

    it('parses PropertyIsGreaterThan', () => {
      const result = parseFilterXml({
        PropertyIsGreaterThan: { PropertyName: 'population', Literal: '50000' },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'population',
        operator: '>',
        value: 50000,
      });
    });

    it('parses PropertyIsLessThanOrEqualTo', () => {
      const result = parseFilterXml({
        PropertyIsLessThanOrEqualTo: { PropertyName: 'score', Literal: 100 },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'score',
        operator: '<=',
        value: 100,
      });
    });

    it('parses PropertyIsGreaterThanOrEqualTo', () => {
      const result = parseFilterXml({
        PropertyIsGreaterThanOrEqualTo: { PropertyName: 'score', Literal: 0 },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'score',
        operator: '>=',
        value: 0,
      });
    });

    it('uses ValueReference when PropertyName is absent', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { ValueReference: 'status', Literal: 'active' },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'status',
        operator: '=',
        value: 'active',
      });
    });
  });

  describe('literal coercion', () => {
    it('coerces numeric string to number', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { PropertyName: 'code', Literal: '42' },
      });
      expect(result).toEqual(expect.objectContaining({ value: 42 }));
    });

    it('keeps non-numeric string as string', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { PropertyName: 'name', Literal: 'hello' },
      });
      expect(result).toEqual(expect.objectContaining({ value: 'hello' }));
    });

    it('preserves native number literal', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { PropertyName: 'val', Literal: 3.14 },
      });
      expect(result).toEqual(expect.objectContaining({ value: 3.14 }));
    });

    it('coerces negative numeric string to number', () => {
      const result = parseFilterXml({
        PropertyIsEqualTo: { PropertyName: 'temp', Literal: '-5' },
      });
      expect(result).toEqual(expect.objectContaining({ value: -5 }));
    });
  });

  describe('PropertyIsLike', () => {
    it('converts default wildcards to CQL2 pattern', () => {
      const result = parseFilterXml({
        PropertyIsLike: {
          PropertyName: 'name',
          Literal: '*Rose?',
          '@_wildCard': '*',
          '@_singleChar': '?',
        },
      });
      expect(result).toEqual({
        type: 'like',
        property: 'name',
        pattern: '%Rose_',
      });
    });

    it('leaves pattern unchanged when wildcards are already CQL2 style', () => {
      const result = parseFilterXml({
        PropertyIsLike: {
          PropertyName: 'name',
          Literal: '%Rose_',
          '@_wildCard': '%',
          '@_singleChar': '_',
        },
      });
      expect(result).toEqual({
        type: 'like',
        property: 'name',
        pattern: '%Rose_',
      });
    });

    it('uses default wildcards when attributes are missing', () => {
      const result = parseFilterXml({
        PropertyIsLike: {
          PropertyName: 'name',
          Literal: '*test?',
        },
      });
      expect(result).toEqual({
        type: 'like',
        property: 'name',
        pattern: '%test_',
      });
    });
  });

  describe('PropertyIsBetween', () => {
    it('parses between with numeric boundaries', () => {
      const result = parseFilterXml({
        PropertyIsBetween: {
          PropertyName: 'age',
          LowerBoundary: { Literal: '18' },
          UpperBoundary: { Literal: '65' },
        },
      });
      expect(result).toEqual({
        type: 'between',
        property: 'age',
        low: 18,
        high: 65,
      });
    });

    it('parses between with string boundaries', () => {
      const result = parseFilterXml({
        PropertyIsBetween: {
          PropertyName: 'category',
          LowerBoundary: { Literal: 'A' },
          UpperBoundary: { Literal: 'M' },
        },
      });
      expect(result).toEqual({
        type: 'between',
        property: 'category',
        low: 'A',
        high: 'M',
      });
    });
  });

  describe('PropertyIsNull', () => {
    it('parses isNull node', () => {
      const result = parseFilterXml({
        PropertyIsNull: { PropertyName: 'description' },
      });
      expect(result).toEqual({
        type: 'isNull',
        property: 'description',
        negated: false,
      });
    });
  });

  describe('logical operators', () => {
    it('parses And with two children', () => {
      const result = parseFilterXml({
        And: {
          PropertyIsEqualTo: { PropertyName: 'status', Literal: 'active' },
          PropertyIsGreaterThan: { PropertyName: 'pop', Literal: 1000 },
        },
      });
      expect(result).toEqual({
        type: 'logical',
        operator: 'AND',
        left: {
          type: 'comparison',
          property: 'status',
          operator: '=',
          value: 'active',
        },
        right: {
          type: 'comparison',
          property: 'pop',
          operator: '>',
          value: 1000,
        },
      });
    });

    it('parses Or with two different children', () => {
      const result = parseFilterXml({
        Or: {
          PropertyIsEqualTo: { PropertyName: 'type', Literal: 'A' },
          PropertyIsGreaterThan: { PropertyName: 'count', Literal: 10 },
        },
      });
      expect(result).toEqual({
        type: 'logical',
        operator: 'OR',
        left: {
          type: 'comparison',
          property: 'type',
          operator: '=',
          value: 'A',
        },
        right: {
          type: 'comparison',
          property: 'count',
          operator: '>',
          value: 10,
        },
      });
    });

    it('parses Or with array children (fast-xml-parser merging duplicate keys)', () => {
      const result = parseFilterXml({
        Or: {
          PropertyIsEqualTo: [
            { PropertyName: 'type', Literal: 'A' },
            { PropertyName: 'type', Literal: 'B' },
          ],
        },
      });
      expect(result).toEqual({
        type: 'logical',
        operator: 'OR',
        left: {
          type: 'comparison',
          property: 'type',
          operator: '=',
          value: 'A',
        },
        right: {
          type: 'comparison',
          property: 'type',
          operator: '=',
          value: 'B',
        },
      });
    });

    it('parses And with array children (fast-xml-parser merging)', () => {
      const result = parseFilterXml({
        And: {
          PropertyIsEqualTo: [
            { PropertyName: 'a', Literal: 1 },
            { PropertyName: 'b', Literal: 2 },
          ],
        },
      });
      expect(result).toEqual({
        type: 'logical',
        operator: 'AND',
        left: {
          type: 'comparison',
          property: 'a',
          operator: '=',
          value: 1,
        },
        right: {
          type: 'comparison',
          property: 'b',
          operator: '=',
          value: 2,
        },
      });
    });

    it('reduces single-child logical to the child itself', () => {
      const result = parseFilterXml({
        And: {
          PropertyIsEqualTo: { PropertyName: 'x', Literal: 1 },
        },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'x',
        operator: '=',
        value: 1,
      });
    });

    it('throws on empty And filter', () => {
      expect(() => parseFilterXml({ And: {} })).toThrow('Empty AND filter');
    });

    it('throws on empty Or filter', () => {
      expect(() => parseFilterXml({ Or: {} })).toThrow('Empty OR filter');
    });

    it('skips attributes (keys starting with @_) in logical nodes', () => {
      const result = parseFilterXml({
        And: {
          '@_xmlns': 'http://www.opengis.net/ogc',
          PropertyIsEqualTo: { PropertyName: 'x', Literal: 1 },
        },
      });
      expect(result).toEqual({
        type: 'comparison',
        property: 'x',
        operator: '=',
        value: 1,
      });
    });
  });

  describe('Not operator', () => {
    it('wraps a child comparison in a not node', () => {
      const result = parseFilterXml({
        Not: {
          PropertyIsEqualTo: { PropertyName: 'status', Literal: 'deleted' },
        },
      });
      expect(result).toEqual({
        type: 'not',
        operand: {
          type: 'comparison',
          property: 'status',
          operator: '=',
          value: 'deleted',
        },
      });
    });

    it('throws on empty Not filter', () => {
      expect(() => parseFilterXml({ Not: {} })).toThrow('Empty NOT filter');
    });
  });

  describe('BBOX', () => {
    it('parses BBOX with Envelope into S_INTERSECTS', () => {
      const result = parseFilterXml({
        BBOX: {
          PropertyName: 'geom',
          Envelope: {
            lowerCorner: '-73.6 45.4',
            upperCorner: '-73.5 45.5',
          },
        },
      });
      expect(result).toEqual({
        type: 'spatial',
        operator: 'S_INTERSECTS',
        property: 'geom',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [-73.6, 45.4],
            [-73.5, 45.4],
            [-73.5, 45.5],
            [-73.6, 45.5],
            [-73.6, 45.4],
          ]],
        },
      });
    });

    it('uses PropertyName when provided in BBOX', () => {
      const result = parseFilterXml({
        BBOX: {
          PropertyName: 'the_geom',
          Envelope: {
            lowerCorner: '0 0',
            upperCorner: '1 1',
          },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        property: 'the_geom',
      }));
    });

    it('throws on BBOX without valid geometry', () => {
      expect(() => parseFilterXml({ BBOX: {} })).toThrow('Invalid BBOX filter');
    });
  });

  describe('spatial operators', () => {
    it('parses Intersects with Point (pos)', () => {
      const result = parseFilterXml({
        Intersects: {
          PropertyName: 'geom',
          Point: { pos: '-73.5 45.5' },
        },
      });
      expect(result).toEqual({
        type: 'spatial',
        operator: 'S_INTERSECTS',
        property: 'geom',
        geometry: {
          type: 'Point',
          coordinates: [-73.5, 45.5],
        },
      });
    });

    it('parses Within with Polygon (exterior/LinearRing/posList)', () => {
      const result = parseFilterXml({
        Within: {
          PropertyName: 'geom',
          Polygon: {
            exterior: {
              LinearRing: {
                posList: '0 0 1 0 1 1 0 1 0 0',
              },
            },
          },
        },
      });
      expect(result).toEqual({
        type: 'spatial',
        operator: 'S_WITHIN',
        property: 'geom',
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      });
    });

    it('parses Contains spatial op', () => {
      const result = parseFilterXml({
        Contains: {
          PropertyName: 'geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        operator: 'S_CONTAINS',
      }));
    });

    it('parses Crosses spatial op', () => {
      const result = parseFilterXml({
        Crosses: {
          PropertyName: 'geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        operator: 'S_CROSSES',
      }));
    });

    it('parses Touches spatial op', () => {
      const result = parseFilterXml({
        Touches: {
          PropertyName: 'geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        operator: 'S_TOUCHES',
      }));
    });

    it('parses Disjoint spatial op', () => {
      const result = parseFilterXml({
        Disjoint: {
          PropertyName: 'geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        operator: 'S_DISJOINT',
      }));
    });

    it('parses Equals spatial op', () => {
      const result = parseFilterXml({
        Equals: {
          PropertyName: 'geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        type: 'spatial',
        operator: 'S_EQUALS',
      }));
    });

    it('throws on spatial op with invalid geometry', () => {
      expect(() => parseFilterXml({
        Intersects: { PropertyName: 'geom' },
      })).toThrow('Invalid geometry in S_INTERSECTS filter');
    });

    it('uses PropertyName when provided in spatial op', () => {
      const result = parseFilterXml({
        Intersects: {
          PropertyName: 'the_geom',
          Point: { pos: '1 2' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        property: 'the_geom',
      }));
    });
  });

  describe('GML geometry parsing', () => {
    it('parses Point with coordinates attribute', () => {
      const result = parseFilterXml({
        Intersects: {
          PropertyName: 'geom',
          Point: { coordinates: '-73.5,45.5' },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        geometry: {
          type: 'Point',
          coordinates: [-73.5, 45.5],
        },
      }));
    });

    it('parses Polygon with outerBoundaryIs', () => {
      const result = parseFilterXml({
        Within: {
          PropertyName: 'geom',
          Polygon: {
            outerBoundaryIs: {
              LinearRing: {
                coordinates: '0,0 1,0 1,1 0,1 0,0',
              },
            },
          },
        },
      });
      expect(result).toEqual(expect.objectContaining({
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        },
      }));
    });

    it('parses Envelope into a closed polygon', () => {
      const result = parseFilterXml({
        BBOX: {
          Envelope: {
            lowerCorner: '10 20',
            upperCorner: '30 40',
          },
        },
      });
      const geom = (result as { geometry: GeoJSON.Geometry }).geometry;
      expect(geom.type).toBe('Polygon');
      const coords = (geom as GeoJSON.Polygon).coordinates[0];
      expect(coords).toHaveLength(5);
      expect(coords[0]).toEqual(coords[4]); // ring is closed
    });
  });
});
