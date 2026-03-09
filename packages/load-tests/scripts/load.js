import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 20 },
    { duration: '3m', target: 50 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const items = http.get(`${BASE_URL}/ogc/collections/bornes-fontaines/items?limit=10`);
  check(items, {
    'items returns 200': (r) => r.status === 200,
  });

  // WFS GetFeature
  const wfs = http.get(`${BASE_URL}/wfs?request=GetFeature&typeName=bornes-fontaines&maxFeatures=10`);
  check(wfs, {
    'WFS returns 200': (r) => r.status === 200,
  });

  sleep(0.5);
}
