import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import type { Feature } from 'geojson';
import type { LoadedCollection } from '../types/ogc.js';
import styles from './MapView.module.css';

export interface MapViewProps {
  loadedCollections: Map<string, LoadedCollection>;
  mapStyle?: string;
  onFeatureClick?: (feature: Feature, collectionId: string) => void;
}

const DEFAULT_STYLE = 'https://demotiles.maplibre.org/style.json';

/** Renders a MapLibre map with GeoJSON layers for each loaded collection. */
export function MapView({ loadedCollections, mapStyle, onFeatureClick }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: mapStyle || DEFAULT_STYLE,
      center: [0, 20],
      zoom: 2,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [mapStyle]);

  // Sync collections with map sources/layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncLayers = () => {
      // Remove layers/sources that are no longer loaded
      const currentSources = new Set<string>();
      for (const sourceId of Object.keys(map.getStyle()?.sources ?? {})) {
        if (sourceId.startsWith('ogc-')) {
          currentSources.add(sourceId);
        }
      }

      for (const sourceId of currentSources) {
        const collectionId = sourceId.replace('ogc-', '');
        if (!loadedCollections.has(collectionId)) {
          for (const layer of map.getStyle()?.layers ?? []) {
            if ('source' in layer && layer.source === sourceId) {
              map.removeLayer(layer.id);
            }
          }
          map.removeSource(sourceId);
        }
      }

      // Add or update collections
      for (const [collectionId, loaded] of loadedCollections) {
        const sourceId = `ogc-${collectionId}`;
        const geojson: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: loaded.features,
        };

        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (source) {
          source.setData(geojson);
        } else {
          map.addSource(sourceId, { type: 'geojson', data: geojson });
          addLayersForCollection(map, sourceId, collectionId, loaded.color);
        }
      }
    };

    if (map.isStyleLoaded()) {
      syncLayers();
    } else {
      map.on('load', syncLayers);
      return () => {
        map.off('load', syncLayers);
      };
    }
  }, [loadedCollections]);

  // Handle feature click
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onFeatureClick) return;

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const layerIds = (map.getStyle()?.layers ?? [])
        .filter((l) => l.id.startsWith('ogc-'))
        .map((l) => l.id);

      if (layerIds.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length > 0) {
        const feature = features[0];
        // Extract collectionId from layer metadata set in addLayersForCollection
        const collectionId = (feature.layer.metadata as Record<string, string>)?.collectionId ?? '';
        onFeatureClick(feature as unknown as Feature, collectionId);
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [onFeatureClick]);

  return (
    <div className={styles.container}>
      <div ref={containerRef} className={styles.map} />
    </div>
  );
}

function addLayersForCollection(map: maplibregl.Map, sourceId: string, collectionId: string, color: string) {
  const metadata = { collectionId };

  map.addLayer({
    id: `ogc-${collectionId}-fill`,
    type: 'fill',
    source: sourceId,
    metadata,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: {
      'fill-color': color,
      'fill-opacity': 0.2,
    },
  });
  map.addLayer({
    id: `ogc-${collectionId}-outline`,
    type: 'line',
    source: sourceId,
    metadata,
    filter: ['any', ['==', ['geometry-type'], 'Polygon'], ['==', ['geometry-type'], 'LineString']],
    paint: {
      'line-color': color,
      'line-width': 2,
    },
  });

  map.addLayer({
    id: `ogc-${collectionId}-point`,
    type: 'circle',
    source: sourceId,
    metadata,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': color,
      'circle-radius': 6,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5,
    },
  });

  const interactiveLayerIds = [
    `ogc-${collectionId}-fill`,
    `ogc-${collectionId}-outline`,
    `ogc-${collectionId}-point`,
  ];

  const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
  const onLeave = () => { map.getCanvas().style.cursor = ''; };

  for (const layerId of interactiveLayerIds) {
    map.on('mouseenter', layerId, onEnter);
    map.on('mouseleave', layerId, onLeave);
  }
}
