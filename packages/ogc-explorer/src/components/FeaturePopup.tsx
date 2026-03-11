import type { Feature } from 'geojson';
import styles from './FeaturePopup.module.css';

export interface FeaturePopupProps {
  feature: Feature;
}

/** Renders a key/value table of feature properties for use inside a MapLibre popup. */
export function FeaturePopup({ feature }: FeaturePopupProps) {
  const properties = feature.properties ?? {};
  const entries = Object.entries(properties);

  return (
    <div className={styles.popup}>
      {feature.id != null && <div className={styles.featureId}>ID: {String(feature.id)}</div>}
      {entries.length === 0 ? (
        <p>No properties</p>
      ) : (
        <table className={styles.table}>
          <tbody>
            {entries.map(([key, value]) => (
              <tr key={key}>
                <th>{key}</th>
                <td>{value == null ? '\u2014' : String(value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
