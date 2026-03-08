import { tokenize } from './lexer.js';
import type { Token, CqlNode, CqlSpatial, CqlTemporal } from './types.js';

class Parser {
  private tokens: Token[];
  private pos = 0;
  private depth = 0;
  private static readonly MAX_DEPTH = 20;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private advance(): Token {
    return this.tokens[this.pos++];
  }

  private expect(type: string): Token {
    const t = this.advance();
    if (t.type !== type) {
      throw new Error(`Expected ${type}, got ${t.type}`);
    }
    return t;
  }

  parse(): CqlNode {
    return this.parseOr();
  }

  private parseOr(): CqlNode {
    let left = this.parseAnd();
    while (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'OR') {
      this.advance();
      const right = this.parseAnd();
      left = { type: 'logical', operator: 'OR', left, right };
    }
    return left;
  }

  private parseAnd(): CqlNode {
    let left = this.parseUnary();
    while (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'AND') {
      this.advance();
      const right = this.parseUnary();
      left = { type: 'logical', operator: 'AND', left, right };
    }
    return left;
  }

  private parseUnary(): CqlNode {
    if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'NOT') {
      this.advance();
      const operand = this.parsePrimary();
      return { type: 'not', operand };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CqlNode {
    const token = this.peek();

    // Spatial function
    if (
      token.type === 'KEYWORD' &&
      [
        'S_INTERSECTS',
        'S_WITHIN',
        'S_DWITHIN',
        'S_CONTAINS',
        'S_CROSSES',
        'S_TOUCHES',
        'S_DISJOINT',
        'S_EQUALS',
      ].includes((token as { value: string }).value)
    ) {
      return this.parseSpatial();
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.depth++;
      if (this.depth > Parser.MAX_DEPTH) {
        throw new Error(`Filter depth exceeds maximum of ${Parser.MAX_DEPTH}`);
      }
      this.advance();
      const node = this.parseOr();
      this.expect('RPAREN');
      this.depth--;
      return node;
    }

    // Property-based expression (comparison or LIKE)
    if (token.type === 'PROPERTY') {
      const property = (this.advance() as { type: 'PROPERTY'; value: string }).value;

      // LIKE
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'LIKE') {
        this.advance();
        const pattern = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
        return { type: 'like', property, pattern };
      }

      // IN
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'IN') {
        this.advance();
        this.expect('LPAREN');
        const values: (string | number)[] = [];
        const first = this.advance();
        values.push(
          first.type === 'STRING'
            ? (first as { type: 'STRING'; value: string }).value
            : (first as { type: 'NUMBER'; value: number }).value,
        );
        while (this.peek().type === 'COMMA') {
          this.advance();
          const v = this.advance();
          values.push(
            v.type === 'STRING'
              ? (v as { type: 'STRING'; value: string }).value
              : (v as { type: 'NUMBER'; value: number }).value,
          );
        }
        this.expect('RPAREN');
        return { type: 'in', property, values };
      }

      // BETWEEN
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'BETWEEN') {
        this.advance();
        const lowToken = this.advance();
        const low =
          lowToken.type === 'STRING'
            ? (lowToken as { type: 'STRING'; value: string }).value
            : (lowToken as { type: 'NUMBER'; value: number }).value;
        // Expect AND keyword
        const andToken = this.advance();
        if (andToken.type !== 'KEYWORD' || (andToken as { value: string }).value !== 'AND') {
          throw new Error(`Expected AND in BETWEEN, got ${JSON.stringify(andToken)}`);
        }
        const highToken = this.advance();
        const high =
          highToken.type === 'STRING'
            ? (highToken as { type: 'STRING'; value: string }).value
            : (highToken as { type: 'NUMBER'; value: number }).value;
        return { type: 'between', property, low, high };
      }

      // IS NULL / IS NOT NULL
      if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'IS') {
        this.advance();
        let negated = false;
        if (this.peek().type === 'KEYWORD' && (this.peek() as { value: string }).value === 'NOT') {
          this.advance();
          negated = true;
        }
        const nullToken = this.advance();
        if (nullToken.type !== 'KEYWORD' || (nullToken as { value: string }).value !== 'NULL') {
          throw new Error(`Expected NULL after IS, got ${JSON.stringify(nullToken)}`);
        }
        return { type: 'isNull', property, negated };
      }

      // Temporal predicates
      if (
        this.peek().type === 'KEYWORD' &&
        ['T_BEFORE', 'T_AFTER', 'T_DURING'].includes((this.peek() as { value: string }).value)
      ) {
        const op = (this.advance() as { value: string }).value as CqlTemporal['operator'];
        const value = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
        if (op === 'T_DURING') {
          const value2 = (this.expect('STRING') as { type: 'STRING'; value: string }).value;
          return { type: 'temporal', operator: op, property, value, value2 };
        }
        return { type: 'temporal', operator: op, property, value };
      }

      // Comparison
      const op = (this.expect('OPERATOR') as { type: 'OPERATOR'; value: string }).value;
      const valToken = this.advance();
      const value =
        valToken.type === 'STRING'
          ? (valToken as { type: 'STRING'; value: string }).value
          : (valToken as { type: 'NUMBER'; value: number }).value;
      return {
        type: 'comparison',
        property,
        operator: op as '=' | '<>' | '<' | '>' | '<=' | '>=',
        value,
      };
    }

    throw new Error(`Unexpected token: ${JSON.stringify(token)}`);
  }

  private parseSpatial(): CqlSpatial {
    const opToken = this.advance() as { type: 'KEYWORD'; value: string };
    const operator = opToken.value as CqlSpatial['operator'];
    this.expect('LPAREN');
    const property = (this.expect('PROPERTY') as { type: 'PROPERTY'; value: string }).value;
    this.expect('COMMA');
    const geometry = this.parseGeometry();

    let distance: number | undefined;
    let distanceUnits: string | undefined;
    if (operator === 'S_DWITHIN' && this.peek().type === 'COMMA') {
      this.advance(); // comma
      distance = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
      this.expect('COMMA');
      distanceUnits = (this.expect('PROPERTY') as { type: 'PROPERTY'; value: string }).value;
    }

    this.expect('RPAREN');
    return { type: 'spatial', operator, property, geometry, distance, distanceUnits };
  }

  private parseGeometry(): GeoJSON.Geometry {
    const token = this.peek();
    if (token.type !== 'KEYWORD') {
      throw new Error(`Expected geometry type, got ${token.type}`);
    }

    const geomType = (this.advance() as { type: 'KEYWORD'; value: string }).value;

    switch (geomType) {
      case 'POINT':
        return this.parsePoint();
      case 'POLYGON':
        return this.parsePolygon();
      case 'LINESTRING':
        return this.parseLineString();
      default:
        throw new Error(`Unsupported geometry type: ${geomType}`);
    }
  }

  private parsePoint(): GeoJSON.Geometry {
    this.expect('LPAREN');
    const x = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
    const y = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
    this.expect('RPAREN');
    return { type: 'Point', coordinates: [x, y] };
  }

  private parseCoordList(): number[][] {
    const coords: number[][] = [];
    const x = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
    const y = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
    coords.push([x, y]);

    while (this.peek().type === 'COMMA') {
      this.advance();
      if (this.peek().type !== 'NUMBER') break;
      const cx = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
      const cy = (this.expect('NUMBER') as { type: 'NUMBER'; value: number }).value;
      coords.push([cx, cy]);
    }
    return coords;
  }

  private parseLineString(): GeoJSON.Geometry {
    this.expect('LPAREN');
    const coords = this.parseCoordList();
    this.expect('RPAREN');
    return { type: 'LineString', coordinates: coords };
  }

  private parsePolygon(): GeoJSON.Geometry {
    this.expect('LPAREN');
    this.expect('LPAREN');
    const ring = this.parseCoordList();
    this.expect('RPAREN');
    this.expect('RPAREN');
    return { type: 'Polygon', coordinates: [ring] };
  }
}

export function parseCql2(input: string): CqlNode {
  const tokens = tokenize(input);
  const parser = new Parser(tokens);
  return parser.parse();
}
