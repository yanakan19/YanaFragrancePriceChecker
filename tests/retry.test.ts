// scripts/retry.sh wraps the workflows' network steps (npm ci, the Chromium
// download). A retried step must still fail, with its own exit status, when
// every attempt fails, and must not run again once one attempt succeeds.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('../scripts/retry.sh', import.meta.url));
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function retry(args: string[]) {
  const r = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', env: { ...process.env, RETRY_BASE_SECONDS: '0' } });
  return { status: r.status, output: (r.stdout ?? '') + (r.stderr ?? '') };
}

describe('scripts/retry.sh', () => {
  it('stops at the first success, after the failures before it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'retry-'));
    dirs.push(dir);
    const counter = join(dir, 'n');
    // Fails twice, then succeeds.
    const cmd = `n=$(cat "${counter}" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "${counter}"; [ $n -ge 3 ]`;
    const { status, output } = retry(['5', 'bash', '-c', cmd]);
    expect(status).toBe(0);
    expect(readFileSync(counter, 'utf8').trim()).toBe('3');
    expect(output).toContain('attempt 1 of 5');
    expect(output).toContain('attempt 2 of 5');
    expect(output).not.toContain('attempt 3 of 5');
  });

  it('keeps the last exit status, and names the command, when every attempt fails', () => {
    const { status, output } = retry(['3', 'bash', '-c', 'exit 7']);
    expect(status).toBe(7);
    expect(output).toContain("::error::'bash -c exit 7' failed 3 time(s), the last with exit status 7");
  });

  it('runs once when asked for one attempt', () => {
    const { status, output } = retry(['1', 'false']);
    expect(status).toBe(1);
    expect(output).not.toContain('trying again');
  });

  it('refuses a missing or nonsense attempt count', () => {
    expect(retry(['npm', 'ci']).status).toBe(2);
    expect(retry(['0', 'true']).status).toBe(2);
  });
});
