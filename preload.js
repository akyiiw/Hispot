const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    togglePin: (shouldPin) => ipcRenderer.send('toggle-pin', shouldPin)
});