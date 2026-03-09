# Load Tests

k6 load test scripts for the OGC proxy.

## Prerequisites

Install k6: https://k6.io/docs/getting-started/installation/

## Usage

Start the proxy first, then run:

```bash
# Smoke test (1 VU, 30s)
npm run smoke

# Load test (ramp to 50 VU, 5m)
npm run load

# Stress test (ramp to 200 VU, 10m)
npm run stress
```

Override the base URL:
```bash
k6 run -e BASE_URL=https://proxy.example.com scripts/load.js
```

## Export results

```bash
k6 run --out json=results.json scripts/load.js
```
