const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');

app.commandLine.appendSwitch('no-sandbox');
const Store = require('./src/store');
// Removed @electron/remote/main for security reasons

// ─── Ad-Blocker Domain Blocklist ──────────────────────────────────────────────
const AD_DOMAINS = [
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'adnxs.com', 'ads.yahoo.com', 'advertising.com', 'adsystem.com',
  'adtechus.com', 'criteo.com', 'outbrain.com', 'taboola.com',
  'quantserve.com', 'scorecardresearch.com', 'zedo.com', 'adsafeprotected.com',
  'moatads.com', 'amazon-adsystem.com', 'hotjar.com', 'mouseflow.com',
  'analytics.google.com', 'google-analytics.com', 'googletagmanager.com',
  'facebook.net/en_US/fbevents.js', 'pixel.facebook.com',
  'connect.facebook.net', 'bat.bing.com', 'ib.adnxs.com',
  'pagead2.googlesyndication.com', 'static.ads-twitter.com',
];
let adblockEnabled = true;

function isAdRequest(url) {
  if (!adblockEnabled) return false;
  try {
    const { hostname, pathname } = new URL(url);
    return AD_DOMAINS.some(domain => hostname.endsWith(domain) || (hostname + pathname).includes(domain));
  } catch { return false; }
}
// ─────────────────────────────────────────────────────────────────────────────

function createWindow(isPrivate = false) {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      nodeIntegration: false,    // Set to false for security
      contextIsolation: true,    // Set to true for security
      webviewTag: true,
      nodeIntegrationInSubFrames: false, // Set to false for security
      preload: path.join(__dirname, 'src/preload.js')
    },
    backgroundColor: isPrivate ? '#000000' : '#111827'
  });

  // Removed @electron/remote/main.enable(win.webContents) for security
  
  const targetUrl = isPrivate 
    ? `file://${path.join(__dirname, 'src/index.html')}?private=true`
    : `file://${path.join(__dirname, 'src/index.html')}`;
    
  win.loadURL(targetUrl);
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  // Set up ad-blocker on the default session
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isAdRequest(details.url)) {
      try {
        const wc = require('electron').webContents.fromId(details.webContentsId);
        if (wc && wc.hostWebContents) {
          wc.hostWebContents.send('ad-blocked', details.webContentsId);
        }
      } catch (e) {}
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });

  // Also setup ad-blocker for in-memory partitions (Private windows)
  const privateSession = session.fromPartition('in-memory');
  privateSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isAdRequest(details.url)) {
      try {
        const wc = require('electron').webContents.fromId(details.webContentsId);
        if (wc && wc.hostWebContents) {
          wc.hostWebContents.send('ad-blocked', details.webContentsId);
        }
      } catch (e) {}
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });

  // Toggle ad-blocker via IPC from renderer
  ipcMain.on('toggle-adblock', (event, enabled) => {
    adblockEnabled = enabled;
    console.log(`[AdBlock] ${enabled ? 'Enabled' : 'Disabled'}`);
  });

  // Store IPC handlers
  ipcMain.handle('store-get-bookmarks', () => Store.getBookmarks());
  ipcMain.handle('store-save-bookmark', (event, bookmark) => Store.saveBookmark(bookmark));
  ipcMain.handle('store-remove-bookmark', (event, url) => Store.removeBookmark(url));
  ipcMain.handle('store-is-bookmarked', (event, url) => Store.isBookmarked(url));
  ipcMain.handle('store-get-history', () => Store.getHistory());
  ipcMain.handle('store-add-history', (event, entry) => Store.addHistory(entry));
  ipcMain.handle('store-clear-history', () => Store.clearHistory());
  ipcMain.handle('store-get-settings', () => Store.getSettings());
  ipcMain.handle('store-save-settings', (event, settings) => Store.saveSettings(settings));
  ipcMain.handle('store-get-theme', () => Store.getTheme());
  ipcMain.handle('store-get-pinned-tabs', () => Store.getPinnedTabs());
  ipcMain.handle('store-save-pinned-tabs', (event, tabs) => Store.savePinnedTabs(tabs));
  ipcMain.handle('store-get-sessions', () => Store.getSessions());
  ipcMain.handle('store-save-session', (event, name, tabs) => Store.saveSession(name, tabs));
  ipcMain.handle('store-delete-session', (event, name) => Store.deleteSession(name));

  ipcMain.on('get-preload-path', (event) => {
    event.returnValue = path.join(__dirname, 'src/preload.js');
  });

  // Open a new Window
  ipcMain.on('new-window', () => createWindow(false));
  
  // Open a new Private Window
  ipcMain.on('new-private-window', () => createWindow(true));

  // Window Controls
  ipcMain.on('window-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });
  ipcMain.on('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });
  ipcMain.on('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    }
  });

  // Handle Downloads
  const handleDownload = (event, item, webContents) => {
    const filename = item.getFilename();
    const totalBytes = item.getTotalBytes();
    
    item.on('updated', (event, state) => {
      if (state === 'interrupted') {
        console.log('Download is interrupted but can be resumed');
      } else if (state === 'progressing') {
        if (item.isPaused()) {
          console.log('Download is paused');
        } else {
          try {
            const wc = require('electron').webContents.fromId(webContents.id);
            const target = wc.hostWebContents || wc;
            target.send('download-progress', {
              filename,
              receivedBytes: item.getReceivedBytes(),
              totalBytes,
              state: 'progressing'
            });
          } catch(e) {}
        }
      }
    });

    item.once('done', (event, state) => {
      try {
        const wc = require('electron').webContents.fromId(webContents.id);
        const target = wc.hostWebContents || wc;
        target.send('download-progress', {
          filename,
          receivedBytes: totalBytes,
          totalBytes,
          state: state === 'completed' ? 'completed' : 'failed'
        });
      } catch(e) {}
    });
  };

  session.defaultSession.on('will-download', handleDownload);
  privateSession.on('will-download', handleDownload);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
