import { constants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const STANDARD_EXECUTABLE_DIRS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/opt/local/bin',
  '/usr/bin',
  '/snap/bin',
];

async function nvmCandidates(name: string, homeDirectory: string): Promise<string[]> {
  const versionsRoot = path.join(homeDirectory, '.nvm', 'versions', 'node');
  try {
    const versions = (await readdir(versionsRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    return versions.map((version) => path.join(versionsRoot, version, 'bin', name));
  } catch {
    return [];
  }
}

export async function resolveExecutable(
  name: string,
  override?: string,
  envPath = process.env.PATH,
  homeDirectory = os.homedir(),
): Promise<string | undefined> {
  const userDirs = [
    path.join(homeDirectory, '.local', 'bin'),
    path.join(homeDirectory, '.npm-global', 'bin'),
    path.join(homeDirectory, '.nvm', 'current', 'bin'),
    path.join(homeDirectory, '.volta', 'bin'),
    path.join(homeDirectory, '.opencode', 'bin'),
    path.join(homeDirectory, '.qwen', 'bin'),
    path.join(homeDirectory, '.gemini', 'bin'),
  ];
  const candidates = override
    ? [override]
    : [
        ...(envPath?.split(path.delimiter) ?? []).map((directory) => path.join(directory, name)),
        ...userDirs.map((directory) => path.join(directory, name)),
        ...await nvmCandidates(name, homeDirectory),
        ...STANDARD_EXECUTABLE_DIRS.map((directory) => path.join(directory, name)),
      ];
  for (const candidate of [...new Set(candidates)]) {
    if (!path.isAbsolute(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next conventional location.
    }
  }
  return undefined;
}
