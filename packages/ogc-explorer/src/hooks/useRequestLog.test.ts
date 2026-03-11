import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRequestLog } from './useRequestLog.js';
import type { RequestLogEntry } from '../types/ogc.js';

describe('useRequestLog', () => {
  it('starts with an empty log', () => {
    const { result } = renderHook(() => useRequestLog());
    expect(result.current.entries).toEqual([]);
  });

  it('adds entries to the log in reverse chronological order', () => {
    const { result } = renderHook(() => useRequestLog());

    const entry: RequestLogEntry = {
      id: '1',
      url: 'https://example.com/',
      method: 'GET',
      status: 200,
      duration: 42,
      timestamp: new Date(),
    };

    act(() => {
      result.current.addEntry(entry);
    });

    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toEqual(entry);
  });

  it('clears the log', () => {
    const { result } = renderHook(() => useRequestLog());

    act(() => {
      result.current.addEntry({
        id: '1',
        url: 'https://example.com/',
        method: 'GET',
        status: 200,
        duration: 42,
        timestamp: new Date(),
      });
    });

    act(() => {
      result.current.clear();
    });

    expect(result.current.entries).toEqual([]);
  });
});
