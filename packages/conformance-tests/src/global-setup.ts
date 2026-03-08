import { spawn, type ChildProcess } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
let mockApi: ChildProcess;
let proxy: ChildProcess;

async function waitForServer(url: string, maxWait = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Server at ${url} did not start within ${maxWait}ms`);
}

export async function setup() {
  mockApi = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: resolve(__dirname, '../../mock-api'),
    stdio: 'pipe',
    env: { ...process.env, PORT: '3001' },
  });

  const { BASE_URL: _, ...cleanEnv } = process.env;
  proxy = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: resolve(__dirname, '../../proxy'),
    stdio: 'pipe',
    env: {
      ...cleanEnv,
      PORT: '3000',
      UPSTREAM_HOST: 'http://localhost:3001',
      RATE_LIMIT_MAX: '0',
    },
  });

  await waitForServer('http://localhost:3001/health');
  await waitForServer('http://localhost:3000/health');
}

export async function teardown() {
  mockApi?.kill();
  proxy?.kill();
}
