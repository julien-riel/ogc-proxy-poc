import { describe, it, expect } from 'vitest';
import { escapeXml } from './xml.js';

describe('escapeXml', () => {
  it('escapes ampersand', () => {
    expect(escapeXml('A & B')).toBe('A &amp; B');
  });

  it('escapes angle brackets', () => {
    expect(escapeXml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes quotes', () => {
    expect(escapeXml('"hello" & \'world\'')).toBe('&quot;hello&quot; &amp; &apos;world&apos;');
  });

  it('returns empty string for empty input', () => {
    expect(escapeXml('')).toBe('');
  });

  it('passes through safe strings unchanged', () => {
    expect(escapeXml('Hello World 123')).toBe('Hello World 123');
  });
});
