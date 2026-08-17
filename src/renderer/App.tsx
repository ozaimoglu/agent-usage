import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppSettings, ExecutableId, ProviderId, ProviderSnapshot, ProviderStatus, UsagePayload } from '../common/types';
import { severityForRemaining } from '../common/usage';
import { formatReset } from './formatReset';
import { resolvedLanguage, translator } from './i18n';
import { ProviderIcon } from './ProviderIcon';
import { prioritizeUsageWindows } from './usageGroups';

const empty: UsagePayload = { snapshots: [], refreshing: false };

function BrandMark() {
  return <svg className="brand-mark" viewBox="7 6 156 144" aria-hidden="true">
    <path fill="currentColor" d="M76.4 10.4c-2.9 2.9-3.4 4.1-3.4 7.9 0 4.9 3.2 10 7 11.2 1.8.6 2 1.6 2 8.5v7.9l-20.8.3-20.9.3-4.9 3a24 24 0 0 0-11.1 17.8c-.5 5.3-.7 5.5-3.8 6q-7.2 1.2-10.6 8c-1.8 3.4-2 5.5-1.7 14.8.2 9 .6 11.2 2.4 13.6 2.8 3.8 8.1 7.3 11 7.3 2.2 0 2.4.4 2.4 5.1 0 10.2 4.3 17.9 12.3 22.2 4.1 2.2 5.1 2.2 45.2 2.5 46.2.4 48.9.1 55.5-5.5 5.6-4.8 8-10.2 8-17.9v-6.1l3.8-.7c4.6-.7 8.6-3.6 11-7.9 2.6-4.9 2.4-23-.3-27.6a16 16 0 0 0-10.6-8c-3.3-.7-3.4-.8-4.1-6.8-.8-7-2.4-10.6-6.5-14.5-5.2-5-9.6-5.8-31.4-5.8H87v-7.8c0-7.4.1-7.9 2.5-9 3.2-1.5 6.5-6.8 6.5-10.5 0-3.6-2.3-8.1-5.2-10.1-1.2-.9-4.2-1.6-6.6-1.6-3.7 0-5 .6-7.8 3.4M89 14c5.8 5.8-3.1 14.9-9.2 9.3-2.2-2-2.3-7-.1-9.5 2.1-2.4 6.8-2.3 9.3.2m42 39.2a14 14 0 0 1 6.8 6.8c2.1 4.3 2.2 5.2 2.2 36.1 0 20.1-.4 32.8-1.1 34.6q-2.4 6.1-9.4 9.4c-3.7 1.7-7.3 1.9-45 1.9s-41.3-.2-45-1.9a15 15 0 0 1-9-9.4c-1.2-3-1.5-9-1.5-34.2 0-33.2.2-34.7 5.6-39.6 6.5-6 5.3-5.8 50.4-5.9 41.2 0 41.6 0 46 2.2M24 95.1v17.1l-2.7-.6c-1.6-.4-4-2-5.5-3.7-2.7-2.8-2.8-3.4-2.8-13V84.8l3.4-3.4c1.9-1.9 4.3-3.4 5.5-3.4 2.1 0 2.1.4 2.1 17.1m129.3-14.2c3.4 3.4 4.8 15.6 2.6 23.4-1.1 3.9-5.6 7.7-9.1 7.7-1.6 0-1.8-1.5-1.8-17.1V77.7l3.2.7c1.8.4 4.1 1.5 5.1 2.5" />
    <path fill="currentColor" d="M52.3 79c-4.1 2.5-5.3 4.8-5.3 10.5 0 4 .5 5.2 3.4 8.1s4.1 3.4 8.3 3.4c5.5 0 8.6-1.7 10.8-6a12.1 12.1 0 0 0-17.2-16M64 84c1.2 1.2 2 3.3 2 5.3 0 8.3-11.1 9.8-14.1 1.9-1-2.5 1-7.6 3.3-8.5 2.9-1.2 6.9-.6 8.8 1.3m39.2-5a13 13 0 0 0-5.7 12.6c.9 4.8 6.5 9.4 11.6 9.4q8.3 0 11.4-6.6 3.8-8-3-14.2-6.5-5.8-14.3-1.2m11.5 5.2c3.8 3.6 2.9 8.9-1.9 11.4-3.5 1.8-6.1 1.1-8.8-2.3-2.5-3.3-2.5-5.4.1-8.7s7.3-3.5 10.6-.4m-51.5 36 .3 2.3h42l.3-2.3.3-2.2H62.9z" />
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

function ChevronIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6.5 8 3.5 3.5L13.5 8" /></svg>;
}

function PanelHeader({ t, refreshing = false, onRefresh, onSettings, onBack }: {
  t: ReturnType<typeof translator>;
  refreshing?: boolean;
  onRefresh?: () => void;
  onSettings?: () => void;
  onBack?: () => void;
}) {
  return <>
    <header className="panel-header">
      <div className="brand"><span className="brand-frame"><BrandMark /></span><h1>{t('title')}</h1></div>
      <nav className="header-actions" aria-label={t('actions')}>
        {onBack && <button className="icon-button" aria-label={t('back')} title={t('back')} onClick={onBack}><BackIcon /></button>}
        {onRefresh && <button className="icon-button" disabled={refreshing} aria-label={refreshing ? t('refreshing') : t('refresh')} title={t('refresh')} onClick={onRefresh}><RefreshIcon spinning={refreshing} /></button>}
        {onSettings && <button className="icon-button" aria-label={t('settings')} title={t('settings')} onClick={onSettings}><SettingsIcon /></button>}
        <button className="icon-button danger-button" aria-label={t('quit')} title={t('quit')} onClick={() => void window.agentUsage.view.quit()}><PowerIcon /></button>
      </nav>
    </header>
    {refreshing && <div className="refresh-track" role="status" aria-label={t('refreshing')}><span /></div>}
  </>;
}

function QuotaRail({ remaining, label }: { remaining?: number; label: string }) {
  const normalized = remaining === undefined ? 0 : Math.min(100, Math.max(0, remaining));
  const severity = severityForRemaining(remaining);
  return <div
    className={`quota-rail ${severity}${remaining === undefined ? ' is-empty' : ''}`}
    role="progressbar"
    aria-label={label}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={remaining === undefined ? undefined : Math.round(normalized)}
    aria-valuetext={remaining === undefined ? '—' : `${Math.round(normalized)}%`}
  ><span style={{ width: `${normalized}%` }} /></div>;
}

function StatusBadge({ status, t }: { status: ProviderStatus; t: ReturnType<typeof translator> }) {
  return <span className={`status-badge status-${status}`}><span aria-hidden="true" />{t(status)}</span>;
}

function ProviderRow({ snapshot, language, t }: { snapshot: ProviderSnapshot; language: string; t: ReturnType<typeof translator> }) {
  const compactReset = (resetAt: string | undefined) => formatReset(resetAt, language, t('never')).split(' · ')[0];
  const providerMeta = [
    snapshot.plan,
    snapshot.balance === undefined || snapshot.balance === 0 ? undefined : `${t('balance')} ${snapshot.balance}`,
    snapshot.usageUnavailable ? t('quotaUnavailable') : undefined,
  ].filter(Boolean).join(' · ');
  return <article className={`provider-row provider-${snapshot.status}`}>
    <header className="provider-header">
      <div className="provider-identity">
        <ProviderIcon providerId={snapshot.providerId} />
        <div className="provider-copy">
          <strong>{snapshot.displayName}</strong>
          {providerMeta && <span>{providerMeta}</span>}
        </div>
      </div>
      <StatusBadge status={snapshot.status} t={t} />
    </header>
    {snapshot.windows?.length ? <div className="window-list">{prioritizeUsageWindows(snapshot.windows).map((group, windowIndex) => {
      const remaining = group.primary.remainingPercent;
      const percent = remaining === undefined ? '—' : `${Math.round(remaining)}%`;
      const value = remaining === undefined && group.primary.rawUnit ? group.primary.rawUnit : percent;
      const secondaryRemaining = group.secondary?.remainingPercent;
      return <section className="usage-window" key={`${group.label}-${windowIndex}`}>
        <div className="usage-label"><span>{group.label}</span><strong className={remaining === undefined && group.primary.rawUnit ? 'raw-value' : undefined}>{value}<small>{remaining === undefined ? '' : ` ${t('remaining')}`}</small></strong></div>
        {remaining !== undefined && <QuotaRail remaining={remaining} label={`${group.label}: ${percent} ${t('remaining')}`} />}
        <div className="usage-meta">
          <span>{group.primary.detail || `${t('reset')} · ${compactReset(group.primary.resetAt)}`}</span>
          {group.secondary && <span className="secondary-quota">7D · <strong>{secondaryRemaining === undefined ? '—' : `${Math.round(secondaryRemaining)}%`}</strong></span>}
        </div>
      </section>;
    })}</div> : snapshot.usageUnavailable ? null : <div className="provider-empty"><span aria-hidden="true">—</span><p>{snapshot.error || t('noData')}</p></div>}
    {snapshot.error && snapshot.windows?.length ? <p className="error-text">{snapshot.error}</p> : null}
  </article>;
}

function Dashboard({ payload, language, refresh, openSettings, t }: {
  payload: UsagePayload;
  language: string;
  refresh: () => void;
  openSettings: () => void;
  t: ReturnType<typeof translator>;
}) {
  const lastSync = payload.snapshots.reduce<string | undefined>((latest, snapshot) => !latest || snapshot.fetchedAt > latest ? snapshot.fetchedAt : latest, undefined);

  return <div className="dashboard">
    <section className="overview" aria-labelledby="overview-title">
      <div className="section-heading">
        <h2 id="overview-title">{t('overview')}</h2>
        <div className="sync-time" aria-live="polite"><span>{payload.refreshing ? t('refreshing') : t('lastSync')}</span><strong>{lastSync ? new Intl.DateTimeFormat(language, { timeStyle: 'short' }).format(new Date(lastSync)) : '—'}</strong></div>
      </div>
    </section>
    {payload.snapshots.length ? <section className="provider-table" aria-label={t('providers')}>
      {payload.snapshots.map((snapshot) => <ProviderRow key={snapshot.providerId} snapshot={snapshot} language={language} t={t} />)}
    </section> : <section className="empty-state">
      <h3>{t('noProviders')}</h3>
      <p>{t('noProvidersHint')}</p>
      <button className="secondary-button" onClick={openSettings}>{t('openSettings')}</button>
    </section>}
    {!payload.snapshots.length && <button className="text-button" onClick={refresh}>{t('refresh')}</button>}
  </div>;
}

function SwitchRow({ checked, onChange, label, hint, icon }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string; icon?: ReactNode }) {
  return <label className="switch-row">
    <span className="switch-label">{icon}<span className="switch-copy"><strong>{label}</strong>{hint && <small>{hint}</small>}</span></span>
    <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
  </label>;
}

function Onboarding({ settings, save, t }: { settings: AppSettings; save: (patch: Partial<AppSettings>) => Promise<void>; t: ReturnType<typeof translator> }) {
  const [consent, setConsent] = useState(settings.zaiCredentialConsent);
  const [autostart, setAutostart] = useState(settings.autostart);
  return <section className="onboarding">
    <div className="onboarding-intro"><h2>{t('welcome')}</h2><p>{t('intro')}</p></div>
    <div className="settings-group">
      <SwitchRow checked={autostart} onChange={setAutostart} label={t('autostart')} hint={t('autostartHint')} />
      <SwitchRow checked={consent} onChange={setConsent} label={t('zaiConsent')} hint={t('zaiConsentHint')} />
    </div>
    <button className="primary" onClick={() => save({
      zaiCredentialConsent: consent,
      autostart,
      onboardingComplete: true,
      enabledProviders: { ...settings.enabledProviders, 'zai-coding-plan': consent },
    })}>{t('continue')}</button>
  </section>;
}

const providerOptions: ReadonlyArray<{ id: ProviderId; label: string }> = [
  { id: 'codex', label: 'Codex' },
  { id: 'agy', label: 'Agy / Gemini' },
  { id: 'gemini-cli', label: 'Gemini CLI' },
  { id: 'qwen-code', label: 'Qwen Code' },
  { id: 'opencode', label: 'OpenCode' },
  { id: 'cursor-cli', label: 'Cursor CLI' },
  { id: 'github-copilot', label: 'GitHub Copilot CLI' },
  { id: 'zai-coding-plan', label: 'Z.ai Coding Plan' },
  { id: 'claude-code', label: 'Claude Code' },
];

function SettingsView({ value, save, t }: { value: AppSettings; save: (patch: Partial<AppSettings>) => Promise<void>; t: ReturnType<typeof translator> }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const updatePath = (key: ExecutableId, executablePath: string) => { setSaved(false); setDraft({ ...draft, executableOverrides: { ...draft.executableOverrides, [key]: executablePath } }); };
  const toggleProvider = (id: ProviderId, enabled: boolean) => { setSaved(false); setDraft({ ...draft, enabledProviders: { ...draft.enabledProviders, [id]: enabled } }); };
  const updateDraft = (patch: Partial<AppSettings>) => { setSaved(false); setDraft({ ...draft, ...patch }); };
  const submit = () => save({ onboardingComplete: draft.onboardingComplete, autostart: draft.autostart, language: draft.language, zaiCredentialConsent: draft.zaiCredentialConsent, enabledProviders: draft.enabledProviders, executableOverrides: draft.executableOverrides }).then(() => setSaved(true));

  return <section className="settings-view">
    <div className="page-heading"><h2>{t('settings')}</h2></div>
    <section className="settings-section" aria-labelledby="general-title">
      <h3 id="general-title">{t('general')}</h3>
      <div className="settings-group">
        <label className="select-row"><span><strong>{t('language')}</strong><small>{t('languageHint')}</small></span><select value={draft.language} onChange={(event) => updateDraft({ language: event.target.value as AppSettings['language'] })}><option value="system">{t('system')}</option><option value="tr">{t('turkish')}</option><option value="en">{t('english')}</option></select></label>
        <SwitchRow checked={draft.autostart} onChange={(autostart) => updateDraft({ autostart })} label={t('autostart')} />
      </div>
    </section>
    <section className="settings-section" aria-labelledby="provider-settings-title">
      <h3 id="provider-settings-title">{t('providers')}</h3>
      <div className="settings-group provider-list">
        {providerOptions.map((provider) => <SwitchRow key={provider.id} checked={draft.enabledProviders[provider.id]} onChange={(enabled) => toggleProvider(provider.id, enabled)} label={provider.label} icon={<ProviderIcon providerId={provider.id} />} />)}
      </div>
    </section>
    <div className="settings-group compact-consent"><SwitchRow checked={draft.zaiCredentialConsent} onChange={(zaiCredentialConsent) => updateDraft({ zaiCredentialConsent })} label={t('zaiConsent')} hint={t('zaiConsentHint')} /></div>
    <details className="advanced-settings">
      <summary><span><strong>{t('advanced')}</strong><small>{t('executableHint')}</small></span><ChevronIcon /></summary>
      <div className="advanced-content">
        <label className="field">{t('codexPath')}<input value={draft.executableOverrides.codex ?? ''} onChange={(event) => updatePath('codex', event.target.value)} placeholder="/usr/local/bin/codex" /></label>
        <label className="field">{t('agyPath')}<input value={draft.executableOverrides.agy ?? ''} onChange={(event) => updatePath('agy', event.target.value)} placeholder="/usr/local/bin/agy" /></label>
        <label className="field">{t('claudePath')}<input value={draft.executableOverrides.claude ?? ''} onChange={(event) => updatePath('claude', event.target.value)} placeholder="/usr/local/bin/claude" /></label>
        <label className="field">{t('geminiPath')}<input value={draft.executableOverrides.gemini ?? ''} onChange={(event) => updatePath('gemini', event.target.value)} placeholder="/usr/local/bin/gemini" /></label>
        <label className="field">{t('qwenPath')}<input value={draft.executableOverrides.qwen ?? ''} onChange={(event) => updatePath('qwen', event.target.value)} placeholder="/usr/local/bin/qwen" /></label>
        <label className="field">{t('opencodePath')}<input value={draft.executableOverrides.opencode ?? ''} onChange={(event) => updatePath('opencode', event.target.value)} placeholder="~/.opencode/bin/opencode" /></label>
        <label className="field">{t('cursorPath')}<input value={draft.executableOverrides['cursor-agent'] ?? ''} onChange={(event) => updatePath('cursor-agent', event.target.value)} placeholder="~/.local/bin/cursor-agent" /></label>
        <label className="field">{t('copilotPath')}<input value={draft.executableOverrides.copilot ?? ''} onChange={(event) => updatePath('copilot', event.target.value)} placeholder="/usr/local/bin/copilot" /></label>
      </div>
    </details>
    <div className="settings-actions"><button className="primary" onClick={submit}>{saved ? t('saved') : t('saveChanges')}</button></div>
  </section>;
}

function LoadingPanel({ t }: { t: ReturnType<typeof translator> }) {
  return <div className="skeleton-screen" role="status" aria-label={t('loading')}>
    <div className="skeleton-heading"><span /></div>
    <div className="skeleton-table">{Array.from({ length: 3 }, (_, index) => <div key={index}><span /><span /></div>)}</div>
    <span className="sr-only">{t('loading')}…</span>
  </div>;
}

function usePanelAutoSize(settings: AppSettings | undefined, showSettings: boolean, payload: UsagePayload) {
  useLayoutEffect(() => {
    const shell = document.querySelector<HTMLElement>('.shell');
    const header = shell?.querySelector<HTMLElement>(':scope > .panel-header');
    const content = shell?.querySelector<HTMLElement>(':scope > .panel-content');
    const contentBody = content?.firstElementChild as HTMLElement | null;
    if (!shell || !header || !contentBody) return;

    let frame = 0;
    let lastHeight = 0;
    const measure = () => {
      frame = 0;
      const refreshTrack = shell.querySelector<HTMLElement>(':scope > .refresh-track');
      const shellStyle = window.getComputedStyle(shell);
      const borderHeight = Number.parseFloat(shellStyle.borderTopWidth) + Number.parseFloat(shellStyle.borderBottomWidth);
      const contentHeight = Math.max(contentBody.scrollHeight, contentBody.getBoundingClientRect().height);
      const height = Math.ceil(header.getBoundingClientRect().height + (refreshTrack?.getBoundingClientRect().height ?? 0) + contentHeight + borderHeight);
      if (height < 100 || height === lastHeight) return;
      lastHeight = height;
      void window.agentUsage.view.resize(height).catch(() => undefined);
    };
    const scheduleMeasure = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleMeasure);
    observer?.observe(contentBody);
    scheduleMeasure();
    void document.fonts?.ready.then(scheduleMeasure);
    return () => {
      observer?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [payload, settings, showSettings]);
}

export default function App() {
  const [payload, setPayload] = useState(empty);
  const [settings, setSettings] = useState<AppSettings>();
  const [showSettings, setShowSettings] = useState(false);
  const t = useMemo(() => translator(settings?.language ?? 'system'), [settings?.language]);
  usePanelAutoSize(settings, showSettings, payload);
  useEffect(() => {
    void Promise.all([window.agentUsage.usage.get(), window.agentUsage.settings.get()]).then(([usage, current]) => { setPayload(usage); setSettings(current); });
    return window.agentUsage.usage.onChanged(setPayload);
  }, []);
  useEffect(() => { document.documentElement.lang = resolvedLanguage(settings?.language ?? 'system'); }, [settings?.language]);
  useEffect(() => window.agentUsage.view.onShown(() => {
    queueMicrotask(() => {
      if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) document.activeElement.blur();
    });
  }), []);
  useEffect(() => window.agentUsage.view.onSettings(() => setShowSettings(true)), []);
  const save = async (patch: Partial<AppSettings>) => { const next = await window.agentUsage.settings.update(patch); setSettings(next); };
  const refresh = () => { void window.agentUsage.usage.refresh(); };
  const language = settings?.language === 'system' || !settings ? navigator.language : settings.language;

  if (!settings) return <main className="shell"><PanelHeader t={t} /><div className="panel-content"><LoadingPanel t={t} /></div></main>;
  if (!settings.onboardingComplete) return <main className="shell"><PanelHeader t={t} /><div className="panel-content"><Onboarding settings={settings} save={save} t={t} /></div></main>;
  if (showSettings) return <main className="shell"><PanelHeader t={t} onBack={() => setShowSettings(false)} /><div className="panel-content" key="settings"><SettingsView value={settings} save={save} t={t} /></div></main>;
  return <main className="shell">
    <PanelHeader t={t} refreshing={payload.refreshing} onRefresh={refresh} onSettings={() => setShowSettings(true)} />
    <div className="panel-content" key="dashboard"><Dashboard payload={payload} language={language} refresh={refresh} openSettings={() => setShowSettings(true)} t={t} /></div>
  </main>;
}
