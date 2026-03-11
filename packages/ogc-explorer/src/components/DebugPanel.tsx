import { useState } from 'react';
import type { RequestLogEntry } from '../types/ogc.js';
import styles from './DebugPanel.module.css';

export interface DebugPanelProps {
  entries: RequestLogEntry[];
}

export function DebugPanel({ entries }: DebugPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className={styles.panel}>
      <div className={styles.header} onClick={() => setIsOpen(!isOpen)}>
        <span>Debug ({entries.length} requests)</span>
        <span className={`${styles.toggle} ${isOpen ? styles.toggleOpen : ''}`}>&#9654;</span>
      </div>
      {isOpen && (
        <div className={styles.content}>
          {entries.map((entry) => (
            <div key={entry.id}>
              <div className={styles.entry} onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}>
                <span className={styles.method}>{entry.method}</span>
                <span className={styles.url} title={entry.url}>
                  {entry.url}
                </span>
                <span className={`${styles.status} ${entry.status >= 200 && entry.status < 300 ? styles.statusOk : styles.statusError}`}>
                  {entry.status}
                </span>
                <span className={styles.duration}>{entry.duration}ms</span>
                <button
                  className={styles.copyButton}
                  title="Copy URL"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(entry.url);
                  }}
                >
                  &#128203;
                </button>
              </div>
              {expandedId === entry.id && entry.responseBody != null && (
                <div className={styles.jsonViewer}>
                  <pre className={styles.jsonPre}>{JSON.stringify(entry.responseBody, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
