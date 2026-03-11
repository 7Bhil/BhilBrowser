const { app, BrowserWindow } = require('electron');
const path = require('path');
require('@electron/remote/main').initialize();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true, // Required for the browser view
      nodeIntegrationInSubFrames: true
    },
    titleBarStyle: 'hiddenInset', // Fancy macOS style if applicable, or just cleaner look
    backgroundColor: '#111827' // Dark gray-900
  });

  require("@electron/remote/main").enable(win.webContents);

  win.loadFile(path.join(__dirname, 'src/index.html'));
  
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
