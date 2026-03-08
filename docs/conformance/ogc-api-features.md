# OGC API Features -- Conformance Details

This document maps each OGC API Features requirement to its implementation
status and the test file(s) that verify it. All test paths are relative to
`packages/conformance-tests/src/`.

---

## OGC API Features Part 1 -- Core

Conformance class URI: `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| /req/core/root-op | HTTP GET at / | Supported | core/landing.test.ts |
| /req/core/root-success | Landing page with required links | Supported | core/landing.test.ts |
| /req/core/api-definition-op | API definition accessible | Supported | core/landing.test.ts (service-desc link) |
| /req/core/conformance-op | HTTP GET /conformance | Supported | core/conformance.test.ts |
| /req/core/conformance-success | conformsTo array | Supported | core/conformance.test.ts |
| /req/core/http | HTTP 1.1 conformance | Supported | core/http.test.ts |
| /req/core/collections-op | HTTP GET /collections | Supported | core/collections.test.ts |
| /req/core/collections-success | Collection metadata with CRS, extent | Supported | core/collections.test.ts |
| /req/core/collection-op | HTTP GET /collections/{id} | Supported | core/collections.test.ts |
| /req/core/collection-success | Single collection metadata | Supported | core/collections.test.ts |
| /req/core/items-op | HTTP GET /collections/{id}/items | Supported | core/items.test.ts |
| /req/core/items-limit-param | limit parameter | Supported | core/items.test.ts |
| /req/core/items-bbox-param | bbox parameter | Supported | filtering/bbox.test.ts |
| /req/core/items-datetime-param | datetime parameter | Not Supported | N/A -- no temporal data |
| /req/core/items-response-structure | numberReturned, numberMatched, links, timeStamp | Supported | core/items.test.ts |
| /req/core/feature-op | HTTP GET /collections/{id}/items/{fid} | Supported | core/items.test.ts |
| /req/core/feature-success | Single feature response | Supported | core/items.test.ts |
| /req/core/query-param-unknown | 400 for unknown params | Partial | core/error-handling.test.ts |
| /req/core/query-param-invalid | 400 for invalid values | Supported | core/error-handling.test.ts |
| /rec/core/cross-origin | CORS support | Supported | core/http.test.ts |

---

## OGC API Features Part 1 -- GeoJSON

Conformance class URI: `http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| GeoJSON encoding | application/geo+json responses | Supported | core/items.test.ts, core/http.test.ts |
| Feature structure | type, geometry, properties, id | Supported | core/items.test.ts |
| FeatureCollection | type, features array, links | Supported | core/items.test.ts |

---

## OGC API Features Part 3 -- Filter

Conformance class URI: `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/filter`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| /req/filter/filter-param | filter query parameter | Supported | filtering/cql2-basic.test.ts |
| /req/filter/filter-lang-param | filter-lang parameter | Supported | filtering/filter-lang.test.ts |
| /req/filter/filter-crs-wgs84 | Default CRS84 for filter geometries | Supported | filtering/cql2-spatial.test.ts |
| /req/filter/mixing-expressions | filter + bbox/query params combined | Supported | filtering/bbox.test.ts, filtering/cql2-spatial.test.ts |
| /req/filter/response | TRUE=include, FALSE=exclude | Supported | filtering/cql2-basic.test.ts |

---

## OGC API Features Part 3 -- Features Filter

Conformance class URI: `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/features-filter`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| /req/features-filter/get-queryables-op | Queryables endpoint | Supported | filtering/queryables.test.ts |
| /req/features-filter/filter-param | filter on /items | Supported | filtering/cql2-basic.test.ts |
| /req/features-filter/filter-lang-param | filter-lang on /items | Supported | filtering/filter-lang.test.ts |
| /req/features-filter/response | Combined filter evaluation | Supported | filtering/cql2-basic.test.ts |

---

## OGC API Features Part 3 -- Queryables

Conformance class URI: `http://www.opengis.net/spec/ogcapi-features-3/1.0/conf/queryables`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| /req/queryables/get-queryables-op | HTTP GET queryables | Supported | filtering/queryables.test.ts |
| /req/queryables/get-queryables-response | JSON Schema with $schema, properties | Supported | filtering/queryables.test.ts |

---

## CQL2 -- Basic

Conformance class URI: `http://www.opengis.net/spec/cql2/1.0/conf/basic-cql2`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| Comparison operators | =, <>, <, >, <=, >= | Supported | filtering/cql2-basic.test.ts |
| Logical operators | AND, OR, NOT | Supported | filtering/cql2-basic.test.ts |
| IS NULL | Null testing | Supported | filtering/cql2-basic.test.ts |

---

## CQL2 -- Advanced Comparison

Conformance class URI: `http://www.opengis.net/spec/cql2/1.0/conf/advanced-comparison-operators`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| LIKE | Pattern matching with % and _ | Supported | filtering/cql2-advanced.test.ts |
| IN | List membership | Supported | filtering/cql2-advanced.test.ts |
| BETWEEN | Range testing | Supported | filtering/cql2-advanced.test.ts |

---

## CQL2 -- Basic Spatial

Conformance class URI: `http://www.opengis.net/spec/cql2/1.0/conf/basic-spatial-functions`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| S_INTERSECTS | Geometry intersection | Supported | filtering/cql2-spatial.test.ts |

---

## CQL2 -- Spatial Functions (extended)

Conformance class URI: `http://www.opengis.net/spec/cql2/1.0/conf/spatial-functions`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| S_WITHIN | Containment | Supported | filtering/cql2-spatial.test.ts |
| S_OVERLAPS | Overlap | Supported (code exists) | N/A |
| S_DWITHIN | Distance-based | Supported (extension) | filtering/cql2-spatial.test.ts |
| S_CONTAINS | Containment (inverse) | Supported | filtering/cql2-spatial.test.ts |
| S_CROSSES | Crossing | Supported | filtering/cql2-spatial.test.ts |
| S_TOUCHES | Touching | Supported | filtering/cql2-spatial.test.ts |
| S_DISJOINT | Disjointness | Supported | filtering/cql2-spatial.test.ts |
| S_EQUALS | Equality | Supported | filtering/cql2-spatial.test.ts |

---

## CQL2 -- Text Encoding

Conformance class URI: `http://www.opengis.net/spec/cql2/1.0/conf/cql2-text`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| Text encoding | CQL2 text in filter parameter | Supported | All filtering/cql2-*.test.ts |

---

## CQL2 -- Not Supported Conformance Classes

| Conformance Class | Reason |
|---|---|
| CQL2 JSON (cql2-json) | Only text encoding implemented |
| Temporal Functions | No temporal data in this project |
| Array Functions | No array data in this project |
| Property-Property | Not implemented |
| Arithmetic | Not implemented |
| Case/Accent Insensitive | Not implemented |

---

## Sorting

Conformance class: `http://www.opengis.net/spec/ogcapi-records-1/1.0/conf/sorting`

| Requirement | Description | Status | Test(s) |
|---|---|---|---|
| sortby parameter | Comma-separated, `-` prefix for descending | Partial | sorting/sortby.test.ts |
| Sortables link | Link to sortables resource | Not Supported | N/A |

Note: Sorting requires upstream support (the collection config must specify
`sortParam`). The proxy validates sortby values and returns 400 for fields that
are not declared as sortable.
