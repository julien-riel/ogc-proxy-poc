import type { Feature } from 'geojson';

/** OGC API link object (RFC 8288) */
export interface OGCLink {
  href: string;
  rel: string;
  type?: string;
  title?: string;
}

/** Landing page response (GET /) */
export interface OGCLandingPage {
  title?: string;
  description?: string;
  links: OGCLink[];
}

/** Conformance response (GET /conformance) */
export interface OGCConformance {
  conformsTo: string[];
}

/** Single collection metadata */
export interface OGCCollection {
  id: string;
  title?: string;
  description?: string;
  links: OGCLink[];
  extent?: {
    spatial?: { bbox: number[][]; crs?: string };
    temporal?: { interval: (string | null)[][] };
  };
  crs?: string[];
  itemType?: string;
}

/** Collections response (GET /collections) */
export interface OGCCollectionsResponse {
  collections: OGCCollection[];
  links: OGCLink[];
}

/** Items response (GET /collections/{id}/items) */
export interface OGCItemsResponse {
  type: 'FeatureCollection';
  features: Feature[];
  numberMatched?: number;
  numberReturned?: number;
  links: OGCLink[];
}

/** A collection loaded on the map with its features */
export interface LoadedCollection {
  id: string;
  metadata: OGCCollection;
  features: Feature[];
  color: string;
  numberMatched?: number;
  nextLink?: string;
}

/** Entry in the debug request log */
export interface RequestLogEntry {
  id: string;
  url: string;
  method: string;
  status: number;
  duration: number;
  timestamp: Date;
  responseBody?: unknown;
}
