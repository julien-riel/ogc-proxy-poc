export const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

export async function fetchJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/json' },
  });
  return { status: res.status, body: await res.json() };
}

export async function fetchGeoJson(path: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: 'application/geo+json' },
  });
  return { status: res.status, body: await res.json(), contentType: res.headers.get('content-type') };
}
