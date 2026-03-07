# Conformance Documentation

This is the conformance documentation for the OGC proxy POC. It maps implemented
capabilities to OGC specification requirements and records which conformance
classes are supported, partially supported, or not yet implemented.

## Coverage Summary

| Specification | Conformance Classes | Status | Coverage | Documentation |
|---|---|---|---|---|
| OGC API Features Part 1 (Core) | Core, GeoJSON | Supported | ~90% | [Details](ogc-api-features.md) |
| OGC API Features Part 3 (Filtering) | Filter, Features Filter, Queryables | Supported | ~80% | [Details](ogc-api-features.md) |
| CQL2 | Basic, Advanced Comparison, Basic Spatial, Spatial Functions, CQL2 Text | Supported | ~90% | [Details](ogc-api-features.md) |
| Sorting | OGC API Records-style sortby | Partial | ~50% | [Details](ogc-api-features.md) |
| WFS 1.1.0 | GetCapabilities, DescribeFeatureType, GetFeature, Filter Encoding | Supported | ~95% | [Details](wfs.md) |
| WFS 2.0 | GetCapabilities, DescribeFeatureType, GetFeature, FES 2.0 Filter | Supported | ~70% | [Details](wfs.md) |

### Legend

- **Supported**: Core requirements implemented and tested.
- **Partial**: Key features implemented, some requirements missing.
- **Not Supported**: Not implemented.

## How Tests Demonstrate Conformance

The conformance test suite lives in `packages/conformance-tests/src/` and
contains 182 tests across 23 files. Each test file maps to a specific capability
area of the OGC specifications:

- **Test file organization** mirrors the specification structure. For example,
  `ogc-api-features/core/landing.test.ts` covers the landing page requirements
  from OGC API Features Part 1, while `wfs/wfs11/capabilities.test.ts` covers
  WFS 1.1.0 GetCapabilities.

- **Test descriptions reference OGC requirement IDs** where applicable (e.g.
  `/req/core/root-op`, `/req/filter/filter-param`), making it straightforward to
  trace each test back to its specification requirement.

- **Tests run as E2E integration tests** against a real proxy instance backed by
  mock upstream servers. This validates the full request/response cycle rather
  than testing components in isolation.

- **How to run the tests**:

  ```bash
  # From the repository root
  npm test

  # Or directly from the conformance tests package
  cd packages/conformance-tests && npx vitest run
  ```

## Known Limitations

- **No HTML encoding** -- only JSON and GeoJSON responses are supported.
- **No datetime parameter support** -- the POC does not include temporal data,
  so the `/req/core/items-datetime-param` requirement is not implemented.
- **CQL2 JSON encoding not supported** -- only CQL2 text encoding is
  implemented.
- **No OpenAPI 3.0 validation** -- the proxy does not serve or validate against
  an OpenAPI 3.0 document.
- **Sorting only works when the upstream supports it** -- the proxy passes
  `sortby` through to the upstream service via the configured `sortParam`; it
  does not sort results itself.
- **WFS 2.0 gaps** -- StoredQueries and GML output are not supported.
