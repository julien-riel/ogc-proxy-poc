import { useState } from 'react';
import type { OGCLandingPage } from '../types/ogc.js';
import styles from './ConnectionBar.module.css';

export interface ConnectionBarProps {
  defaultUrl?: string;
  isConnecting: boolean;
  isConnected: boolean;
  landing: OGCLandingPage | null;
  error: string | null;
  onConnect: (url: string) => void;
  onDisconnect: () => void;
}

export function ConnectionBar({
  defaultUrl = '',
  isConnecting,
  isConnected,
  landing,
  error,
  onConnect,
  onDisconnect,
}: ConnectionBarProps) {
  const [url, setUrl] = useState(defaultUrl);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onConnect(url.trim());
    }
  };

  return (
    <form className={styles.bar} onSubmit={handleSubmit}>
      <input
        className={styles.input}
        type="url"
        placeholder="https://server.com/ogc"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={isConnecting}
      />
      {isConnected ? (
        <button className={styles.button} type="button" onClick={onDisconnect}>
          Disconnect
        </button>
      ) : (
        <button className={styles.button} type="submit" disabled={isConnecting || !url.trim()}>
          {isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      )}
      {landing?.title && <span className={styles.serverInfo}>{landing.title}</span>}
      {error && <span className={styles.error}>{error}</span>}
    </form>
  );
}
