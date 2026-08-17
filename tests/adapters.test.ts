import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { AgyAdapter, parseAgyUsage } from '../src/main/adapters/agy';
import { CodexAdapter, discoverCodexHomes, parseCodexRateLimits } from '../src/main/adapters/codex';

type FakeChild = EventEmitter & {
  stdout: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
  stderr: EventEmitter & { destroy: ReturnType<typeof vi.fn> };
  stdin: EventEmitter & { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; destroyed: boolean; writableEnded: boolean };
  kill: ReturnType<typeof vi.fn>;
};

function childProcess(): FakeChild {
  const child = new EventEmitter() as FakeChild;
  child.stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  child.stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  child.stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
    destroyed: false,
    writableEnded: false,
  });
  child.kill = vi.fn(() => true);
  return Object.assign(child, { spawnargs: [], spawnfile: '', pid: 1, connected: false, exitCode: null, signalCode: null, killed: false, stdio: [] });
}

function fakeSpawn(stdout: string, code = 0) {
  return vi.fn((_file: string, _args: readonly string[], _options: object) => {
    const child = childProcess();
    queueMicrotask(() => {
      if (stdout) child.stdout.emit('data', Buffer.from(stdout));
      child.emit('close', code);
    });
    return child;
  });
}

function interactiveCodexSpawn() {
  return vi.fn((_file: string, _args: readonly string[], _options: object) => {
    const child = childProcess();
    child.stdin.write.mockImplementation((raw: string) => {
      const message = JSON.parse(raw) as { id: number };
      queueMicrotask(() => {
        if (message.id === 1) child.stdout.emit('data', Buffer.from('{"id":1,"result":{}}\n'));
        if (message.id === 2) {
          const result = {
            rateLimits: { primary: { usedPercent: 20 } },
            rateLimitsByLimitId: { codex: { primary: { usedPercent: 20, windowDurationMins: 300, resetsAt: 1_800_000_000 } } },
            credits: { balance: '12.5' },
            planType: 'pro',
          };
          child.stdout.emit('data', Buffer.from(`${JSON.stringify({ id: 2, result })}\n`));
        }
      });
      return true;
    });
    return child;
  });
}

function interactiveCodexProfilesSpawn() {
  return vi.fn((_file: string, _args: readonly string[], options: { env?: NodeJS.ProcessEnv }) => {
    const child = childProcess();
    const plan = options.env?.CODEX_HOME ? 'pro' : 'plus';
    child.stdin.write.mockImplementation((raw: string) => {
      const message = JSON.parse(raw) as { id: number };
      queueMicrotask(() => {
        if (message.id === 1) child.stdout.emit('data', Buffer.from('{"id":1,"result":{}}\n'));
        if (message.id === 2) {
          const result = {
            rateLimits: { planType: plan },
            rateLimitsByLimitId: {
              codex: { planType: plan, primary: { usedPercent: plan === 'pro' ? 10 : 30, windowDurationMins: 300 } },
            },
          };
          child.stdout.emit('data', Buffer.from(`${JSON.stringify({ id: 2, result })}\n`));
        }
      });
      return true;
    });
    return child;
  });
}

describe('CLI adapters', () => {
  it('waits for Codex initialize before requesting quota and cleans up', async () => {
    const spawn = interactiveCodexSpawn();
    const adapter = new CodexAdapter({
      resolve: async () => '/tmp/codex',
      spawnProcess: spawn as never,
      discoverCodexHomes: async () => ['/tmp/codex-profile'],
    });
    const snapshot = await adapter.fetch(new AbortController().signal);
    const child = spawn.mock.results[0].value;

    expect(snapshot).toMatchObject({
      status: 'ok',
      balance: 12.5,
      plan: 'Pro',
      windows: [{ remainingPercent: 80, windowMinutes: 300, resetAt: '2027-01-15T08:00:00.000Z' }],
    });
    expect(spawn).toHaveBeenCalledWith('/tmp/codex', ['app-server', '--listen', 'stdio://'], expect.objectContaining({
      shell: false,
      env: expect.objectContaining({ CODEX_HOME: '/tmp/codex-profile' }),
    }));
    expect(child.stdin.write).toHaveBeenCalledTimes(2);
    expect(JSON.parse(child.stdin.write.mock.calls[0][0])).toMatchObject({ id: 1, method: 'initialize' });
    expect(JSON.parse(child.stdin.write.mock.calls[1][0])).toMatchObject({ id: 2, method: 'account/rateLimits/read' });
    expect(child.stdin.end).toHaveBeenCalledOnce();
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('honors an explicit Codex home and otherwise discovers sibling profiles', async () => {
    await expect(discoverCodexHomes(' /tmp/codex-profile ')).resolves.toEqual(['/tmp/codex-profile']);
    await expect(discoverCodexHomes('', '/home/user', async () => [
      '/home/user/.codex-pro',
      '/home/user/.codex-work',
    ])).resolves.toEqual([undefined, '/home/user/.codex-pro', '/home/user/.codex-work']);
  });

  it('filters model-specific Codex limits instead of presenting them as accounts', () => {
    const parsed = parseCodexRateLimits({
      rateLimits: {
        planType: 'pro',
        rateLimitsByLimitId: {
          codex: {
            planType: 'pro',
            primary: { usedPercent: 20, windowDurationMins: 300 },
          },
          codex_bengalfox: {
            planType: 'pro',
            limitName: 'GPT-5.3-Codex-Spark',
            primary: { usedPercent: 10, windowDurationMins: 300 },
          },
        },
      },
    });
    expect(parsed.windows.map((window) => window.label)).toEqual(['Codex Pro · 5H']);
  });

  it('combines standard Plus and sibling Pro profiles without merging their limits', async () => {
    const spawn = interactiveCodexProfilesSpawn();
    const adapter = new CodexAdapter({
      resolve: async () => '/tmp/codex',
      spawnProcess: spawn as never,
      discoverCodexHomes: async () => [undefined, '/home/user/.codex-pro'],
    });

    await expect(adapter.fetch(new AbortController().signal)).resolves.toMatchObject({
      status: 'ok',
      plan: 'Pro + Plus',
      windows: [
        { label: 'Codex Pro · 5H', remainingPercent: 90 },
        { label: 'Codex Plus · 5H', remainingPercent: 70 },
      ],
    });
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.mock.calls[0][2]).toEqual(expect.objectContaining({ env: expect.not.objectContaining({ CODEX_HOME: expect.anything() }) }));
    expect(spawn.mock.calls[1][2]).toEqual(expect.objectContaining({ env: expect.objectContaining({ CODEX_HOME: '/home/user/.codex-pro' }) }));
  });

  it('flattens Agy 1.1 nested Gemini buckets into quota windows', () => {
    const windows = parseAgyUsage({
      status: 'ok',
      command: { data: { groups: [{
        name: 'Gemini Models',
        buckets: [
          { id: 'weekly', name: 'Weekly Limit Remaining', window: 'weekly', remaining_fraction: 0.75, reset_time: '2026-08-20T12:00:00Z' },
          { id: 'five-hour', name: 'Five Hour Limit Remaining', window: '5h', remaining_fraction: 0.4, reset_time: '2026-08-13T18:00:00Z' },
        ],
      }] } },
    });
    expect(windows).toEqual([
      expect.objectContaining({ label: 'Gemini - 7D', remainingPercent: 75, usedPercent: 25, windowMinutes: 10080, resetAt: '2026-08-20T12:00:00Z' }),
      expect.objectContaining({ label: 'Gemini - 5H', remainingPercent: 40, usedPercent: 60, windowMinutes: 300, resetAt: '2026-08-13T18:00:00Z' }),
    ]);
  });

  it('compacts Claude and GPT Agy quota labels', () => {
    const windows = parseAgyUsage({
      status: 'ok',
      command: { data: { groups: [{
        name: 'Claude and GPT models',
        buckets: [
          { name: 'Weekly', window: 'weekly', remaining_fraction: 0.6 },
          { name: 'Five Hour', window: '5h', remaining_fraction: 0.8 },
        ],
      }] } },
    });
    expect(windows.map((window) => window.label)).toEqual(['Claude/GPT - 7D', 'Claude/GPT - 5H']);
  });

  it('uses Agy non-shell JSON command', async () => {
    const spawn = fakeSpawn('{"status":"ok","data":{"groups":[{"id":"x","remaining_fraction":0.5}]}}');
    const adapter = new AgyAdapter({ resolve: async () => '/tmp/agy', spawnProcess: spawn as never });
    await expect(adapter.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'ok' });
    expect(spawn).toHaveBeenCalledWith('/tmp/agy', ['--print', '/usage', '--output-format', 'json'], expect.objectContaining({ shell: false }));
  });

  it('accepts complete Agy output when a descendant keeps the pipes open', async () => {
    const spawn = vi.fn(() => {
      const child = childProcess();
      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from('{"status":"ok","data":{"groups":[{"id":"x","remaining_fraction":0.5}]}}'));
        child.emit('exit', 0);
      });
      return child;
    });
    const adapter = new AgyAdapter({ resolve: async () => '/tmp/agy', spawnProcess: spawn as never });

    await expect(adapter.fetch(new AbortController().signal)).resolves.toMatchObject({ status: 'ok' });
    expect(spawn.mock.results[0].value.stdout.destroy).toHaveBeenCalledOnce();
    expect(spawn.mock.results[0].value.stderr.destroy).toHaveBeenCalledOnce();
  });

  it('does not expose raw process output in errors', async () => {
    const adapter = new AgyAdapter({ resolve: async () => '/tmp/agy', spawnProcess: fakeSpawn('secret raw output', 1) as never });
    await expect(adapter.fetch(new AbortController().signal)).rejects.toThrow('kota bilgisi alınamadı');
  });

  it('kills a Codex process when aborted', async () => {
    const spawn = vi.fn(() => childProcess());
    const controller = new AbortController();
    const adapter = new CodexAdapter({ resolve: async () => '/tmp/codex', spawnProcess: spawn as never });
    const promise = adapter.fetch(controller.signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    controller.abort();
    await expect(promise).rejects.toThrow('zaman aşımına');
    expect(spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('kills Agy immediately when resolution finishes after timeout', async () => {
    const spawn = vi.fn(() => childProcess());
    const controller = new AbortController();
    controller.abort();
    const adapter = new AgyAdapter({ resolve: async () => '/tmp/agy', spawnProcess: spawn as never });
    await expect(adapter.fetch(controller.signal)).rejects.toThrow('zaman aşımına');
    expect(spawn.mock.results[0].value.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('handles Codex stdin errors without leaking their contents', async () => {
    const spawn = vi.fn(() => childProcess());
    const adapter = new CodexAdapter({ resolve: async () => '/tmp/codex', spawnProcess: spawn as never });
    const promise = adapter.fetch(new AbortController().signal);
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledOnce());
    const child = spawn.mock.results[0].value;
    child.stdin.emit('error', new Error('secret EPIPE detail'));
    await expect(promise).rejects.toThrow('iletişim kurulamadı');
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });
});
