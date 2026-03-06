import { tokenize } from './lexer.js';
import type { Token, CqlNode, CqlSpatial } from './types.js';

class Parser {
  private tokens: Token[];
  private pos = 0;

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
    if (token.type === 'KEYWORD' && ['S_INTERSECTS', 'S_WITHIN', 'S_DWITHIN'].includes((token as { value: string }).value)) {
      return this.parseSpatial();
    }

    // Parenthesized expression
    if (token.type === 'LPAREN') {
      this.advance();
      const node = this.parseOr();
      this.expect('RPAREN');
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

      // Comparison
      const op = (this.expect('OPERATOR') as { type: 'OPERATOR'; value: string }).value;
      const valToken = this.advance();
      const value = valToken.type === 'STRING'
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
      case 'POINT': return this.parsePoint();
      case 'POLYGON': return this.parsePolygon();
      case 'LINESTRING': return this.parseLineString();
      default: throw new Error(`Unsupported geometry type: ${geomType}`);
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
