export type {
  OGCLink,
  OGCLandingPage,
  OGCConformance,
  OGCCollection,
  OGCCollectionsResponse,
  OGCItemsResponse,
  LoadedCollection,
  RequestLogEntry,
} from './types/ogc.js';

export { useOGCClient } from './hooks/useOGCClient.js';
export type { UseOGCClientOptions, UseOGCClientReturn } from './hooks/useOGCClient.js';
export { useRequestLog } from './hooks/useRequestLog.js';
export type { UseRequestLogReturn } from './hooks/useRequestLog.js';
