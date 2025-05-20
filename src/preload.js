// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    getTabs: () => ipcRenderer.sendSync('get-tabs'),
    onSaveTabs: (callback) => ipcRenderer.on('save-tabs', callback),
    saveTabs: (tabs) => ipcRenderer.send('save-tabs', tabs),
    tabsSaved: () => ipcRenderer.send('tabs-saved'),
    spotifyPlaySong: (songName, artistName) => ipcRenderer.invoke('spotify-play-song', songName, artistName),
    spotifyAuthorize: () => ipcRenderer.invoke('spotify-authorize'),
    logToTerminal: (message) => ipcRenderer.send('log-to-terminal', message)
});
