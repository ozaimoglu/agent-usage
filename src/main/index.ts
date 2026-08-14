import { app, BrowserWindow, dialog, ipcMain, nativeImage, screen, Tray } from 'electron';
import path from 'node:path';
import type { AppSettings, ProviderId, UsagePayload } from '../common/types';
import { IPC } from '../common/types';
import { AgyAdapter } from './adapters/agy';
import { ClaudeAdapter } from './adapters/claude';
import { CodexAdapter } from './adapters/codex';
import { ZaiAdapter } from './adapters/zai';
import { LinuxAutostart, NoopAutostart, reconcileAutostart } from './autostart';
import { calculatePanelPosition, fitPanelSize, type PanelRect } from './panelPosition';
import { linuxTrayLabels, nearestTrayBounds, startLinuxTray, trayBoundsAtCursor, type LinuxTrayController } from './linuxTray';
import { SettingsService } from './settingsService';
import { Storage } from './storage';
import { UsageService } from './usageService';

const PREFERRED_PANEL_SIZE = { width: 410, height: 650 };
const PANEL_OPEN_BLUR_GRACE_MS = 2_000;

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

function trayResource(name: 'bitmap' | 'vector' | 'helper'): string {
  const packagedName = name === 'bitmap' ? 'tray-icon.png' : name === 'vector' ? 'tray-icon.svg' : 'linux-tray.py';
  if (app.isPackaged) return path.join(process.resourcesPath, packagedName);
  const sourceName = name === 'bitmap' ? 'build/icon.png' : name === 'vector' ? 'build/tray-icon.svg' : 'resources/linux-tray.py';
  return path.join(app.getAppPath(), sourceName);
}

function positionPanel(bounds?: PanelRect) {
  if (!panel) return;
  const validTray = bounds && bounds.width > 0 && bounds.height > 0 ? bounds : undefined;
  const display = validTray
    ? screen.getDisplayNearestPoint({ x: validTray.x + Math.round(validTray.width / 2), y: validTray.y + Math.round(validTray.height / 2) })
    : screen.getPrimaryDisplay();
  // GNOME extensions can publish a bogus _NET_WORKAREA (for example y=336 for
  // a 32px top bar). A real tray anchor is more reliable, so constrain anchored
  // popovers to the display bounds and keep workArea only for launcher fallback.
  const availableArea = validTray ? display.bounds : display.workArea;
  const size = fitPanelSize(PREFERRED_PANEL_SIZE, availableArea);
  const point = calculatePanelPosition(size, validTray, availableArea, display.bounds);
  panel.setBounds({ ...point, ...size }, false);
}

function showPanel(bounds?: PanelRect) {
  if (!panel) { pendingShow = true; return; }
  positionPanel(bounds);
  // GNOME/Wayland can briefly return focus to the closing tray menu even
  // after its DBusMenu `closed` event. Keep the newly shown panel mapped
  // through that compositor hand-off; later user-initiated blur still hides it.
  ignorePanelBlurUntil = Date.now() + PANEL_OPEN_BLUR_GRACE_MS;
  panel.show();
  panel.focus();
  pendingShow = false;
}

function updateTray(payload: UsagePayload) {
  if (!tray) return;
  const failed = payload.snapshots.filter((item) => item.status === 'error' || item.status === 'stale').length;
  tray.setToolTip(`Agent Usage${failed ? ` • ${failed} sorun` : ''}`);
}

function createElectronTrayFallback() {
  if (tray || quitting) return;
  const icon = nativeImage.createFromPath(trayResource('bitmap')).resize({ width: 24, height: 24 });
  if (icon.isEmpty()) throw new Error('Tray ikonu yüklenemedi.');
  tray = new Tray(icon);
  tray.on('click', (_event, bounds) => showPanel(bounds));
  updateTray(usage.get());
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
  const storage = new Storage(app.getPath('userData'));
  const autostart = process.platform === 'linux' ? new LinuxAutostart() : new NoopAutostart();
  settings = new SettingsService(storage, autostart);
  activeSettings = await settings.get();
  await reconcileAutostart(activeSettings, autostart, () => dialog.showErrorBox(
    'Agent Usage',
    'Otomatik başlangıç ayarı güncellenemedi. Ayarlar ekranından yeniden deneyebilirsiniz.',
  ));

  usage = new UsageService([
    new CodexAdapter({ executableOverride: () => activeSettings.executableOverrides.codex }),
    new AgyAdapter({ executableOverride: () => activeSettings.executableOverrides.agy }),
    new ClaudeAdapter({
      consent: () => activeSettings.enabledProviders['claude-code'],
      executableOverride: () => activeSettings.executableOverrides.claude,
    }),
    new ZaiAdapter({ consent: () => activeSettings.zaiCredentialConsent }),
  ], storage, undefined, undefined, (providerId) => activeSettings.enabledProviders[providerId as ProviderId] ?? false);
  await usage.initialize();

  panel = new BrowserWindow({
    ...PREFERRED_PANEL_SIZE, show: false, frame: false, resizable: false, skipTaskbar: false,
    backgroundColor: '#0b1019', webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'), nodeIntegration: false, contextIsolation: true, sandbox: true,
    },
  });
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
  app.on('second-instance', (_event, commandLine) => requestShow(commandLine));
  app.on('activate', () => requestShow());
  app.whenReady().then(createApplication).catch(() => app.quit());
  app.on('window-all-closed', () => { /* Tray application stays resident. */ });
  app.on('before-quit', () => {
    quitting = true;
    if (refreshTimer) clearInterval(refreshTimer);
    linuxTray?.stop();
  });
}
