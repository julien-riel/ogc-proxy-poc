export type CqlNode =
  | CqlComparison
  | CqlLogical
  | CqlSpatial
  | CqlLike
  | CqlNot
  | CqlIn
  | CqlBetween
  | CqlIsNull
  | CqlTemporal;

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

export interface CqlIn {
  type: 'in';
  property: string;
  values: (string | number)[];
}

export interface CqlBetween {
  type: 'between';
  property: string;
  low: string | number;
  high: string | number;
}

export interface CqlIsNull {
  type: 'isNull';
  property: string;
  negated: boolean;
}

export interface CqlSpatial {
  type: 'spatial';
  operator:
    | 'S_INTERSECTS'
    | 'S_WITHIN'
    | 'S_DWITHIN'
    | 'S_CONTAINS'
    | 'S_CROSSES'
    | 'S_TOUCHES'
    | 'S_DISJOINT'
    | 'S_EQUALS';
  property: string;
  geometry: GeoJSON.Geometry;
  distance?: number;
  distanceUnits?: string;
}

export interface CqlTemporal {
  type: 'temporal';
  operator: 'T_BEFORE' | 'T_AFTER' | 'T_DURING';
  property: string;
  value: string;
  value2?: string;
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
