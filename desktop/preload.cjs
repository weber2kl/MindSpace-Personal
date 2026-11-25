const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mindspace', {
  version: () => ipcRenderer.invoke('planner:version'),
  localUpdate: () => ipcRenderer.invoke('planner:localUpdate'),
  load: () => ipcRenderer.invoke('planner:load'),
  save: (data, revision) => ipcRenderer.invoke('planner:save', data, revision),
  exportData: () => ipcRenderer.invoke('planner:export'),
  pickImport: () => ipcRenderer.invoke('planner:pickImport'),
  restore: (data, revision) => ipcRenderer.invoke('planner:restore', data, revision),
  backup: () => ipcRenderer.invoke('planner:backup'),
  backupDatabase: () => ipcRenderer.invoke('planner:backupDatabase'),
  listBackups: () => ipcRenderer.invoke('planner:listBackups'),
  pickSavedBackup: filename => ipcRenderer.invoke('planner:pickSavedBackup', filename),
  openFolder: () => ipcRenderer.invoke('planner:openFolder'),
});
