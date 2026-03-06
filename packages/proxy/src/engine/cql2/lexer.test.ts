import { describe, it, expect } from 'vitest';
import { tokenize } from './lexer.js';

describe('CQL2 Lexer', () => {
  it('tokenizes a simple comparison', () => {
    const tokens = tokenize("etat='actif'");
    expect(tokens).toEqual([
      { type: 'PROPERTY', value: 'etat' },
      { type: 'OPERATOR', value: '=' },
      { type: 'STRING', value: 'actif' },
      { type: 'EOF' },
    ]);
  });

  it('tokenizes numeric comparison', () => {
    const tokens = tokenize('population>50000');
    expect(tokens).toEqual([
      { type: 'PROPERTY', value: 'population' },
      { type: 'OPERATOR', value: '>' },
      { type: 'NUMBER', value: 50000 },
      { type: 'EOF' },
    ]);
  });

  it('tokenizes AND/OR keywords', () => {
    const tokens = tokenize("etat='actif' AND population>100");
    expect(tokens[0]).toEqual({ type: 'PROPERTY', value: 'etat' });
    expect(tokens[3]).toEqual({ type: 'KEYWORD', value: 'AND' });
    expect(tokens[4]).toEqual({ type: 'PROPERTY', value: 'population' });
  });

  it('tokenizes LIKE keyword', () => {
    const tokens = tokenize("nom LIKE 'Rose%'");
    expect(tokens[1]).toEqual({ type: 'KEYWORD', value: 'LIKE' });
    expect(tokens[2]).toEqual({ type: 'STRING', value: 'Rose%' });
  });

  it('tokenizes spatial function call', () => {
    const tokens = tokenize("S_INTERSECTS(geometry,POINT(-73.5 45.5))");
    expect(tokens[0]).toEqual({ type: 'KEYWORD', value: 'S_INTERSECTS' });
    expect(tokens[1]).toEqual({ type: 'LPAREN' });
    expect(tokens[2]).toEqual({ type: 'PROPERTY', value: 'geometry' });
    expect(tokens[3]).toEqual({ type: 'COMMA' });
  });

  it('tokenizes <> operator', () => {
    const tokens = tokenize("etat<>'inactif'");
    expect(tokens[1]).toEqual({ type: 'OPERATOR', value: '<>' });
  });

  it('tokenizes <= and >= operators', () => {
    const tokens = tokenize('pop>=100 AND pop<=500');
    expect(tokens[1]).toEqual({ type: 'OPERATOR', value: '>=' });
    expect(tokens[5]).toEqual({ type: 'OPERATOR', value: '<=' });
  });

  it('tokenizes negative numbers after operator', () => {
    const tokens = tokenize('x>-73.5');
    expect(tokens[2]).toEqual({ type: 'NUMBER', value: -73.5 });
  });

  it('tokenizes NOT keyword', () => {
    const tokens = tokenize("NOT etat='inactif'");
    expect(tokens[0]).toEqual({ type: 'KEYWORD', value: 'NOT' });
  });
});
