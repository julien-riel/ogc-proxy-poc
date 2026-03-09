import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 50 },
    { duration: '3m', target: 100 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const items = http.get(`${BASE_URL}/ogc/collections/bornes-fontaines/items?limit=10`);
  check(items, {
    'items returns 200 or 429': (r) => r.status === 200 || r.status === 429,
  });

  sleep(0.3);
}
