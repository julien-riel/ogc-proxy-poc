import { z } from 'zod';

// --- Zod Schemas ---

export const upstreamPropertyMappingSchema = z.object({
  param: z.string().optional(),
  operators: z.array(z.string()).optional(),
  sortParam: z.string().optional(),
  sortDesc: z.string().optional(),
});

export const propertyConfigSchema = z.object({
  name: z.string(),
  type: z.string(),
  filterable: z.boolean().optional(),
  sortable: z.boolean().optional(),
  upstream: upstreamPropertyMappingSchema.optional(),
});

export const offsetLimitPaginationSchema = z.object({
  type: z.literal('offset-limit'),
  offsetParam: z.string(),
  limitParam: z.string(),
});

export const pagePaginationSchema = z.object({
  type: z.literal('page-pageSize'),
  pageParam: z.string(),
  pageSizeParam: z.string(),
});

export const cursorPaginationSchema = z.object({
  type: z.literal('cursor'),
  cursorParam: z.string(),
  limitParam: z.string(),
  nextCursorField: z.string(),
});

export const paginationConfigSchema = z.discriminatedUnion('type', [
  offsetLimitPaginationSchema,
  pagePaginationSchema,
  cursorPaginationSchema,
]);

export const rateLimitConfigSchema = z.object({
  capacity: z.number().positive(),
  refillRate: z.number().positive(),
});

export const collectionConfigSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  plugin: z.string().optional(),
  maxPageSize: z.number().positive().optional(),
  maxFeatures: z.number().positive().optional(),
  maxPostFetchItems: z.number().positive().optional(),
  timeout: z.number().positive().optional(),
  rateLimit: rateLimitConfigSchema.optional(),
  extent: z
    .object({
      spatial: z.tuple([z.number(), z.number(), z.number(), z.number()]),
    })
    .optional(),
  upstream: z.object({
    type: z.enum(['rest', 'wfs']).optional(),
    baseUrl: z.string().url(),
    method: z.string(),
    pagination: paginationConfigSchema,
    responseMapping: z.object({
      items: z.string(),
      total: z.string().nullable(),
      item: z.string(),
    }),
    spatialCapabilities: z.array(z.string()).optional(),
    typeName: z.string().optional(),
    version: z.string().optional(),
  }),
  geometry: z.object({
    type: z.enum(['Point', 'LineString', 'Polygon']),
    xField: z.string().optional(),
    yField: z.string().optional(),
    coordsField: z.string().optional(),
    wktField: z.string().optional(),
  }),
  idField: z.string(),
  properties: z.array(propertyConfigSchema),
});

export const defaultsConfigSchema = z.object({
  maxPageSize: z.number().positive().optional(),
  maxFeatures: z.number().positive().optional(),
  maxPostFetchItems: z.number().positive().optional(),
});

export const jwtConfigSchema = z.object({
  enabled: z.boolean(),
  host: z.string(),
  endpoint: z.string().optional(),
});

export const securityConfigSchema = z.object({
  jwt: jwtConfigSchema.optional(),
});

export const registryConfigSchema = z.object({
  defaults: defaultsConfigSchema.optional(),
  security: securityConfigSchema.optional(),
  collections: z.record(z.string(), collectionConfigSchema),
});

// --- Inferred Types ---

export type UpstreamPropertyMapping = z.infer<typeof upstreamPropertyMappingSchema>;
export type PropertyConfig = z.infer<typeof propertyConfigSchema>;
export type OffsetLimitPagination = z.infer<typeof offsetLimitPaginationSchema>;
export type PagePagination = z.infer<typeof pagePaginationSchema>;
export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type PaginationConfig = z.infer<typeof paginationConfigSchema>;
export type RateLimitConfig = z.infer<typeof rateLimitConfigSchema>;
export type CollectionConfig = z.infer<typeof collectionConfigSchema>;
export type DefaultsConfig = z.infer<typeof defaultsConfigSchema>;
export type JwtConfig = z.infer<typeof jwtConfigSchema>;
export type SecurityConfig = z.infer<typeof securityConfigSchema>;
export type RegistryConfig = z.infer<typeof registryConfigSchema>;
