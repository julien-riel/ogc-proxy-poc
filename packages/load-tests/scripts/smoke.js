import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const collections = http.get(`${BASE_URL}/ogc/collections`);
  check(collections, {
    'collections returns 200': (r) => r.status === 200,
    'collections has items': (r) => JSON.parse(r.body).collections.length > 0,
  });

  const items = http.get(`${BASE_URL}/ogc/collections/bornes-fontaines/items?limit=10`);
  check(items, {
    'items returns 200': (r) => r.status === 200,
    'items is FeatureCollection': (r) => JSON.parse(r.body).type === 'FeatureCollection',
  });

  const health = http.get(`${BASE_URL}/health`);
  check(health, {
    'health returns 200': (r) => r.status === 200,
  });

  sleep(1);
}
