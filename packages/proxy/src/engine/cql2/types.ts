export type CqlNode =
  | CqlComparison
  | CqlLogical
  | CqlSpatial
  | CqlLike
  | CqlNot;

export interface CqlComparison {
  type: 'comparison';
  property: string;
  operator: '=' | '<>' | '<' | '>' | '<=' | '>=';
  value: string | number;
}

export interface CqlLike {
  type: 'like';
  property: string;
  pattern: string;
}

export interface CqlLogical {
  type: 'logical';
  operator: 'AND' | 'OR';
  left: CqlNode;
  right: CqlNode;
}

export interface CqlNot {
  type: 'not';
  operand: CqlNode;
}

export interface CqlSpatial {
  type: 'spatial';
  operator: 'S_INTERSECTS' | 'S_WITHIN' | 'S_DWITHIN';
  property: string;
  geometry: GeoJSON.Geometry;
  distance?: number;
  distanceUnits?: string;
}

export type Token =
  | { type: 'PROPERTY'; value: string }
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: number }
  | { type: 'OPERATOR'; value: string }
  | { type: 'KEYWORD'; value: string }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' }
  | { type: 'EOF' };
