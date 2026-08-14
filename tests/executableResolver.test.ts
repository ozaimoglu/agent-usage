import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveExecutable } from '../src/main/executableResolver';

const temporaryDirectories: string[] = [];

async function temporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'agent-usage-home-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('resolveExecutable', () => {
  it('finds user-local executables when a desktop PATH is empty', async () => {
    const home = await temporaryHome();
    const executable = path.join(home, '.local', 'bin', 'agy');
    await mkdir(path.dirname(executable), { recursive: true });
    await writeFile(executable, '#!/bin/sh\n', { mode: 0o755 });
    await expect(resolveExecutable('agy', undefined, '', home)).resolves.toBe(executable);
  });

  it('finds the newest installed NVM executable', async () => {
    const home = await temporaryHome();
    const older = path.join(home, '.nvm', 'versions', 'node', 'v20.9.0', 'bin', 'codex');
    const newer = path.join(home, '.nvm', 'versions', 'node', 'v22.1.0', 'bin', 'codex');
    await mkdir(path.dirname(older), { recursive: true });
    await mkdir(path.dirname(newer), { recursive: true });
    await writeFile(older, '#!/bin/sh\n', { mode: 0o755 });
    await writeFile(newer, '#!/bin/sh\n', { mode: 0o755 });
    await expect(resolveExecutable('codex', undefined, '', home)).resolves.toBe(newer);
  });
});
