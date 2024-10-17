// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    sendSaveTabs: (tabs) => ipcRenderer.send('save-tabs', tabs),
    getTabs: () => ipcRenderer.sendSync('get-tabs'),
    onSaveTabs: (callback) => ipcRenderer.on('save-tabs', callback),
    tabsSaved: () => ipcRenderer.send('tabs-saved')
});
