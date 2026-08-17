import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, RendererApi, UsagePayload } from '../common/types';

// Sandboxed preload scripts cannot require local CommonJS modules. Keep the
// runtime channel names self-contained; the shared import above is type-only.
const IPC = Object.freeze({
  usageGet: 'usage:get',
  usageRefresh: 'usage:refresh',
  usageChanged: 'usage:changed',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  viewShown: 'view:shown',
  viewSettings: 'view:settings',
  viewResize: 'view:resize',
  viewQuit: 'view:quit',
});

const api: RendererApi = {
  usage: {
    get: () => ipcRenderer.invoke(IPC.usageGet) as Promise<UsagePayload>,
    refresh: () => ipcRenderer.invoke(IPC.usageRefresh) as Promise<UsagePayload>,
    onChanged: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: UsagePayload) => listener(payload);
      ipcRenderer.on(IPC.usageChanged, handler);
      return () => ipcRenderer.removeListener(IPC.usageChanged, handler);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    update: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch) as Promise<AppSettings>,
  },
  view: {
    quit: () => ipcRenderer.invoke(IPC.viewQuit) as Promise<void>,
    resize: (height) => ipcRenderer.invoke(IPC.viewResize, height) as Promise<void>,
    onShown: (listener) => {
      const handler = () => listener();
      ipcRenderer.on(IPC.viewShown, handler);
      return () => ipcRenderer.removeListener(IPC.viewShown, handler);
    },
    onSettings: (listener) => {
      const handler = () => listener();
      ipcRenderer.on(IPC.viewSettings, handler);
      return () => ipcRenderer.removeListener(IPC.viewSettings, handler);
    },
  },
};

contextBridge.exposeInMainWorld('agentUsage', api);
