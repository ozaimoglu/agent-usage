import { useEffect, useMemo, useState } from 'react';
import type { AppSettings, ProviderId, ProviderSnapshot, UsagePayload } from '../common/types';
import { severityForRemaining } from '../common/usage';
import { formatReset } from './formatReset';
import { resolvedLanguage, translator } from './i18n';

const empty: UsagePayload = { snapshots: [], refreshing: false };

function BrandMark() {
  return <svg className="brand-mark" viewBox="7 6 156 144" aria-hidden="true">
    <defs><linearGradient id="robot-accent" x1="15" y1="145" x2="150" y2="10"><stop stopColor="#67e8f9" /><stop offset=".52" stopColor="#60a5fa" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
    <path fill="url(#robot-accent)" d="M76.4 10.4c-2.9 2.9-3.4 4.1-3.4 7.9 0 4.9 3.2 10 7 11.2 1.8.6 2 1.6 2 8.5v7.9l-20.8.3-20.9.3-4.9 3a24 24 0 0 0-11.1 17.8c-.5 5.3-.7 5.5-3.8 6q-7.2 1.2-10.6 8c-1.8 3.4-2 5.5-1.7 14.8.2 9 .6 11.2 2.4 13.6 2.8 3.8 8.1 7.3 11 7.3 2.2 0 2.4.4 2.4 5.1 0 10.2 4.3 17.9 12.3 22.2 4.1 2.2 5.1 2.2 45.2 2.5 46.2.4 48.9.1 55.5-5.5 5.6-4.8 8-10.2 8-17.9v-6.1l3.8-.7c4.6-.7 8.6-3.6 11-7.9 2.6-4.9 2.4-23-.3-27.6a16 16 0 0 0-10.6-8c-3.3-.7-3.4-.8-4.1-6.8-.8-7-2.4-10.6-6.5-14.5-5.2-5-9.6-5.8-31.4-5.8H87v-7.8c0-7.4.1-7.9 2.5-9 3.2-1.5 6.5-6.8 6.5-10.5 0-3.6-2.3-8.1-5.2-10.1-1.2-.9-4.2-1.6-6.6-1.6-3.7 0-5 .6-7.8 3.4M89 14c5.8 5.8-3.1 14.9-9.2 9.3-2.2-2-2.3-7-.1-9.5 2.1-2.4 6.8-2.3 9.3.2m42 39.2a14 14 0 0 1 6.8 6.8c2.1 4.3 2.2 5.2 2.2 36.1 0 20.1-.4 32.8-1.1 34.6q-2.4 6.1-9.4 9.4c-3.7 1.7-7.3 1.9-45 1.9s-41.3-.2-45-1.9a15 15 0 0 1-9-9.4c-1.2-3-1.5-9-1.5-34.2 0-33.2.2-34.7 5.6-39.6 6.5-6 5.3-5.8 50.4-5.9 41.2 0 41.6 0 46 2.2M24 95.1v17.1l-2.7-.6c-1.6-.4-4-2-5.5-3.7-2.7-2.8-2.8-3.4-2.8-13V84.8l3.4-3.4c1.9-1.9 4.3-3.4 5.5-3.4 2.1 0 2.1.4 2.1 17.1m129.3-14.2c3.4 3.4 4.8 15.6 2.6 23.4-1.1 3.9-5.6 7.7-9.1 7.7-1.6 0-1.8-1.5-1.8-17.1V77.7l3.2.7c1.8.4 4.1 1.5 5.1 2.5" />
    <path fill="url(#robot-accent)" d="M52.3 79c-4.1 2.5-5.3 4.8-5.3 10.5 0 4 .5 5.2 3.4 8.1s4.1 3.4 8.3 3.4c5.5 0 8.6-1.7 10.8-6a12.1 12.1 0 0 0-17.2-16M64 84c1.2 1.2 2 3.3 2 5.3 0 8.3-11.1 9.8-14.1 1.9-1-2.5 1-7.6 3.3-8.5 2.9-1.2 6.9-.6 8.8 1.3m39.2-5a13 13 0 0 0-5.7 12.6c.9 4.8 6.5 9.4 11.6 9.4q8.3 0 11.4-6.6 3.8-8-3-14.2-6.5-5.8-14.3-1.2m11.5 5.2c3.8 3.6 2.9 8.9-1.9 11.4-3.5 1.8-6.1 1.1-8.8-2.3-2.5-3.3-2.5-5.4.1-8.7s7.3-3.5 10.6-.4m-51.5 36 .3 2.3h42l.3-2.3.3-2.2H62.9z" />
  </svg>;
}

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return <svg className={spinning ? 'spin' : undefined} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.35 5.65M20 5v6h-6" /></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4Z" /><path d="m19.4 15 .1.1-1.8 3.1-.2-.1-2-.8a8 8 0 0 1-2 .9l-.3 2.1h-3.6l-.3-2.1a8 8 0 0 1-2-.9l-2 .8-.2.1-1.8-3.1.1-.1 1.7-1.3a8 8 0 0 1 0-2.3L3.5 10v-.2l1.8-3.1h.2l2 .8a8 8 0 0 1 2-.9l.3-2.1h3.6l.3 2.1a8 8 0 0 1 2 .9l2-.8h.2l1.8 3.1v.2L18 11.3a8 8 0 0 1 0 2.3l1.4 1.4Z" /></svg>;
}

function PowerIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v9" /><path d="M7.1 5.8a8 8 0 1 0 9.8 0" /></svg>;
}

function BackIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>;
}

function PanelHeader({ t, refreshing = false, onRefresh, onSettings, onBack }: {
  t: ReturnType<typeof translator>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onSettings?: () => void;
  onBack?: () => void;
}) {
  return <header className="panel-header">
    <div className="brand"><BrandMark /><div><h1>{t('title')}</h1><span>{t('subtitle')}</span></div></div>
    <nav className="header-actions" aria-label={t('title')}>
      {onBack && <button className="icon-button" aria-label={t('back')} title={t('back')} onClick={onBack}><BackIcon /></button>}
      {onRefresh && <button className="icon-button" disabled={refreshing} aria-label={refreshing ? t('refreshing') : t('refresh')} title={t('refresh')} onClick={onRefresh}><RefreshIcon spinning={refreshing} /></button>}
      {onSettings && <button className="icon-button" aria-label={t('settings')} title={t('settings')} onClick={onSettings}><SettingsIcon /></button>}
      <button className="icon-button danger-button" aria-label={t('quit')} title={t('quit')} onClick={() => void window.agentUsage.view.quit()}><PowerIcon /></button>
    </nav>
  </header>;
}

function ProviderCard({ snapshot, language, t }: { snapshot: ProviderSnapshot; language: string; t: ReturnType<typeof translator> }) {
  return <article className={`card status-${snapshot.status}`}>
    <header><strong>{snapshot.displayName}</strong><span className="status">{t(snapshot.status)}</span></header>
    {snapshot.plan && <div className="muted">{snapshot.plan}</div>}
    {snapshot.windows?.length ? snapshot.windows.map((window, index) => {
      const remaining = window.remainingPercent;
      const severity = severityForRemaining(remaining);
      return <section className="window" key={`${window.label}-${index}`}>
        <div className="row"><span>{window.label}</span><b>{remaining === undefined ? '—' : `${Math.round(remaining)}% ${t('remaining')}`}</b></div>
        <div className={`progress ${severity}`}><span style={{ width: `${remaining ?? 0}%` }} /></div>
        <div className="details"><span>{window.usedPercent === undefined ? '' : `${Math.round(window.usedPercent)}% ${t('used')}`}</span><span>{t('reset')}: {formatReset(window.resetAt, language, t('never'))}</span></div>
      </section>;
    }) : <p className="muted">{snapshot.error || t('noData')}</p>}
    {snapshot.balance !== undefined && <div className="balance">{t('balance')}: {snapshot.balance}</div>}
    {snapshot.error && snapshot.windows?.length ? <p className="error-text">{snapshot.error}</p> : null}
    <footer>{t('updated')}: {new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(new Date(snapshot.fetchedAt))}</footer>
  </article>;
}

function Onboarding({ settings, save, t }: { settings: AppSettings; save: (patch: Partial<AppSettings>) => Promise<void>; t: ReturnType<typeof translator> }) {
  const [consent, setConsent] = useState(settings.zaiCredentialConsent);
  const [autostart, setAutostart] = useState(settings.autostart);
  return <section className="onboarding"><h2>{t('welcome')}</h2><p>{t('intro')}</p>
    <label><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} /> {t('zaiConsent')}</label>
    <label><input type="checkbox" checked={autostart} onChange={(event) => setAutostart(event.target.checked)} /> {t('autostart')}</label>
    <button className="primary" onClick={() => save({ zaiCredentialConsent: consent, autostart, onboardingComplete: true })}>{t('continue')}</button>
  </section>;
}

const providerOptions: ReadonlyArray<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'agy', label: 'Agy / Gemini' },
  { id: 'zai-coding-plan', label: 'Z.ai Coding Plan' },
  { id: 'claude-code', label: 'Claude Code' },
];

function SettingsView({ value, save, t }: { value: AppSettings; save: (patch: Partial<AppSettings>) => Promise<void>; t: ReturnType<typeof translator> }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const updatePath = (key: 'codex' | 'agy' | 'claude', executablePath: string) => setDraft({ ...draft, executableOverrides: { ...draft.executableOverrides, [key]: executablePath } });
  const toggleProvider = (id: ProviderId, enabled: boolean) => setDraft({ ...draft, enabledProviders: { ...draft.enabledProviders, [id]: enabled } });
  return <section className="settings-view">
    <label className="field">{t('language')}<select value={draft.language} onChange={(event) => setDraft({ ...draft, language: event.target.value as AppSettings['language'] })}><option value="system">{t('system')}</option><option value="tr">{t('turkish')}</option><option value="en">{t('english')}</option></select></label>
    <section className="provider-settings" aria-labelledby="provider-settings-title">
      <h2 id="provider-settings-title">{t('providers')}</h2>
      <p>{t('providerHint')}</p>
      <div className="provider-list">
        {providerOptions.map((provider) => <label className="provider-toggle" key={provider.id}>
          <span>{provider.label}</span>
          <input type="checkbox" aria-label={provider.label} checked={draft.enabledProviders[provider.id]} onChange={(event) => toggleProvider(provider.id, event.target.checked)} />
        </label>)}
      </div>
    </section>
    <label><input type="checkbox" checked={draft.autostart} onChange={(event) => setDraft({ ...draft, autostart: event.target.checked })} /> {t('autostart')}</label>
    <label><input type="checkbox" checked={draft.zaiCredentialConsent} onChange={(event) => setDraft({ ...draft, zaiCredentialConsent: event.target.checked })} /> {t('zaiConsent')}</label>
    <label className="field">{t('codexPath')}<input value={draft.executableOverrides.codex ?? ''} onChange={(event) => updatePath('codex', event.target.value)} placeholder="/usr/local/bin/codex" /></label>
    <label className="field">{t('agyPath')}<input value={draft.executableOverrides.agy ?? ''} onChange={(event) => updatePath('agy', event.target.value)} placeholder="/usr/local/bin/agy" /></label>
    <label className="field">{t('claudePath')}<input value={draft.executableOverrides.claude ?? ''} onChange={(event) => updatePath('claude', event.target.value)} placeholder="/home/user/.local/bin/claude" /></label>
    <small>{t('executableHint')}</small><button className="primary" onClick={() => save({ onboardingComplete: draft.onboardingComplete, autostart: draft.autostart, language: draft.language, zaiCredentialConsent: draft.zaiCredentialConsent, enabledProviders: draft.enabledProviders, executableOverrides: draft.executableOverrides }).then(() => setSaved(true))}>{saved ? t('saved') : t('continue')}</button>
  </section>;
}

export default function App() {
  const [payload, setPayload] = useState(empty);
  const [settings, setSettings] = useState<AppSettings>();
  const [showSettings, setShowSettings] = useState(false);
  const t = useMemo(() => translator(settings?.language ?? 'system'), [settings?.language]);
  useEffect(() => {
    void Promise.all([window.agentUsage.usage.get(), window.agentUsage.settings.get()]).then(([usage, current]) => { setPayload(usage); setSettings(current); });
    return window.agentUsage.usage.onChanged(setPayload);
  }, []);
  useEffect(() => {
    document.documentElement.lang = resolvedLanguage(settings?.language ?? 'system');
  }, [settings?.language]);
  useEffect(() => window.agentUsage.view.onSettings(() => setShowSettings(true)), []);
  const save = async (patch: Partial<AppSettings>) => { const next = await window.agentUsage.settings.update(patch); setSettings(next); };
  const refresh = () => { void window.agentUsage.usage.refresh(); };

  if (!settings) return <main className="shell"><PanelHeader t={t} /><div className="loading">{t('loading')}…</div></main>;
  if (!settings.onboardingComplete) return <main className="shell"><PanelHeader t={t} /><div className="panel-content"><Onboarding settings={settings} save={save} t={t} /></div></main>;
  if (showSettings) return <main className="shell"><PanelHeader t={t} onBack={() => setShowSettings(false)} /><div className="panel-content"><SettingsView value={settings} save={save} t={t} /></div></main>;
  return <main className="shell">
    <PanelHeader t={t} refreshing={payload.refreshing} onRefresh={refresh} onSettings={() => setShowSettings(true)} />
    <div className="panel-content"><div className="cards">{payload.snapshots.map((snapshot) => <ProviderCard key={snapshot.providerId} snapshot={snapshot} language={settings.language === 'system' ? navigator.language : settings.language} t={t} />)}</div></div>
  </main>;
}
