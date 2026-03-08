import type { CqlNode } from '../engine/cql2/types.js';

/**
 * Converts an OGC Filter Encoding XML object (parsed by fast-xml-parser
 * with removeNSPrefix: true) into a CqlNode AST for evaluation.
 */
export function parseFilterXml(filter: Record<string, unknown>): CqlNode | null {
  if (!filter || typeof filter !== 'object') return null;

  // Logical operators
  if (filter['And']) return parseLogical('AND', filter['And'] as Record<string, unknown>);
  if (filter['Or']) return parseLogical('OR', filter['Or'] as Record<string, unknown>);
  if (filter['Not']) return parseNot(filter['Not'] as Record<string, unknown>);

  // Comparison operators
  if (filter['PropertyIsEqualTo']) return parseComparison('=', filter['PropertyIsEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsNotEqualTo'])
    return parseComparison('<>', filter['PropertyIsNotEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsLessThan'])
    return parseComparison('<', filter['PropertyIsLessThan'] as Record<string, unknown>);
  if (filter['PropertyIsGreaterThan'])
    return parseComparison('>', filter['PropertyIsGreaterThan'] as Record<string, unknown>);
  if (filter['PropertyIsLessThanOrEqualTo'])
    return parseComparison('<=', filter['PropertyIsLessThanOrEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsGreaterThanOrEqualTo'])
    return parseComparison('>=', filter['PropertyIsGreaterThanOrEqualTo'] as Record<string, unknown>);
  if (filter['PropertyIsLike']) return parseLike(filter['PropertyIsLike'] as Record<string, unknown>);
  if (filter['PropertyIsBetween']) return parseBetween(filter['PropertyIsBetween'] as Record<string, unknown>);
  if (filter['PropertyIsNull']) return parseIsNull(filter['PropertyIsNull'] as Record<string, unknown>);

  // Spatial operators
  if (filter['BBOX']) return parseBbox(filter['BBOX'] as Record<string, unknown>);
  if (filter['Intersects']) return parseSpatialOp('S_INTERSECTS', filter['Intersects'] as Record<string, unknown>);
  if (filter['Within']) return parseSpatialOp('S_WITHIN', filter['Within'] as Record<string, unknown>);
  if (filter['Contains']) return parseSpatialOp('S_CONTAINS', filter['Contains'] as Record<string, unknown>);
  if (filter['Crosses']) return parseSpatialOp('S_CROSSES', filter['Crosses'] as Record<string, unknown>);
  if (filter['Touches']) return parseSpatialOp('S_TOUCHES', filter['Touches'] as Record<string, unknown>);
  if (filter['Disjoint']) return parseSpatialOp('S_DISJOINT', filter['Disjoint'] as Record<string, unknown>);
  if (filter['Equals']) return parseSpatialOp('S_EQUALS', filter['Equals'] as Record<string, unknown>);

  return null;
}

/**
 * Extracts the property name from a filter node.
 */
function getPropertyName(node: Record<string, unknown>): string {
  const prop = node['PropertyName'] || node['ValueReference'];
  return String(prop);
}

/**
 * Extracts and coerces a literal value from a filter node.
 */
function getLiteral(node: Record<string, unknown>): string | number {
  const lit = node['Literal'];
  if (typeof lit === 'number') return lit;
  const s = String(lit);
  const n = Number(s);
  return !isNaN(n) && s.trim() !== '' ? n : s;
}

/**
 * Parses a comparison operator node into a CqlNode.
 */
function parseComparison(operator: '=' | '<>' | '<' | '>' | '<=' | '>=', node: Record<string, unknown>): CqlNode {
  return {
    type: 'comparison',
    property: getPropertyName(node),
    operator,
    value: getLiteral(node),
  };
}

/**
 * Parses a PropertyIsLike node into a CqlNode with CQL2-style pattern.
 */
function parseLike(node: Record<string, unknown>): CqlNode {
  const property = getPropertyName(node);
  const literal = String(node['Literal'] ?? '');
  const wildCard = String(node['@_wildCard'] ?? '*');
  const singleChar = String(node['@_singleChar'] ?? '?');
  // Convert OGC wildcards to CQL2 pattern (% and _)
  let pattern = literal;
  if (wildCard !== '%') pattern = pattern.split(wildCard).join('%');
  if (singleChar !== '_') pattern = pattern.split(singleChar).join('_');
  return { type: 'like', property, pattern };
}

/**
 * Parses a PropertyIsBetween node into a CqlNode.
 */
function parseBetween(node: Record<string, unknown>): CqlNode {
  const property = getPropertyName(node);
  const lower = node['LowerBoundary'] as Record<string, unknown>;
  const upper = node['UpperBoundary'] as Record<string, unknown>;
  return {
    type: 'between',
    property,
    low: getLiteral(lower),
    high: getLiteral(upper),
  };
}

/**
 * Parses a PropertyIsNull node into a CqlNode.
 */
function parseIsNull(node: Record<string, unknown>): CqlNode {
  return {
    type: 'isNull',
    property: getPropertyName(node),
    negated: false,
  };
}

/**
 * Parses a logical (And/Or) operator node into a CqlNode tree.
 */
function parseLogical(operator: 'AND' | 'OR', node: Record<string, unknown>): CqlNode {
  // Logical operators can contain multiple children — collect them all.
  // When fast-xml-parser encounters duplicate element names (e.g. two
  // PropertyIsEqualTo siblings), it merges them into an array under a
  // single key. We must expand those arrays back into individual children.
  const children: CqlNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_')) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        const childFilter = { [key]: item } as Record<string, unknown>;
        const child = parseFilterXml(childFilter);
        if (child) children.push(child);
      }
    } else {
      const childFilter = { [key]: value } as Record<string, unknown>;
      const child = parseFilterXml(childFilter);
      if (child) children.push(child);
    }
  }
  if (children.length === 0) throw new Error(`Empty ${operator} filter`);
  if (children.length === 1) return children[0];
  return children.reduce((left, right) => ({
    type: 'logical' as const,
    operator,
    left,
    right,
  }));
}

/**
 * Parses a Not operator node into a CqlNode.
 */
function parseNot(node: Record<string, unknown>): CqlNode {
  const child = parseFilterXml(node);
  if (!child) throw new Error('Empty NOT filter');
  return { type: 'not', operand: child };
}

/**
 * Parses a GML geometry element into a GeoJSON Geometry object.
 */
function parseGmlGeometry(node: Record<string, unknown>): GeoJSON.Geometry | null {
  // Envelope (used by BBOX)
  if (node['Envelope']) {
    const env = node['Envelope'] as Record<string, unknown>;
    const lower = String(env['lowerCorner']).split(' ').map(Number);
    const upper = String(env['upperCorner']).split(' ').map(Number);
    return {
      type: 'Polygon',
      coordinates: [
        [
          [lower[0], lower[1]],
          [upper[0], lower[1]],
          [upper[0], upper[1]],
          [lower[0], upper[1]],
          [lower[0], lower[1]],
        ],
      ],
    };
  }

  // Point
  if (node['Point']) {
    const pt = node['Point'] as Record<string, unknown>;
    const coords = String(pt['pos'] || pt['coordinates'])
      .split(/[\s,]+/)
      .map(Number);
    return { type: 'Point', coordinates: [coords[0], coords[1]] };
  }

  // Polygon
  if (node['Polygon']) {
    const poly = node['Polygon'] as Record<string, unknown>;
    const exterior = poly['exterior'] || poly['outerBoundaryIs'];
    const ring = (exterior as Record<string, unknown>)?.['LinearRing'] as Record<string, unknown>;
    if (ring) {
      const posList = String(ring['posList'] || ring['coordinates']);
      const nums = posList.split(/[\s,]+/).map(Number);
      const coords: number[][] = [];
      for (let i = 0; i < nums.length; i += 2) {
        coords.push([nums[i], nums[i + 1]]);
      }
      return { type: 'Polygon', coordinates: [coords] };
    }
  }

  return null;
}

/**
 * Parses a BBOX filter node into a spatial CqlNode.
 */
function parseBbox(node: Record<string, unknown>): CqlNode {
  const geom = parseGmlGeometry(node);
  if (!geom) throw new Error('Invalid BBOX filter');
  return {
    type: 'spatial',
    operator: 'S_INTERSECTS',
    property: getPropertyName(node) || 'geometry',
    geometry: geom,
  };
}

/**
 * Parses a spatial operator node into a CqlNode.
 */
function parseSpatialOp(
  operator: 'S_INTERSECTS' | 'S_WITHIN' | 'S_CONTAINS' | 'S_CROSSES' | 'S_TOUCHES' | 'S_DISJOINT' | 'S_EQUALS',
  node: Record<string, unknown>,
): CqlNode {
  const property = getPropertyName(node) || 'geometry';
  const geom = parseGmlGeometry(node);
  if (!geom) throw new Error(`Invalid geometry in ${operator} filter`);
  return { type: 'spatial', operator, property, geometry: geom };
}
