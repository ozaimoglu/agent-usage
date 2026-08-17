// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/renderer/App';
import type { AppSettings, RendererApi } from '../src/common/types';

const settings: AppSettings = { version: 1, onboardingComplete: true, autostart: true, language: 'en', zaiCredentialConsent: false, enabledProviders: { codex: true, agy: true, 'gemini-cli': false, 'qwen-code': false, opencode: false, 'cursor-cli': false, 'github-copilot': false, 'zai-coding-plan': true, 'claude-code': false }, autoDetectedProviders: [], providerAutoSetupVersion: 1, executableOverrides: {} };

describe('renderer', () => {
  it('renders provider states, syncs document language and exposes header actions', async () => {
    const quit = vi.fn(async () => undefined);
    let shownListener: () => void = () => undefined;
    const updateSettings = vi.fn(async (patch: Partial<AppSettings>) => ({ ...settings, ...patch }));
    const api: RendererApi = {
      view: { quit, resize: vi.fn(async () => undefined), onShown: (listener) => { shownListener = listener; return () => undefined; }, onSettings: () => () => undefined },
      usage: {
        get: async () => ({ refreshing: false, snapshots: [
          { providerId: 'codex', displayName: 'Codex', status: 'ok', fetchedAt: new Date().toISOString(), windows: [{ label: '5 hour', remainingPercent: 19, usedPercent: 81 }] },
          { providerId: 'agy', displayName: 'Agy', status: 'stale', fetchedAt: new Date().toISOString(), windows: [{ label: 'weekly', remainingPercent: 9 }], error: 'offline' },
          { providerId: 'claude-code', displayName: 'Broken', status: 'error', fetchedAt: new Date().toISOString(), error: 'failed' },
          { providerId: 'zai-coding-plan', displayName: 'Z.ai Coding Plan', status: 'unconfigured', fetchedAt: new Date().toISOString(), error: 'permission' },
          { providerId: 'opencode', displayName: 'OpenCode', status: 'ok', fetchedAt: new Date().toISOString(), plan: 'CLI', usageUnavailable: true },
        ] }),
        refresh: vi.fn(), onChanged: () => () => undefined,
      },
      settings: { get: async () => settings, update: updateSettings },
    };
    window.agentUsage = api;
    render(<App />);

    expect(await screen.findByText('Codex')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-provider-icon]')).toHaveLength(5);
    expect(document.querySelector('[data-provider-icon="agy"]')).toHaveClass('provider-icon-agy');
    expect(document.querySelector('.brand-mark')?.getAttribute('viewBox')).toBe('7 6 156 144');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByRole('heading', { name: 'Usage' })).toHaveClass('sr-only');
    expect(document.querySelector('.overview > .sync-time')).toBeInTheDocument();
    expect(screen.getByText('19%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: '5 hour: 19% left' })).toHaveAttribute('aria-valuenow', '19');
    expect(screen.getByText('Stale data')).toBeInTheDocument();
    expect(screen.getByText('Setup needed')).toBeInTheDocument();
    expect(screen.getByText('failed')).toBeInTheDocument();
    expect(screen.getByText('CLI · Remaining quota unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    refreshButton.focus();
    expect(document.activeElement).toBe(refreshButton);
    shownListener();
    await waitFor(() => expect(document.activeElement).not.toBe(refreshButton));
    const dashboardContent = document.querySelector<HTMLElement>('.panel-content');
    if (dashboardContent) dashboardContent.scrollTop = 120;
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    const claudeToggle = await screen.findByRole('checkbox', { name: 'Claude Code' });
    expect(document.querySelector('.panel-content')).not.toBe(dashboardContent);
    expect(document.querySelector<HTMLElement>('.panel-content')?.scrollTop).toBe(0);
    expect(document.querySelectorAll('[data-provider-icon]')).toHaveLength(9);
    expect(document.querySelector('[data-provider-icon="qwen-code"]')).toHaveClass('provider-icon-qwen-code');
    expect(document.querySelector('[data-provider-icon="cursor-cli"]')).toHaveClass('provider-icon-cursor-cli');
    expect(document.querySelector('[data-provider-icon="github-copilot"]')).toHaveClass('provider-icon-github-copilot');
    expect(claudeToggle).not.toBeChecked();
    fireEvent.click(claudeToggle);
    expect(claudeToggle).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith(expect.objectContaining({ enabledProviders: expect.objectContaining({ 'claude-code': true }) })));
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    expect(quit).toHaveBeenCalledOnce();
  });
});
