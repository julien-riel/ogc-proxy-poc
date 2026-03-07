import turfBbox from '@turf/bbox';
import type { CqlNode } from './types.js';

/**
 * Walk the AST and extract a bounding box from the first spatial predicate found.
 * For S_DWITHIN, buffers the point by the distance.
 * Returns [minLon, minLat, maxLon, maxLat] or null.
 */
export function extractBboxFromAst(node: CqlNode): [number, number, number, number] | null {
  switch (node.type) {
    case 'spatial': {
      // Only extract bbox for operators where it serves as a valid pre-filter
      if (!['S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN'].includes(node.operator)) {
        return null;
      }
      if (node.operator === 'S_DWITHIN' && node.geometry.type === 'Point' && node.distance) {
        const [lon, lat] = node.geometry.coordinates;
        const distKm = node.distanceUnits === 'meters'
          ? node.distance / 1000
          : node.distance;
        const latDelta = distKm / 111.32;
        const lonDelta = distKm / (111.32 * Math.cos((lat * Math.PI) / 180));
        return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
      }
      const bbox = turfBbox(node.geometry);
      return [bbox[0], bbox[1], bbox[2], bbox[3]];
    }

    case 'logical': {
      const left = extractBboxFromAst(node.left);
      if (left) return left;
      return extractBboxFromAst(node.right);
    }

    case 'not':
      return extractBboxFromAst(node.operand);

    default:
      return null;
  }
}
