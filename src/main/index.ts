import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, Tray } from 'electron';
import log from 'electron-log/main';
import path from 'node:path';
import type { AppSettings, ProviderId, UsagePayload } from '../common/types';
import { IPC } from '../common/types';
import { AgyAdapter } from './adapters/agy';
import { ClaudeAdapter } from './adapters/claude';
import { CodexAdapter } from './adapters/codex';
import { InstalledCliAdapter } from './adapters/installedCli';
import { ZaiAdapter } from './adapters/zai';
import { LinuxAutostart, MacOSAutostart, NoopAutostart, reconcileAutostart } from './autostart';
import { calculatePanelPosition, clampPanelHeight, fitPanelSize, panelBlurGraceDeadline, type PanelRect } from './panelPosition';
import { discoverInstalledProviders } from './providerDiscovery';
import { linuxTrayLabels, nearestTrayBounds, startLinuxTray, trayBoundsAtCursor, type LinuxTrayController } from './linuxTray';
import { SettingsService } from './settingsService';
import { Storage } from './storage';
import { UsageService } from './usageService';

const PREFERRED_PANEL_SIZE = { width: 350, height: 480 };
const PANEL_HEIGHT_RANGE = { minimum: 180, maximum: 720 };
const PANEL_OPEN_BLUR_GRACE_MS = 2_000;
const MACOS_TRAY_GUID = '49b26cde-5aca-4cf3-b230-0b5015e5d532';

let panel: BrowserWindow | undefined;
let tray: Tray | undefined;
let linuxTray: LinuxTrayController | undefined;
let usage: UsageService;
let settings: SettingsService;
let activeSettings: AppSettings;
let refreshTimer: NodeJS.Timeout | undefined;
let pendingShow = !process.argv.includes('--hidden');
let quitting = false;
let ignorePanelBlurUntil = 0;
let panelHeight = PREFERRED_PANEL_SIZE.height;
let lastPanelAnchor: PanelRect | undefined;

function trayResource(name: 'bitmap' | 'vector' | 'macTemplate' | 'helper'): string {
  const packagedName = name === 'bitmap'
    ? 'tray-icon.png'
    : name === 'vector'
      ? 'tray-icon.svg'
      : name === 'macTemplate'
        ? 'tray-iconTemplate.png'
        : 'linux-tray.py';
  if (app.isPackaged) return path.join(process.resourcesPath, packagedName);
  const sourceName = name === 'bitmap'
    ? 'build/icon.png'
    : name === 'vector'
      ? 'build/tray-icon.svg'
      : name === 'macTemplate'
        ? 'build/tray-iconTemplate.png'
        : 'resources/linux-tray.py';
  return path.join(app.getAppPath(), sourceName);
}

function positionPanel(bounds = lastPanelAnchor) {
  if (!panel) return;
  const validTray = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : undefined;
  const display = validTray
    ? screen.getDisplayNearestPoint({ x: validTray.x + Math.round(validTray.width / 2), y: validTray.y + Math.round(validTray.height / 2) })
    : screen.getPrimaryDisplay();
  // GNOME extensions can publish a bogus _NET_WORKAREA (for example y=336 for
  // a 32px top bar). A real tray anchor is more reliable, so constrain anchored
  // popovers to the display bounds and keep workArea only for launcher fallback.
  const availableArea = validTray ? display.bounds : display.workArea;
  const size = fitPanelSize({ width: PREFERRED_PANEL_SIZE.width, height: panelHeight }, availableArea);
  const point = calculatePanelPosition(size, validTray, availableArea, display.bounds);
  panel.setBounds({ ...point, ...size }, false);
}

function showPanel(bounds?: PanelRect) {
  if (!panel) { pendingShow = true; return; }
  if (bounds && bounds.width > 0 && bounds.height > 0) lastPanelAnchor = bounds;
  positionPanel(lastPanelAnchor);
  // GNOME/Wayland can briefly return focus to the closing tray menu even
  // after its DBusMenu `closed` event. Keep the newly shown panel mapped
  // through that compositor hand-off; later user-initiated blur still hides it.
  ignorePanelBlurUntil = panelBlurGraceDeadline(process.platform, Date.now(), PANEL_OPEN_BLUR_GRACE_MS);
  panel.show();
  panel.focus();
  panel.webContents.send(IPC.viewShown);
  pendingShow = false;
}

function updateTray(payload: UsagePayload) {
  if (!tray) return;
  const failed = payload.snapshots.filter((item) => item.status === 'error' || item.status === 'stale').length;
  tray.setToolTip(`Agent Usage${failed ? ` • ${failed} sorun` : ''}`);
  // Keep the macOS status item compact so it remains visible beside the notch
  // on smaller displays with several menu bar utilities.
  if (process.platform === 'darwin') tray.setTitle('');
}

function createElectronTrayFallback() {
  if (tray || quitting) return;
  const source = process.platform === 'darwin' ? trayResource('macTemplate') : trayResource('bitmap');
  const loadedIcon = nativeImage.createFromPath(source);
  const icon = process.platform === 'darwin' ? loadedIcon : loadedIcon.resize({ width: 24, height: 24 });
  if (icon.isEmpty()) throw new Error('Tray ikonu yüklenemedi.');
  // Passing the Template-named path directly preserves macOS's @2x
  // representation and lets AppKit apply the correct light/dark rendering.
  tray = process.platform === 'darwin' ? new Tray(source, MACOS_TRAY_GUID) : new Tray(icon);
  if (process.platform === 'darwin') tray.setIgnoreDoubleClickEvents(true);
  tray.on('click', (_event, bounds) => showPanel(bounds));
  updateTray(usage.get());
  if (process.platform === 'darwin') {
    log.info('macOS tray created', {
      source,
      icon: icon.getSize(),
      template: icon.isTemplateImage(),
      title: tray.getTitle(),
      bounds: tray.getBounds(),
    });
    setTimeout(() => {
      if (!tray) return;
      updateTray(usage.get());
      log.info('macOS tray settled', { title: tray.getTitle(), bounds: tray.getBounds() });
    }, 1_000);
  }
}

function createPlatformTray() {
  if (process.platform !== 'linux') {
    createElectronTrayFallback();
    return;
  }
  linuxTray = startLinuxTray({
    helperPath: trayResource('helper'),
    iconPath: trayResource('vector'),
    onDetail: (reportedBounds) => {
      const cursor = screen.getCursorScreenPoint();
      const bounds = nearestTrayBounds(reportedBounds ?? [], cursor) ?? trayBoundsAtCursor(cursor);
      setTimeout(() => showPanel(bounds), 100);
    },
    onSettings: (reportedBounds) => {
      const cursor = screen.getCursorScreenPoint();
      const bounds = nearestTrayBounds(reportedBounds ?? [], cursor) ?? trayBoundsAtCursor(cursor);
      setTimeout(() => {
        showPanel(bounds);
        panel?.webContents.send(IPC.viewSettings);
      }, 100);
    },
    onQuit: () => app.quit(),
    onError: (error) => {
      console.error(error);
      linuxTray = undefined;
      try { createElectronTrayFallback(); } catch (fallbackError) { console.error(fallbackError); }
    },
  });
  linuxTray.update(linuxTrayLabels(usage.get(), activeSettings.enabledProviders));
}

async function createApplication() {
  if (process.platform === 'darwin') app.dock?.hide();
  const storage = new Storage(app.getPath('userData'));
  const autostart = process.platform === 'linux'
    ? new LinuxAutostart()
    : process.platform === 'darwin'
      ? new MacOSAutostart(app)
      : new NoopAutostart();
  settings = new SettingsService(storage, autostart);
  activeSettings = await settings.get();
  try {
    activeSettings = await settings.enableNewlyDetectedProviders(await discoverInstalledProviders(activeSettings));
  } catch (error) {
    log.warn('Provider discovery could not be persisted', error);
  }
  await reconcileAutostart(activeSettings, autostart, () => dialog.showErrorBox(
    'Agent Usage',
    'Otomatik başlangıç ayarı güncellenemedi. Ayarlar ekranından yeniden deneyebilirsiniz.',
  ));

  usage = new UsageService([
    new CodexAdapter({ executableOverride: () => activeSettings.executableOverrides.codex }),
    new AgyAdapter({ executableOverride: () => activeSettings.executableOverrides.agy }),
    new InstalledCliAdapter({
      id: 'gemini-cli',
      displayName: 'Gemini CLI',
      executableId: 'gemini',
      executableOverride: () => activeSettings.executableOverrides.gemini,
    }),
    new InstalledCliAdapter({
      id: 'qwen-code',
      displayName: 'Qwen Code',
      executableId: 'qwen',
      executableOverride: () => activeSettings.executableOverrides.qwen,
    }),
    new InstalledCliAdapter({
      id: 'opencode',
      displayName: 'OpenCode',
      executableId: 'opencode',
      executableOverride: () => activeSettings.executableOverrides.opencode,
    }),
    new InstalledCliAdapter({
      id: 'cursor-cli',
      displayName: 'Cursor CLI',
      executableId: 'cursor-agent',
      executableOverride: () => activeSettings.executableOverrides['cursor-agent'],
    }),
    new InstalledCliAdapter({
      id: 'github-copilot',
      displayName: 'GitHub Copilot CLI',
      executableId: 'copilot',
      executableOverride: () => activeSettings.executableOverrides.copilot,
    }),
    new ClaudeAdapter({
      consent: () => activeSettings.enabledProviders['claude-code'],
      executableOverride: () => activeSettings.executableOverrides.claude,
    }),
    new ZaiAdapter({ consent: () => activeSettings.zaiCredentialConsent }),
  ], storage, undefined, undefined, (providerId) => activeSettings.enabledProviders[providerId as ProviderId] ?? false);
  await usage.initialize();

  panel = new BrowserWindow({
    ...PREFERRED_PANEL_SIZE, show: false, frame: false, resizable: false, skipTaskbar: process.platform === 'darwin',
    backgroundColor: '#121314', webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'), nodeIntegration: false, contextIsolation: true, sandbox: true,
    },
  });
  if (process.platform === 'darwin') panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panel.setAlwaysOnTop(true, 'pop-up-menu');
  panel.on('blur', () => {
    if (Date.now() < ignorePanelBlurUntil) return;
    panel?.hide();
  });
  panel.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  panel.webContents.on('will-navigate', (event) => event.preventDefault());
  await panel.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));

  createPlatformTray();
  usage.on('changed', (payload: UsagePayload) => {
    panel?.webContents.send(IPC.usageChanged, payload);
    linuxTray?.update(linuxTrayLabels(payload, activeSettings.enabledProviders));
    updateTray(payload);
  });
  updateTray(usage.get());
  void usage.refresh();
  refreshTimer = setInterval(() => { void usage.refresh(); }, 5 * 60_000);
  if (pendingShow) showPanel();
}

function assertTrustedSender(event: Electron.IpcMainInvokeEvent): void {
  if (!panel || event.sender !== panel.webContents || !event.senderFrame?.url.startsWith('file:')) throw new Error('Güvenilmeyen IPC göndereni.');
}

ipcMain.handle(IPC.usageGet, (event) => { assertTrustedSender(event); return usage.get(); });
ipcMain.handle(IPC.usageRefresh, (event) => { assertTrustedSender(event); return usage.refresh(); });
ipcMain.handle(IPC.settingsGet, (event) => { assertTrustedSender(event); return settings.get(); });
ipcMain.handle(IPC.settingsUpdate, async (event, patch: Partial<AppSettings>) => {
  assertTrustedSender(event);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Geçersiz ayar isteği.');
  activeSettings = await settings.update(patch);
  void usage.refreshAfterCurrent();
  return activeSettings;
});
ipcMain.handle(IPC.viewResize, (event, requestedHeight: number) => {
  assertTrustedSender(event);
  if (typeof requestedHeight !== 'number') throw new Error('Geçersiz panel yüksekliği.');
  const nextHeight = clampPanelHeight(requestedHeight, PANEL_HEIGHT_RANGE.minimum, PANEL_HEIGHT_RANGE.maximum);
  if (nextHeight === panelHeight) return;
  panelHeight = nextHeight;
  positionPanel();
});
ipcMain.handle(IPC.viewQuit, (event) => {
  assertTrustedSender(event);
  app.quit();
});

function requestShow(commandLine?: string[]) {
  if (commandLine?.includes('--hidden')) return;
  showPanel();
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  log.initialize();
  app.on('second-instance', (_event, commandLine) => requestShow(commandLine));
  app.on('activate', () => requestShow());
  app.whenReady().then(createApplication).catch((error) => {
    log.error('Application startup failed', error);
    app.quit();
  });
  app.on('window-all-closed', () => { /* Tray application stays resident. */ });
  app.on('before-quit', () => {
    quitting = true;
    if (refreshTimer) clearInterval(refreshTimer);
    linuxTray?.stop();
  });
}
