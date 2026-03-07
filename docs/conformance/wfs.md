# WFS Conformance Details

This document maps WFS 1.1.0 and WFS 2.0 operations to their implementation
status and the test file(s) that verify them. All test paths are relative to
`packages/conformance-tests/src/`.

---

## WFS 1.1.0

| Operation | Requirement | Status | Test(s) |
|---|---|---|---|
| GetCapabilities | XML response with version 1.1.0 | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | ServiceIdentification | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | OperationsMetadata | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | FeatureTypeList with bounds | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | Filter_Capabilities | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | DefaultSRS / OtherSRS | Supported | wfs11/capabilities.test.ts |
| GetCapabilities | XML namespaces (wfs, ows, ogc) | Supported | wfs11/capabilities.test.ts |
| DescribeFeatureType | JSON schema response | Supported | wfs11/describe.test.ts |
| DescribeFeatureType | Geometry types (Point, LineString, Polygon) | Supported | wfs11/describe.test.ts |
| DescribeFeatureType | Attribute xsd types | Supported | wfs11/describe.test.ts |
| GetFeature | GET with maxFeatures, startIndex | Supported | wfs11/get-feature.test.ts |
| GetFeature | POST with XML body | Supported | wfs11/get-feature.test.ts |
| GetFeature | GeoJSON output format | Supported | wfs11/get-feature.test.ts |
| GetFeature | totalFeatures, numberReturned | Supported | wfs11/get-feature.test.ts |
| GetFeature | CRS metadata (CRS84) | Supported | wfs11/get-feature.test.ts |
| GetFeature | resultType=hits | Supported | wfs11/get-feature.test.ts |
| GetFeature | SRS reprojection (EPSG:3857) | Supported | wfs11/get-feature.test.ts |
| GetFeature | All geometry types | Supported | wfs11/get-feature.test.ts |

### WFS 1.1.0 Limitations

- GML output not supported (GeoJSON only).
- Filter Encoding (OGC filter XML) not supported in queries.
- Transaction operations not supported.

---

## WFS 2.0

| Operation | Requirement | Status | Test(s) |
|---|---|---|---|
| GetCapabilities | version=2.0.0 with WFS 2.0 namespace | Supported | wfs20/capabilities.test.ts |
| GetCapabilities | ServiceTypeVersion 2.0.0 | Supported | wfs20/capabilities.test.ts |
| GetCapabilities | DefaultCRS / OtherCRS | Supported | wfs20/capabilities.test.ts |
| GetCapabilities | FES 2.0 Filter_Capabilities | Supported | wfs20/capabilities.test.ts |
| GetFeature | count parameter (replaces maxFeatures) | Supported | wfs20/get-feature.test.ts |
| GetFeature | typeNames (plural) parameter | Supported | wfs20/get-feature.test.ts |
| GetFeature | numberMatched / numberReturned | Supported | wfs20/get-feature.test.ts |
| GetFeature | startIndex pagination | Supported | wfs20/get-feature.test.ts |
| GetFeature | resultType=hits | Supported | wfs20/get-feature.test.ts |
| GetFeature | POST with WFS 2.0 namespace | Supported | wfs20/get-feature.test.ts |
| Version negotiation | Default to 1.1.0, accept 2.0.0 | Supported | wfs20/version-negotiation.test.ts |

### WFS 2.0 Not Supported

- StoredQueries (ListStoredQueries, DescribeStoredQueries, CreateStoredQuery, DropStoredQuery).
- Ad-hoc queries with Filter Encoding Specification (FES).
- GetPropertyValue operation.
- GML output (only GeoJSON).
- Transaction and Locking operations.
- Manage stored queries conformance class.

---

## Key Differences Between WFS 1.1 and 2.0 in This Proxy

| Aspect | WFS 1.1.0 | WFS 2.0 |
|---|---|---|
| Max results parameter | `maxFeatures` | `count` |
| Type name parameter | `typeName` | `typeNames` |
| Default spatial reference | `DefaultSRS` / `OtherSRS` | `DefaultCRS` / `OtherCRS` |
| XML namespaces | `http://www.opengis.net/wfs` (wfs), `http://www.opengis.net/ows` (ows), `http://www.opengis.net/ogc` (ogc) | `http://www.opengis.net/wfs/2.0` (wfs), `http://www.opengis.net/ows/1.1` (ows), `http://www.opengis.net/fes/2.0` (fes) |
| Filter capabilities namespace | OGC Filter Encoding 1.1 | FES 2.0 |

Both versions are supported by the proxy. The version is determined by the
`version` query parameter (or `AcceptVersions` in the request). When no version
is specified, the proxy defaults to WFS 1.1.0.
