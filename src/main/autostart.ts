import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { AppSettings } from '../common/types';

export interface AutostartManager { setEnabled(enabled: boolean): Promise<void>; }

function quoteDesktop(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export function resolveLaunchCommand(executable = process.execPath, environment = process.env): string {
  return environment.APPIMAGE || executable;
}

export async function reconcileAutostart(
  settings: Pick<AppSettings, 'onboardingComplete' | 'autostart'>,
  manager: AutostartManager,
  reportError: () => void,
): Promise<void> {
  if (!settings.onboardingComplete || !settings.autostart) return;
  try {
    await manager.setEnabled(true);
  } catch {
    reportError();
  }
}

export class LinuxAutostart implements AutostartManager {
  constructor(
    private readonly configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'),
    private readonly launchCommand = resolveLaunchCommand(),
  ) {}
  async setEnabled(enabled: boolean): Promise<void> {
    const file = path.join(this.configHome, 'autostart', 'agent-usage.desktop');
    if (!enabled) { await rm(file, { force: true }); return; }
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    const content = [
      '[Desktop Entry]', 'Type=Application', 'Name=Agent Usage',
      `Exec=${quoteDesktop(this.launchCommand)} --hidden`, 'Terminal=false', 'X-GNOME-Autostart-enabled=true', '',
    ].join('\n');
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }
}

export class NoopAutostart implements AutostartManager {
  async setEnabled(): Promise<void> { /* Future platform implementation. */ }
}
