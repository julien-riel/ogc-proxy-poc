import { useCallback, useRef, useState } from 'react';
import type {
  OGCLandingPage,
  OGCConformance,
  OGCCollection,
  OGCCollectionsResponse,
  OGCItemsResponse,
  RequestLogEntry,
} from '../types/ogc.js';
import { ogcFetch } from './ogc-fetch.js';

export interface UseOGCClientOptions {
  onRequest?: (entry: RequestLogEntry) => void;
}

export interface UseOGCClientReturn {
  serverUrl: string | null;
  landing: OGCLandingPage | null;
  conformance: OGCConformance | null;
  collections: OGCCollection[];
  isConnecting: boolean;
  error: string | null;
  connect: (url: string) => Promise<void>;
  disconnect: () => void;
  fetchItems: (collectionId: string, limit?: number) => Promise<OGCItemsResponse>;
  fetchNextPage: (nextLink: string) => Promise<OGCItemsResponse>;
}

/** Hook for communicating with an OGC API Features server. */
export function useOGCClient(options?: UseOGCClientOptions): UseOGCClientReturn {
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [landing, setLanding] = useState<OGCLandingPage | null>(null);
  const [conformance, setConformance] = useState<OGCConformance | null>(null);
  const [collections, setCollections] = useState<OGCCollection[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use refs for stable references — avoids recreating callbacks on every render
  const baseUrlRef = useRef<string | null>(null);
  const onRequestRef = useRef(options?.onRequest);
  onRequestRef.current = options?.onRequest;

  const getFetchOpts = useCallback(() => {
    return onRequestRef.current ? { onRequest: onRequestRef.current } : undefined;
  }, []);

  const connect = useCallback(
    async (url: string) => {
      const baseUrl = url.replace(/\/+$/, '');
      setIsConnecting(true);
      setError(null);

      try {
        const opts = getFetchOpts();
        const landingData = await ogcFetch<OGCLandingPage>(`${baseUrl}/`, opts);
        const conformanceData = await ogcFetch<OGCConformance>(`${baseUrl}/conformance`, opts);
        const collectionsData = await ogcFetch<OGCCollectionsResponse>(`${baseUrl}/collections`, opts);

        baseUrlRef.current = baseUrl;
        setServerUrl(baseUrl);
        setLanding(landingData);
        setConformance(conformanceData);
        setCollections(collectionsData.collections);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setServerUrl(null);
        setLanding(null);
        setConformance(null);
        setCollections([]);
        baseUrlRef.current = null;
      } finally {
        setIsConnecting(false);
      }
    },
    [getFetchOpts],
  );

  const disconnect = useCallback(() => {
    setServerUrl(null);
    setLanding(null);
    setConformance(null);
    setCollections([]);
    setError(null);
    baseUrlRef.current = null;
  }, []);

  const fetchItems = useCallback(
    async (collectionId: string, limit = 100): Promise<OGCItemsResponse> => {
      const base = baseUrlRef.current;
      if (!base) throw new Error('Not connected to a server');
      return ogcFetch<OGCItemsResponse>(
        `${base}/collections/${collectionId}/items?limit=${limit}&f=json`,
        getFetchOpts(),
      );
    },
    [getFetchOpts],
  );

  const fetchNextPage = useCallback(
    async (nextLink: string): Promise<OGCItemsResponse> => {
      return ogcFetch<OGCItemsResponse>(nextLink, getFetchOpts());
    },
    [getFetchOpts],
  );

  return {
    serverUrl,
    landing,
    conformance,
    collections,
    isConnecting,
    error,
    connect,
    disconnect,
    fetchItems,
    fetchNextPage,
  };
}
