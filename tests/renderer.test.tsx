// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/renderer/App';
import type { AppSettings, RendererApi } from '../src/common/types';

const settings: AppSettings = { version: 1, onboardingComplete: true, autostart: true, language: 'en', zaiCredentialConsent: false, enabledProviders: { codex: true, agy: true, 'zai-coding-plan': true, 'claude-code': false }, executableOverrides: {} };

describe('renderer', () => {
  it('renders provider states, syncs document language and exposes header actions', async () => {
    const quit = vi.fn(async () => undefined);
    const updateSettings = vi.fn(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    const api: RendererApi = {
      view: { quit, onSettings: () => () => undefined },
      usage: {
        get: async () => ({ refreshing: false, snapshots: [
          { providerId: 'ok', displayName: 'Codex', status: 'ok', fetchedAt: new Date().toISOString(), windows: [{ label: '5 hour', remainingPercent: 19, usedPercent: 81 }] },
          { providerId: 'stale', displayName: 'Agy', status: 'stale', fetchedAt: new Date().toISOString(), windows: [{ label: 'weekly', remainingPercent: 9 }], error: 'offline' },
          { providerId: 'error', displayName: 'Broken', status: 'error', fetchedAt: new Date().toISOString(), error: 'failed' },
          { providerId: 'none', displayName: 'Z.ai Coding Plan', status: 'unconfigured', fetchedAt: new Date().toISOString(), error: 'permission' },
        ] }),
        refresh: vi.fn(), onChanged: () => () => undefined,
      },
      settings: { get: async () => settings, update: updateSettings },
    };
    window.agentUsage = api;
    render(<App />);

    expect(await screen.findByText('Codex')).toBeInTheDocument();
    expect(document.querySelector('.brand-mark')?.getAttribute('viewBox')).toBe('7 6 156 144');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('19% remaining')).toBeInTheDocument();
    expect(screen.getByText('Stale data')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const claudeToggle = await screen.findByRole('checkbox', { name: 'Claude Code' });
    expect(claudeToggle).not.toBeChecked();
    fireEvent.click(claudeToggle);
    expect(claudeToggle).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ enabledProviders: expect.objectContaining({ 'claude-code': true }) })));
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    expect(quit).toHaveBeenCalledOnce();
  });
});
