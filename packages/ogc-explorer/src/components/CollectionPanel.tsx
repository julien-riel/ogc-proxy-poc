import type { OGCCollection, LoadedCollection } from '../types/ogc.js';
import styles from './CollectionPanel.module.css';

export interface CollectionPanelProps {
  collections: OGCCollection[];
  loadedCollections: Map<string, LoadedCollection>;
  onToggle: (collectionId: string) => void;
  onLoadMore: (collectionId: string) => void;
}

const GEOMETRY_ICONS: Record<string, string> = {
  point: '\u25CF',
  multipoint: '\u25CF',
  linestring: '\u2501',
  multilinestring: '\u2501',
  polygon: '\u2B21',
  multipolygon: '\u2B21',
};

function getGeometryIcon(collection: OGCCollection, loaded?: LoadedCollection): string {
  const itemType = collection.itemType?.toLowerCase();
  if (itemType && GEOMETRY_ICONS[itemType]) return GEOMETRY_ICONS[itemType];

  if (loaded?.features.length) {
    const geomType = loaded.features[0].geometry?.type.toLowerCase().replace('multi', '');
    if (geomType && GEOMETRY_ICONS[geomType]) return GEOMETRY_ICONS[geomType];
  }

  return '?';
}

export function CollectionPanel({ collections, loadedCollections, onToggle, onLoadMore }: CollectionPanelProps) {
  if (collections.length === 0) {
    return <div className={styles.empty}>Connect to a server to see collections</div>;
  }

  return (
    <div className={styles.panel}>
      {collections.map((col) => {
        const loaded = loadedCollections.get(col.id);
        const isActive = !!loaded;

        return (
          <div key={col.id} className={styles.item} onClick={() => onToggle(col.id)}>
            <input
              className={styles.checkbox}
              type="checkbox"
              checked={isActive}
              onChange={() => onToggle(col.id)}
              onClick={(e) => e.stopPropagation()}
              style={{ '--collection-color': loaded?.color } as React.CSSProperties}
            />
            {loaded && (
              <span className={styles.colorDot} style={{ backgroundColor: loaded.color }} />
            )}
            <div className={styles.info}>
              <p className={styles.title}>
                <span className={styles.geometryIcon}>{getGeometryIcon(col, loaded)}</span>
                {col.title || col.id}
              </p>
              {col.description && <p className={styles.description}>{col.description}</p>}
              {loaded && (
                <p className={styles.featureCount}>
                  {loaded.features.length} features
                  {loaded.numberMatched != null && ` / ${loaded.numberMatched} total`}
                </p>
              )}
              {loaded?.nextLink && (
                <button
                  className={styles.loadMore}
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadMore(col.id);
                  }}
                >
                  Load more
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
