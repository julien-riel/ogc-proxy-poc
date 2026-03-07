import type { Request } from 'express';
import { getRegistry } from '../engine/registry.js';

function getServiceUrl(req: Request): string {
  const host = process.env.BASE_URL
    ? process.env.BASE_URL.replace('/ogc', '')
    : `${req.protocol}://${req.get('host')}`;
  return `${host}/wfs`;
}

export function buildCapabilitiesXml(req: Request): string {
  const registry = getRegistry();
  const serviceUrl = getServiceUrl(req);

  const defaultExtent: [number, number, number, number] = [-73.98, 45.41, -73.47, 45.70];

  const featureTypes = Object.entries(registry.collections).map(([id, config]) => {
    const [minLon, minLat, maxLon, maxLat] = config.extent?.spatial ?? defaultExtent;
    return `
    <FeatureType>
      <Name>${id}</Name>
      <Title>${config.title}</Title>
      <Abstract>${config.description || ''}</Abstract>
      <DefaultSRS>urn:ogc:def:crs:OGC:1.3:CRS84</DefaultSRS>
      <OtherSRS>urn:ogc:def:crs:EPSG::3857</OtherSRS>
      <ows:WGS84BoundingBox>
        <ows:LowerCorner>${minLon} ${minLat}</ows:LowerCorner>
        <ows:UpperCorner>${maxLon} ${maxLat}</ows:UpperCorner>
      </ows:WGS84BoundingBox>
    </FeatureType>`;
  }).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<wfs:WFS_Capabilities
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns="http://www.opengis.net/wfs"
  xmlns:wfs="http://www.opengis.net/wfs"
  xmlns:ows="http://www.opengis.net/ows"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  version="1.1.0"
  xsi:schemaLocation="http://www.opengis.net/wfs http://schemas.opengis.net/wfs/1.1.0/wfs.xsd">

  <ows:ServiceIdentification>
    <ows:Title>OGC Proxy Municipal - WFS</ows:Title>
    <ows:Abstract>Interface GIS commune aux APIs maison</ows:Abstract>
    <ows:ServiceType>WFS</ows:ServiceType>
    <ows:ServiceTypeVersion>1.1.0</ows:ServiceTypeVersion>
  </ows:ServiceIdentification>

  <ows:OperationsMetadata>
    <ows:Operation name="GetCapabilities">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
    </ows:Operation>
    <ows:Operation name="DescribeFeatureType">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="outputFormat">
        <ows:Value>text/xml; subtype=gml/3.1.1</ows:Value>
        <ows:Value>application/json</ows:Value>
      </ows:Parameter>
    </ows:Operation>
    <ows:Operation name="GetFeature">
      <ows:DCP><ows:HTTP>
        <ows:Get xlink:href="${serviceUrl}"/>
        <ows:Post xlink:href="${serviceUrl}"/>
      </ows:HTTP></ows:DCP>
      <ows:Parameter name="resultType">
        <ows:Value>results</ows:Value>
        <ows:Value>hits</ows:Value>
      </ows:Parameter>
      <ows:Parameter name="outputFormat">
        <ows:Value>text/xml; subtype=gml/3.1.1</ows:Value>
        <ows:Value>application/json</ows:Value>
      </ows:Parameter>
    </ows:Operation>
  </ows:OperationsMetadata>

  <FeatureTypeList>
    <Operations>
      <Operation>Query</Operation>
    </Operations>
    ${featureTypes}
  </FeatureTypeList>

  <ogc:Filter_Capabilities>
    <ogc:Spatial_Capabilities>
      <ogc:GeometryOperands>
        <ogc:GeometryOperand>gml:Envelope</ogc:GeometryOperand>
        <ogc:GeometryOperand>gml:Point</ogc:GeometryOperand>
        <ogc:GeometryOperand>gml:Polygon</ogc:GeometryOperand>
      </ogc:GeometryOperands>
      <ogc:SpatialOperators>
        <ogc:SpatialOperator name="BBOX"/>
        <ogc:SpatialOperator name="Intersects"/>
        <ogc:SpatialOperator name="Within"/>
      </ogc:SpatialOperators>
    </ogc:Spatial_Capabilities>
    <ogc:Scalar_Capabilities>
      <ogc:LogicalOperators/>
      <ogc:ComparisonOperators>
        <ogc:ComparisonOperator>EqualTo</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>NotEqualTo</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>LessThan</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>GreaterThan</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>LessThanEqualTo</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>GreaterThanEqualTo</ogc:ComparisonOperator>
        <ogc:ComparisonOperator>Like</ogc:ComparisonOperator>
      </ogc:ComparisonOperators>
    </ogc:Scalar_Capabilities>
    <ogc:Id_Capabilities>
      <ogc:FID/>
    </ogc:Id_Capabilities>
  </ogc:Filter_Capabilities>
</wfs:WFS_Capabilities>`;
}
