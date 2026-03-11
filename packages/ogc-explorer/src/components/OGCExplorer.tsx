import { useCallback, useState } from 'react';
import type { Feature } from 'geojson';
import { useOGCClient } from '../hooks/useOGCClient.js';
import { useRequestLog } from '../hooks/useRequestLog.js';
import { getCollectionColor } from '../utils/colors.js';
import type { LoadedCollection, OGCItemsResponse } from '../types/ogc.js';
import { ConnectionBar } from './ConnectionBar.js';
import { CollectionPanel } from './CollectionPanel.js';
import { MapView } from './MapView.js';
import { DebugPanel } from './DebugPanel.js';
import styles from './OGCExplorer.module.css';

export interface OGCExplorerProps {
  defaultUrl?: string;
  mapStyle?: string;
  onCollectionSelect?: (id: string) => void;
  onFeatureClick?: (feature: Feature) => void;
  height?: string;
  className?: string;
}

export function OGCExplorer({
  defaultUrl,
  mapStyle,
  onCollectionSelect,
  onFeatureClick: onFeatureClickProp,
  height = '100vh',
  className,
}: OGCExplorerProps) {
  const { entries, addEntry, clear } = useRequestLog();
  const ogc = useOGCClient({ onRequest: addEntry });
  const [loadedCollections, setLoadedCollections] = useState<Map<string, LoadedCollection>>(new Map());
  const [_selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [colorIndex, setColorIndex] = useState(0);

  const handleConnect = useCallback(
    async (url: string) => {
      setLoadedCollections(new Map());
      setSelectedFeature(null);
      clear();
      await ogc.connect(url);
    },
    [ogc, clear],
  );

  const handleDisconnect = useCallback(() => {
    ogc.disconnect();
    setLoadedCollections(new Map());
    setSelectedFeature(null);
  }, [ogc]);

  const handleToggle = useCallback(
    async (collectionId: string) => {
      if (loadedCollections.has(collectionId)) {
        setLoadedCollections((prev) => {
          const next = new Map(prev);
          next.delete(collectionId);
          return next;
        });
        return;
      }

      onCollectionSelect?.(collectionId);

      try {
        const response: OGCItemsResponse = await ogc.fetchItems(collectionId);
        const collection = ogc.collections.find((c) => c.id === collectionId);
        if (!collection) return;

        const color = getCollectionColor(colorIndex);
        setColorIndex((prev) => prev + 1);

        const nextLink = response.links.find((l) => l.rel === 'next')?.href;

        setLoadedCollections((prev) => {
          const next = new Map(prev);
          next.set(collectionId, {
            id: collectionId,
            metadata: collection,
            features: response.features,
            color,
            numberMatched: response.numberMatched,
            nextLink,
          });
          return next;
        });
      } catch {
        // Error is already captured in the request log
      }
    },
    [loadedCollections, ogc, colorIndex, onCollectionSelect],
  );

  const handleLoadMore = useCallback(
    async (collectionId: string) => {
      const loaded = loadedCollections.get(collectionId);
      if (!loaded?.nextLink) return;

      try {
        const response = await ogc.fetchNextPage(loaded.nextLink);
        const nextLink = response.links.find((l) => l.rel === 'next')?.href;

        setLoadedCollections((prev) => {
          const next = new Map(prev);
          const existing = next.get(collectionId);
          if (!existing) return next;
          next.set(collectionId, {
            ...existing,
            features: [...existing.features, ...response.features],
            nextLink,
          });
          return next;
        });
      } catch {
        // Error is already captured in the request log
      }
    },
    [loadedCollections, ogc],
  );

  const handleFeatureClick = useCallback(
    (feature: Feature, _collectionId: string) => {
      setSelectedFeature(feature);
      onFeatureClickProp?.(feature);
    },
    [onFeatureClickProp],
  );

  return (
    <div className={`${styles.container} ${className ?? ''}`} style={{ height }}>
      <ConnectionBar
        defaultUrl={defaultUrl}
        isConnecting={ogc.isConnecting}
        isConnected={ogc.serverUrl !== null}
        landing={ogc.landing}
        error={ogc.error}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />
      <div className={styles.body}>
        <div className={styles.sidebar}>
          {ogc.conformance && (
            <div className={styles.conformance}>
              {ogc.conformance.conformsTo.length} conformance classes
            </div>
          )}
          <CollectionPanel
            collections={ogc.collections}
            loadedCollections={loadedCollections}
            onToggle={handleToggle}
            onLoadMore={handleLoadMore}
          />
          <DebugPanel entries={entries} />
        </div>
        <MapView
          loadedCollections={loadedCollections}
          mapStyle={mapStyle}
          onFeatureClick={handleFeatureClick}
        />
      </div>
    </div>
  );
}
