import type { Feature } from 'geojson';
import type { CqlNode } from './types.js';
import booleanIntersects from '@turf/boolean-intersects';
import booleanWithin from '@turf/boolean-within';
import turfDistance from '@turf/distance';
import { point as turfPoint } from '@turf/helpers';

function getPropertyValue(feature: Feature, property: string): unknown {
  if (property === 'geometry') return feature.geometry;
  return feature.properties?.[property];
}

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/%/g, '.*')
    .replace(/_/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

export function evaluateFilter(node: CqlNode, feature: Feature): boolean {
  switch (node.type) {
    case 'comparison': {
      const val = getPropertyValue(feature, node.property);
      const target = node.value;
      switch (node.operator) {
        // Intentional loose equality: GeoJSON properties may be strings ("42")
        // while CQL2 parses numeric literals as numbers (42).
        case '=': return val == target;
        case '<>': return val != target;
        case '<': return (val as number) < (target as number);
        case '>': return (val as number) > (target as number);
        case '<=': return (val as number) <= (target as number);
        case '>=': return (val as number) >= (target as number);
        default: return false;
      }
    }

    case 'like': {
      const val = String(getPropertyValue(feature, node.property) ?? '');
      return likeToRegex(node.pattern).test(val);
    }

    case 'logical': {
      const left = evaluateFilter(node.left, feature);
      const right = evaluateFilter(node.right, feature);
      return node.operator === 'AND' ? left && right : left || right;
    }

    case 'not':
      return !evaluateFilter(node.operand, feature);

    case 'in': {
      const val = getPropertyValue(feature, node.property);
      return node.values.some(v => val == v);
    }

    case 'between': {
      const val = getPropertyValue(feature, node.property) as number;
      return val >= (node.low as number) && val <= (node.high as number);
    }

    case 'isNull': {
      const val = getPropertyValue(feature, node.property);
      const isNull = val === null || val === undefined;
      return node.negated ? !isNull : isNull;
    }

    case 'spatial': {
      const geom = feature.geometry;
      if (!geom) return false;

      switch (node.operator) {
        case 'S_INTERSECTS':
          return booleanIntersects(feature, node.geometry);

        case 'S_WITHIN':
          return booleanWithin(feature, node.geometry as any);

        case 'S_DWITHIN': {
          if (!node.distance) return false;
          const refCoords = (node.geometry as GeoJSON.Point).coordinates;
          const featureCoords = geom.type === 'Point'
            ? (geom as GeoJSON.Point).coordinates
            : null;
          if (!featureCoords) return false;

          const threshold = node.distanceUnits === 'meters'
            ? node.distance / 1000
            : node.distance;
          const d = turfDistance(
            turfPoint(featureCoords),
            turfPoint(refCoords),
            { units: 'kilometers' },
          );
          return d <= threshold;
        }

        default:
          return false;
      }
    }

    default:
      return false;
  }
}
