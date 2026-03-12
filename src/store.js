const fs = require('fs');
const path = require('path');

// Works in main process
let userDataPath;
try {
    const { app } = require('electron');
    userDataPath = app.getPath('userData');
} catch(e) {
    // Fallback: use a temp directory
    userDataPath = require('os').homedir() + '/.bhilbrowser';
    if (!fs.existsSync(userDataPath)) fs.mkdirSync(userDataPath);
}

const bookmarksFile = path.join(userDataPath, 'bookmarks.json');
const historyFile = path.join(userDataPath, 'history.json');
const settingsFile = path.join(userDataPath, 'settings.json');
const pinnedTabsFile = path.join(userDataPath, 'pinned.json');
const sessionsFile = path.join(userDataPath, 'sessions.json');

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
            this.saveSettings({ theme });
        } catch (e) {
            console.error('Failed to save theme:', e);
        }
    }

    static getSettings() {
        try {
            if (!fs.existsSync(settingsFile)) return {
                theme: 'dark',
                nickname: 'Bhil',
                searchEngine: 'https://www.google.com/search?q=',
                homepage: 'dashboard'
            };
            const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'));
            const result = {
                theme: settings.theme || 'dark',
                nickname: settings.nickname || 'Bhil',
                searchEngine: settings.searchEngine || 'https://www.google.com/search?q=',
                homepage: settings.homepage || 'dashboard'
            };
            // Double check if homepage is accidentally set to a user name/partial string
            if (result.homepage && result.homepage.length < 5 && result.homepage !== 'dashboard') {
                 result.homepage = 'dashboard';
            }
            return result;
        } catch (e) {
            return {
                theme: 'dark',
                nickname: 'Bhil',
                searchEngine: 'https://www.google.com/search?q=',
                homepage: 'dashboard'
            };
        }
    }

    static saveSettings(newSettings) {
        try {
            let settings = this.getSettings();
            settings = { ...settings, ...newSettings };
            fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }
    }
    static getPinnedTabs() {
        try {
            if (!fs.existsSync(pinnedTabsFile)) return [];
            return JSON.parse(fs.readFileSync(pinnedTabsFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to read pinned tabs:', e);
            return [];
        }
    }

    static savePinnedTabs(tabs) {
        try {
            // Only save essential info: url and title
            const pinnedData = tabs.map(t => ({ url: t.url, title: t.title }));
            fs.writeFileSync(pinnedTabsFile, JSON.stringify(pinnedData, null, 2));
        } catch (e) {
            console.error('Failed to save pinned tabs:', e);
        }
    }

    static getSessions() {
        try {
            if (!fs.existsSync(sessionsFile)) return {};
            return JSON.parse(fs.readFileSync(sessionsFile, 'utf-8'));
        } catch (e) {
            console.error('Failed to read sessions:', e);
            return {};
        }
    }

    static saveSession(name, tabs) {
        try {
            const sessions = this.getSessions();
            // Store essential tab data
            sessions[name] = tabs.map(t => ({
                url: t.webview ? t.webview.getURL() : t.url,
                title: t.tabEl ? t.tabEl.querySelector('span')?.textContent || 'Home' : t.title,
                isPinned: t.isPinned
            }));
            fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    }

    static deleteSession(name) {
        try {
            const sessions = this.getSessions();
            delete sessions[name];
            fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2));
        } catch (e) {
            console.error('Failed to delete session:', e);
        }
    }
}

module.exports = Store;
