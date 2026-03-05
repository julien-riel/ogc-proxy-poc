import { getCollection } from '../engine/registry.js';

const TYPE_MAP: Record<string, { xsd: string; gml?: string }> = {
  string: { xsd: 'xsd:string' },
  int: { xsd: 'xsd:int' },
  double: { xsd: 'xsd:double' },
  boolean: { xsd: 'xsd:boolean' },
};

const GEOM_TYPE_MAP: Record<string, string> = {
  Point: 'gml:Point',
  LineString: 'gml:LineString',
  Polygon: 'gml:Polygon',
};

export function buildDescribeFeatureType(typeName: string) {
  const config = getCollection(typeName);
  if (!config) return null;

  const properties: Array<Record<string, unknown>> = [
    {
      name: 'geometry',
      maxOccurs: 1,
      minOccurs: 0,
      nillable: true,
      type: GEOM_TYPE_MAP[config.geometry.type] || 'gml:Point',
      localType: config.geometry.type,
    },
  ];

  for (const prop of config.properties) {
    const typeInfo = TYPE_MAP[prop.type] || TYPE_MAP.string;
    properties.push({
      name: prop.name,
      maxOccurs: 1,
      minOccurs: 0,
      nillable: true,
      type: typeInfo.xsd,
      localType: prop.type === 'double' ? 'double' : prop.type === 'int' ? 'int' : 'string',
    });
  }

  return {
    elementFormDefault: 'qualified',
    targetNamespace: 'http://ogc-proxy.municipal',
    targetPrefix: 'ogcproxy',
    featureTypes: [{ typeName, properties }],
  };
}
