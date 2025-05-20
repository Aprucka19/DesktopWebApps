// main.js
const { app, BrowserWindow, ipcMain, Menu, shell, powerMonitor } = require('electron'); // Import 'shell' and 'powerMonitor'
const path = require('path');
const fs = require('fs');
const SpotifyController = require('./spotify-controller');
const AuthServer = require('./auth-server');

let mainWindow;
let spotifyController = new SpotifyController();
let authServer = new AuthServer(spotifyController);

app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
        contents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });
    }
});

// Path to the tabs data file
const tabsDataPath = path.join(app.getPath('userData'), 'tabsData.json');

// Ensure the directory exists
function ensureDirectoryExistence(filePath) {
    const dirname = path.dirname(filePath);
    if (fs.existsSync(dirname)) {
        return true;
    }
    fs.mkdirSync(dirname, { recursive: true });
}

// Function to read the saved tabs data
function readTabsData() {
    try {
        if (!fs.existsSync(tabsDataPath)) {
            console.log('No saved tabs file found');
            return [];
        }

        const data = fs.readFileSync(tabsDataPath, 'utf8');
        const parsedData = JSON.parse(data);
        
        // Validate the data
        if (!Array.isArray(parsedData)) {
            console.error('Invalid tabs data format');
            return [];
        }

        console.log('Successfully read', parsedData.length, 'tabs');
        return parsedData;
    } catch (e) {
        console.error('Error reading tabs data:', e);
        
        // Try to read the temp file if it exists
        try {
            const tempData = fs.readFileSync(tabsDataPath + '.temp', 'utf8');
            return JSON.parse(tempData);
        } catch (tempError) {
            console.error('No valid backup file found');
            return [];
        }
    }
}

// Function to save tabs data
function saveTabsData(tabs) {
    try {
        ensureDirectoryExistence(tabsDataPath);
          
        // First write to a temporary file
        const tempPath = tabsDataPath + '.temp';
        fs.writeFileSync(tempPath, JSON.stringify(tabs, null, 2));
        
        // Then rename the temp file to the actual file (atomic operation)
        fs.renameSync(tempPath, tabsDataPath);
        
        console.log('Tabs data saved successfully:', tabs.length, 'tabs');
    } catch (error) {
        console.error('Error saving tabs data:', error);
        // If there was an error, try to save directly to the main file
        try {
            fs.writeFileSync(tabsDataPath, JSON.stringify(tabs, null, 2));
        } catch (fallbackError) {
            console.error('Fallback save failed:', fallbackError);
        }
    }
}
const windowStatePath = path.join(app.getPath('userData'), 'windowState.json');

function saveWindowState() {
    if (!mainWindow) return;
    const bounds = mainWindow.getBounds();
    const state = {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: mainWindow.isMaximized(),
        isFullScreen: mainWindow.isFullScreen()
    };
    fs.writeFileSync(windowStatePath, JSON.stringify(state));
}

function readWindowState() {
    try {
        const data = fs.readFileSync(windowStatePath);
        return JSON.parse(data);
    } catch (e) {
        // Default state if no saved state is found
        return {
            width: 1200,
            height: 800,
            x: undefined,
            y: undefined,
            isMaximized: false,
            isFullScreen: false
        };
    }
}

function createWindow() {
  const windowState = readWindowState();

  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    icon: path.join(__dirname, '../Assets/DWAIconTransparent.ico'),
    webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: true, 
        webSecurity: true,
        allowRunningInsecureContent: false,
        enableRemoteModule: false,
        nodeIntegrationInSubFrames: false,
        sandbox: false,
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (windowState.isMaximized) {
      mainWindow.maximize();
  }

  if (windowState.isFullScreen) {
      mainWindow.setFullScreen(true);
  }

  mainWindow.loadFile('src/index.html');

  // Remove the default menu bar
  Menu.setApplicationMenu(null);

  let isQuitting = false;

  app.on('before-quit', () => {
    isQuitting = true;
    authServer.stop();
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.webContents.send('save-tabs', true);
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  powerMonitor.on('suspend', () => {
    console.log('System is going to sleep');
    mainWindow.webContents.send('save-tabs', false);
  });

  powerMonitor.on('lock-screen', () => {
    console.log('System is locking');
    mainWindow.webContents.send('save-tabs', false);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM signal');
    mainWindow.webContents.send('save-tabs', true);
  });
}

// Start the auth server when the app starts
app.whenReady().then(() => {
    authServer.start();
    createWindow();

    // Add handler for log messages
    ipcMain.on('log-to-terminal', (event, message) => {
        console.log(message);
    });
});

// Handle IPC events from the renderer process
ipcMain.on('save-tabs', (event, tabs) => {
    console.log('Received save-tabs message with tabs:', tabs); // Debug log
    saveTabsData(tabs);
});

ipcMain.on('get-tabs', (event) => {
    const tabs = readTabsData();
    console.log('Sending saved tabs:', tabs); // Debug log
    event.returnValue = tabs;
});

ipcMain.on('tabs-saved', () => {
  saveWindowState();
  app.quit();
});

// Add these new IPC handlers before app.on('ready', createWindow)
ipcMain.handle('spotify-play-song', async (event, songName, artistName) => {
    return await spotifyController.searchAndPlay(songName, artistName);
});

ipcMain.handle('spotify-authorize', async () => {
    return await spotifyController.authorize();
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

