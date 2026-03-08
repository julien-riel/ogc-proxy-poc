import type { Token } from './types.js';

const KEYWORDS = new Set([
  'AND',
  'OR',
  'NOT',
  'LIKE',
  'IN',
  'BETWEEN',
  'IS',
  'NULL',
  'S_INTERSECTS',
  'S_WITHIN',
  'S_DWITHIN',
  'S_CONTAINS',
  'S_CROSSES',
  'S_TOUCHES',
  'S_DISJOINT',
  'S_EQUALS',
  'T_BEFORE',
  'T_AFTER',
  'T_DURING',
  'POINT',
  'LINESTRING',
  'POLYGON',
]);

const OPERATORS = ['<>', '<=', '>=', '=', '<', '>'];

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // String literal
    if (input[i] === "'") {
      i++;
      let str = '';
      while (i < input.length && input[i] !== "'") {
        if (input[i] === "'" && input[i + 1] === "'") {
          str += "'";
          i += 2;
        } else {
          str += input[i];
          i++;
        }
      }
      i++; // closing quote
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Parentheses and comma
    if (input[i] === '(') {
      tokens.push({ type: 'LPAREN' });
      i++;
      continue;
    }
    if (input[i] === ')') {
      tokens.push({ type: 'RPAREN' });
      i++;
      continue;
    }
    if (input[i] === ',') {
      tokens.push({ type: 'COMMA' });
      i++;
      continue;
    }

    // Operators (check multi-char first)
    const opMatch = OPERATORS.find((op) => input.slice(i, i + op.length) === op);
    if (opMatch) {
      tokens.push({ type: 'OPERATOR', value: opMatch });
      i += opMatch.length;
      continue;
    }

    // Number (including negative)
    if (/\d/.test(input[i]) || (input[i] === '-' && /\d/.test(input[i + 1] ?? ''))) {
      // Negative numbers: only treat '-' as negative sign after operator, comma, or lparen
      if (input[i] === '-') {
        const prev = tokens[tokens.length - 1];
        if (!prev || (prev.type !== 'OPERATOR' && prev.type !== 'COMMA' && prev.type !== 'LPAREN')) {
          // Not a negative number context, skip
          i++;
          continue;
        }
      }
      let num = '';
      if (input[i] === '-') {
        num += '-';
        i++;
      }
      while (i < input.length && /[\d.]/.test(input[i])) {
        num += input[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(num) });
      continue;
    }

    // Word (keyword or property name)
    if (/[a-zA-Z_]/.test(input[i])) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i];
        i++;
      }
      if (KEYWORDS.has(word.toUpperCase())) {
        tokens.push({ type: 'KEYWORD', value: word.toUpperCase() });
      } else {
        tokens.push({ type: 'PROPERTY', value: word });
      }
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: 'EOF' });
  return tokens;
}
