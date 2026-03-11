const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
require('@electron/remote/main').initialize();

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
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      nodeIntegrationInSubFrames: true
    },
    backgroundColor: isPrivate ? '#000000' : '#111827' // Darker bg for private
  });

  require('@electron/remote/main').enable(win.webContents);
  
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
      callback({ cancel: true });
    } else {
      callback({ cancel: false });
    }
  });

  // Also setup ad-blocker for in-memory partitions (Private windows)
  const privateSession = session.fromPartition('in-memory');
  privateSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (isAdRequest(details.url)) {
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

  // Open a new Window
  ipcMain.on('new-window', () => createWindow(false));
  
  // Open a new Private Window
  ipcMain.on('new-private-window', () => createWindow(true));

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
