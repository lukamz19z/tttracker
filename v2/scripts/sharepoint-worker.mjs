import nextEnv from '@next/env';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
nextEnv.loadEnvConfig(root, true);
const secret = process.env.CRON_SECRET;
const count = Number(process.argv[2] ?? 1);
if (!secret || Buffer.byteLength(secret) < 32) {
  console.error('CRON_SECRET must be configured server-side with at least 32 bytes.');
  process.exit(1);
}
if (!Number.isInteger(count) || count < 1 || count > 25) {
  console.error('Choose 1–25 worker invocations: npm run worker:sharepoint -- 1');
  process.exit(1);
}
try {
  const origin = new URL(process.env.NEXT_PUBLIC_APP_URL ?? '');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if ((!local && origin.protocol !== 'https:') || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error('Invalid application origin');
  const url = new URL('/api/integrations/sharepoint/worker', origin);
  for (let i = 0; i < count; i++) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${secret}` }, redirect: 'error', signal: AbortSignal.timeout(250000) });
    if (!response.ok) { console.error(`Worker request failed (HTTP ${response.status}). Check worker configuration and server availability.`); process.exitCode = 1; break; }
    const result = await response.json();
    console.log(`SharePoint worker: ${Number(result.processed) || 0} job processed; ${Number(result.deferred) || 0} deferred.`);
    if (!result.processed) break;
  }
} catch {
  console.error('Could not reach the configured SharePoint worker. Check NEXT_PUBLIC_APP_URL and start V2.');
  process.exitCode = 1;
}
