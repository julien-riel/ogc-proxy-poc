import 'maplibre-gl/dist/maplibre-gl.css';
import { OGCExplorer } from '@ogc-proxy/ogc-explorer';
import '@ogc-proxy/ogc-explorer/style.css';

export function App() {
  return (
    <OGCExplorer
      defaultUrl="http://localhost:3000"
      height="100vh"
    />
  );
}
