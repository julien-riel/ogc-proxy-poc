import { describe, it, expect, vi } from 'vitest';
import { buildDescribeFeatureType } from './describe.js';

vi.mock('../engine/registry.js', () => ({
  getCollection: (id: string) => {
    if (id === 'bornes-fontaines') {
      return {
        title: 'Bornes-fontaines',
        properties: [
          { name: 'etat', type: 'string' },
          { name: 'capacite', type: 'int' },
          { name: 'actif', type: 'boolean' },
          { name: 'debit', type: 'double' },
        ],
        geometry: { type: 'Point' },
        idField: 'id',
      };
    }
    return undefined;
  },
}));

describe('buildDescribeFeatureType', () => {
  it('returns null for unknown type', () => {
    expect(buildDescribeFeatureType('unknown')).toBeNull();
  });

  it('returns schema for valid type', () => {
    const result = buildDescribeFeatureType('bornes-fontaines');
    expect(result).not.toBeNull();
    expect(result!.featureTypes).toHaveLength(1);
    expect(result!.featureTypes[0].typeName).toBe('bornes-fontaines');
  });

  it('includes geometry as first property', () => {
    const result = buildDescribeFeatureType('bornes-fontaines')!;
    const props = result.featureTypes[0].properties;
    expect(props[0].name).toBe('geometry');
    expect(props[0].type).toBe('gml:Point');
  });

  it('maps property types correctly', () => {
    const result = buildDescribeFeatureType('bornes-fontaines')!;
    const props = result.featureTypes[0].properties;
    const etat = props.find((p: Record<string, unknown>) => p.name === 'etat');
    const capacite = props.find((p: Record<string, unknown>) => p.name === 'capacite');
    const actif = props.find((p: Record<string, unknown>) => p.name === 'actif');
    const debit = props.find((p: Record<string, unknown>) => p.name === 'debit');
    expect(etat!.type).toBe('xsd:string');
    expect(capacite!.type).toBe('xsd:int');
    expect(actif!.type).toBe('xsd:boolean');
    expect(debit!.type).toBe('xsd:double');
  });

  it('includes correct number of properties', () => {
    const result = buildDescribeFeatureType('bornes-fontaines')!;
    // 1 geometry + 4 properties = 5
    expect(result.featureTypes[0].properties).toHaveLength(5);
  });
});
