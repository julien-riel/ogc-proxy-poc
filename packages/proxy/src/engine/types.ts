export interface PropertyConfig {
  name: string;
  type: string;
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
  upstream: {
    baseUrl: string;
    method: string;
    pagination: PaginationConfig;
    responseMapping: {
      items: string;
      total: string | null;
      item: string;
    };
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

export interface RegistryConfig {
  collections: Record<string, CollectionConfig>;
}
