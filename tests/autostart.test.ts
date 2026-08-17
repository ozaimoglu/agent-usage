import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { LinuxAutostart, MacOSAutostart, reconcileAutostart } from '../src/main/autostart';

describe('LinuxAutostart', () => {
  it('starts silently at login while preserving paths with spaces', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'agent-usage-autostart-'));
    try {
      await new LinuxAutostart(root, '/opt/Agent Usage/agent-usage').setEnabled(true);
      const desktop = await readFile(path.join(root, 'autostart', 'agent-usage.desktop'), 'utf8');
      expect(desktop).toContain('Exec="/opt/Agent Usage/agent-usage" --hidden');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('reports startup reconciliation failures instead of hiding them', async () => {
    const reportError = vi.fn();
    const manager = { setEnabled: vi.fn(async () => { throw new Error('disk full'); }) };
    await reconcileAutostart({ onboardingComplete: true, autostart: true }, manager, reportError);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it('does not create autostart before onboarding consent', async () => {
    const reportError = vi.fn();
    const manager = { setEnabled: vi.fn(async () => undefined) };
    await reconcileAutostart({ onboardingComplete: false, autostart: true }, manager, reportError);
    expect(manager.setEnabled).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
  });
});

describe('MacOSAutostart', () => {
  it('registers the packaged application as a hidden login item', async () => {
    const application = { setLoginItemSettings: vi.fn() };
    const autostart = new MacOSAutostart(application);

    await autostart.setEnabled(true);
    expect(application.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: ['--hidden'],
    });

    await autostart.setEnabled(false);
    expect(application.setLoginItemSettings).toHaveBeenLastCalledWith({
      openAtLogin: false,
      args: ['--hidden'],
    });
  });
});
