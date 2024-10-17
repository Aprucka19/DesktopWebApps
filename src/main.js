// main.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron'); // Import Menu
const path = require('path');
const fs = require('fs');

let mainWindow;



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
        const data = fs.readFileSync(tabsDataPath);
        return JSON.parse(data);
    } catch (e) {
        return [];
    }
}

// Function to save tabs data
function saveTabsData(tabs) {
    try {
        ensureDirectoryExistence(tabsDataPath);
        fs.writeFileSync(tabsDataPath, JSON.stringify(tabs, null, 2)); // Pretty print JSON
        console.log('Tabs data saved successfully.');
    } catch (error) {
        console.error('Error saving tabs data:', error);
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
          webSecurity: true
      }
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
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.webContents.send('save-tabs');
    }
  });

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

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

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});
