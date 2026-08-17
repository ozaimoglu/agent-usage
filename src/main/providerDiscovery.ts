import type { AppSettings, ExecutableId, ProviderId } from '../common/types';
import { resolveExecutable } from './executableResolver';

interface DiscoverableProvider {
  providerId: ProviderId;
  executableId: ExecutableId;
}

export const DISCOVERABLE_PROVIDERS: readonly DiscoverableProvider[] = [
  { providerId: 'codex', executableId: 'codex' },
  { providerId: 'agy', executableId: 'agy' },
  { providerId: 'claude-code', executableId: 'claude' },
  { providerId: 'gemini-cli', executableId: 'gemini' },
  { providerId: 'qwen-code', executableId: 'qwen' },
  { providerId: 'opencode', executableId: 'opencode' },
  { providerId: 'cursor-cli', executableId: 'cursor-agent' },
  { providerId: 'github-copilot', executableId: 'copilot' },
];

export async function discoverInstalledProviders(
  settings: AppSettings,
  resolve: typeof resolveExecutable = resolveExecutable,
): Promise<ProviderId[]> {
  const detected = await Promise.all(DISCOVERABLE_PROVIDERS.map(async ({ providerId, executableId }) => ({
    providerId,
    executable: await resolve(executableId, settings.executableOverrides[executableId]),
  })));
  return detected.filter(({ executable }) => Boolean(executable)).map(({ providerId }) => providerId);
}
