const fs = require('fs');
const path = require('path');

// Works in main renderer (via @electron/remote) AND in nodeintegration webviews
let userDataPath;
try {
    // Main renderer context: @electron/remote is initialized
    userDataPath = require('@electron/remote').app.getPath('userData');
} catch(e) {
    try {
        // Inside a webview with nodeintegration: use electron directly
        const { app } = require('electron');
        userDataPath = app.getPath('userData');
    } catch(e2) {
        // Fallback: use a temp directory
        userDataPath = require('os').homedir() + '/.bhilbrowser';
        if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath);
    }
}

const bookmarksFile = path.join(userDataPath, 'bookmarks.json');
const historyFile = path.join(userDataPath, 'history.json');
const settingsFile = path.join(userDataPath, 'settings.json');

class Store {
    static getBookmarks() {
        try {
            if (!fs.existsSync(bookmarksFile)) return [];
            return JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to read bookmarks:', e);
            return [];
        }
    }

    static saveBookmark(bookmark) {
        let bookmarks = this.getBookmarks();
        // Prevent duplicates
        if (!bookmarks.find(b => b.url === bookmark.url)) {
            bookmarks.push({
                url: bookmark.url,
                title: bookmark.title,
                date: Date.now()
            });
            fs.writeFileSync(bookmarksFile, JSON.stringify(bookmarks, null, 2));
        }
    }

    static removeBookmark(url) {
        let bookmarks = this.getBookmarks();
        bookmarks = bookmarks.filter(b => b.url !== url);
        fs.writeFileSync(bookmarksFile, JSON.stringify(bookmarks, null, 2));
    }

    static isBookmarked(url) {
        const bookmarks = this.getBookmarks();
        return !!bookmarks.find(b => b.url === url);
    }

    static getHistory() {
        try {
            if (!fs.existsSync(historyFile)) return [];
            return JSON.parse(fs.readFileSync(historyFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to read history:', e);
            return [];
        }
    }

    static addHistory(entry) {
        // Don't log internal pages or very short visits
        if (entry.url.startsWith('file://')) return;

        let history = this.getHistory();
        
        // Remove existing entry for same URL to "move to top"
        history = history.filter(h => h.url !== entry.url);
        
        history.unshift({
            url: entry.url,
            title: entry.title,
            date: Date.now()
        });

        // Limit history to 500 entries
        if (history.length > 500) history = history.slice(0, 500);
        
        fs.writeFileSync(historyFile, JSON.stringify(history, null, 2));
    }

    static clearHistory() {
        fs.writeFileSync(historyFile, JSON.stringify([], null, 2));
    }

    static getTheme() {
        try {
            if (!fs.existsSync(settingsFile)) return 'dark';
            const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
            return settings.theme || 'dark';
        } catch (e) {
            return 'dark';
        }
    }

    static setTheme(theme) {
        try {
            let settings = {};
            if (fs.existsSync(settingsFile)) {
                settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
            }
            settings.theme = theme;
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error('Failed to save theme:', e);
        }
    }
}

module.exports = Store;
