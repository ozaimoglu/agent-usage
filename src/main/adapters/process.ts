import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type SpawnProcess = typeof spawn;

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export interface RunProcessOptions {
  // Some CLIs leave a descendant holding stdout/stderr open after the main
  // process has exited. In that case waiting for `close` can create a false
  // timeout even though the complete response is already buffered.
  resolveOnExit?: boolean;
  exitDrainMs?: number;
}

export function runProcess(
  executable: string,
  args: string[],
  signal: AbortSignal,
  spawnProcess: SpawnProcess = spawn,
  stdin?: string,
  options: RunProcessOptions = {},
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, args, { shell: false, stdio: 'pipe' }) as ChildProcessWithoutNullStreams;
    let stdout = '';
    let stderr = '';
    let settled = false;
    let exitDrainTimer: NodeJS.Timeout | undefined;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (exitDrainTimer) clearTimeout(exitDrainTimer);
      signal.removeEventListener('abort', abort);
      callback();
    };
    const abort = () => {
      child.kill('SIGKILL');
      finish(() => reject(new Error('İstek zaman aşımına uğradı.')));
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
    child.once('error', () => finish(() => reject(new Error('Sağlayıcı komutu başlatılamadı.'))));
    child.once('close', (code) => finish(() => resolve({ stdout, stderr, code })));
    if (options.resolveOnExit) child.once('exit', (code) => {
      exitDrainTimer = setTimeout(() => {
        child.stdout.destroy();
        child.stderr.destroy();
        finish(() => resolve({ stdout, stderr, code }));
      }, options.exitDrainMs ?? 50);
    });
    child.stdin.once('error', () => finish(() => reject(new Error('Sağlayıcı komutuyla iletişim kurulamadı.'))));
    if (signal.aborted) abort();
    else {
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}
