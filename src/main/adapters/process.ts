import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

export type SpawnProcess = typeof spawn;

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
}

export function runProcess(
  executable: string,
  args: string[],
  signal: AbortSignal,
  spawnProcess: SpawnProcess = spawn,
  stdin?: string,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(executable, args, { shell: false, stdio: 'pipe' }) as ChildProcessWithoutNullStreams;
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
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
    child.stdin.once('error', () => finish(() => reject(new Error('Sağlayıcı komutuyla iletişim kurulamadı.'))));
    if (signal.aborted) abort();
    else {
      if (stdin) child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}
