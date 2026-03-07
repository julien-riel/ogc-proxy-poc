export interface UpstreamPropertyMapping {
  param?: string;
  operators?: string[];
  sortParam?: string;
  sortDesc?: string;
}

export interface PropertyConfig {
  name: string;
  type: string;
  filterable?: boolean;
  sortable?: boolean;
  upstream?: UpstreamPropertyMapping;
}

export interface OffsetLimitPagination {
  type: 'offset-limit';
  offsetParam: string;
  limitParam: string;
}

export interface PagePagination {
  type: 'page-pageSize';
  pageParam: string;
  pageSizeParam: string;
}

export interface CursorPagination {
  type: 'cursor';
  cursorParam: string;
  limitParam: string;
  nextCursorField: string;
}

export type PaginationConfig = OffsetLimitPagination | PagePagination | CursorPagination;

export interface CollectionConfig {
  title: string;
  description?: string;
  plugin?: string;
  maxPageSize?: number;
  maxFeatures?: number;
  extent?: {
    spatial: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
  };
  upstream: {
    type?: 'rest' | 'wfs';
    baseUrl: string;
    method: string;
    pagination: PaginationConfig;
    responseMapping: {
      items: string;
      total: string | null;
      item: string;
    };
    spatialCapabilities?: string[];
    typeName?: string;
    version?: string;
  };
  geometry: {
    type: 'Point' | 'LineString' | 'Polygon';
    xField?: string;
    yField?: string;
    coordsField?: string;
    wktField?: string;
  };
  idField: string;
  properties: PropertyConfig[];
}

export interface DefaultsConfig {
  maxPageSize?: number;
  maxFeatures?: number;
}

export interface RegistryConfig {
  defaults?: DefaultsConfig;
  collections: Record<string, CollectionConfig>;
}
