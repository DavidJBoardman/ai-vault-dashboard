import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:openFile', options),
  saveFile: (options?: { filters?: Array<{ name: string; extensions: string[] }> }) =>
    ipcRenderer.invoke('dialog:saveFile', options),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),

  // App paths
  getPath: (name: string) => ipcRenderer.invoke('app:getPath', name),

  // Python backend
  getPythonPort: () => ipcRenderer.invoke('python:getPort'),
  isPythonRunning: () => ipcRenderer.invoke('python:isRunning'),

  // Platform info
  platform: process.platform,
});

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      openFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<Electron.OpenDialogReturnValue>;
      saveFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<Electron.SaveDialogReturnValue>;
      openDirectory: () => Promise<Electron.OpenDialogReturnValue>;
      getPath: (name: string) => Promise<string>;
      getPythonPort: () => Promise<number>;
      isPythonRunning: () => Promise<boolean>;
      platform: NodeJS.Platform;
    };
  }
}

