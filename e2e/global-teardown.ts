import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { E2E } from './global-setup';

export default async function globalTeardown(): Promise<void> {
  const held = (globalThis as { __e2e?: { servers: { close: () => Promise<void> }[]; child: { kill: (s: string) => void } | null } }).__e2e;
  const kill = (pid: number | undefined) => { if (!pid) return; try { process.kill(-pid, 'SIGTERM'); } catch { try { process.kill(pid, 'SIGTERM'); } catch { /* gone */ } } };
  kill((held?.child as { pid?: number } | null)?.pid);
  for (const s of held?.servers ?? []) await s.close().catch(() => undefined);
  if (!held && existsSync(E2E.stateFile)) {
    try {
      const { pid } = JSON.parse(readFileSync(E2E.stateFile, 'utf8')) as { pid?: number };
      kill(pid);
    } catch {
      // already gone
    }
  }
  if (existsSync(E2E.stateFile)) unlinkSync(E2E.stateFile);
}
