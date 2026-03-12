const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    send: (channel, data) => ipcRenderer.send(channel, data),
    on: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args)),
    invoke: (channel, data) => ipcRenderer.invoke(channel, data),
    sendToHost: (channel, data) => ipcRenderer.sendToHost(channel, data),
    getPreloadPath: () => ipcRenderer.sendSync('get-preload-path'),
    getCurrentWindow: () => ({
        close: () => ipcRenderer.send('window-close'),
        minimize: () => ipcRenderer.send('window-minimize'),
        maximize: () => ipcRenderer.send('window-maximize')
    }),
    store: {
        getBookmarks: () => ipcRenderer.invoke('store-get-bookmarks'),
        saveBookmark: (bookmark) => ipcRenderer.invoke('store-save-bookmark', bookmark),
        removeBookmark: (url) => ipcRenderer.invoke('store-remove-bookmark', url),
        isBookmarked: (url) => ipcRenderer.invoke('store-is-bookmarked', url),
        getHistory: () => ipcRenderer.invoke('store-get-history'),
        addHistory: (entry) => ipcRenderer.invoke('store-add-history', entry),
        clearHistory: () => ipcRenderer.invoke('store-clear-history'),
        getSettings: () => ipcRenderer.invoke('store-get-settings'),
        saveSettings: (settings) => ipcRenderer.invoke('store-save-settings', settings),
        getTheme: () => ipcRenderer.invoke('store-get-theme'),
        getPinnedTabs: () => ipcRenderer.invoke('store-get-pinned-tabs'),
        savePinnedTabs: (tabs) => ipcRenderer.invoke('store-save-pinned-tabs', tabs),
        getSessions: () => ipcRenderer.invoke('store-get-sessions'),
        saveSession: (name, tabs) => ipcRenderer.invoke('store-save-session', name, tabs),
        deleteSession: (name) => ipcRenderer.invoke('store-delete-session', name)
    }
});

// Listen for wheel events inside the guest page
window.addEventListener('wheel', (e) => {
    // Only care about horizontal-dominant scrolls
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.5 || Math.abs(e.deltaX) > 5) {
        // Send to the host (renderer.js)
        ipcRenderer.sendToHost('gesture-wheel', {
            deltaX: e.deltaX,
            deltaY: e.deltaY
        });
    }
}, { passive: true });
