const { ipcRenderer } = require('electron');
const { getCurrentWindow } = require('@electron/remote');
const path = require('path');
const Store = require('./store');

// Detect if we are in a private window
const isPrivate = new URLSearchParams(window.location.search).get('private') === 'true';

// Apply Theme
let currentTheme = Store.getTheme();
if (currentTheme === 'dark') {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}

// Ad-blocker state
let adblockEnabled = true;

// Select DOM elements
const adblockBtn = document.getElementById('adblock-btn');
const adblockIcon = document.getElementById('adblock-icon');
const adblockPopup = document.getElementById('adblock-popup');
const adblockCount = document.getElementById('adblock-count');
const adblockStatusBadge = document.getElementById('adblock-status-badge');
const adblockMainToggle = document.getElementById('adblock-main-toggle');
const tabBar = document.getElementById('tab-bar');
const addTabBtn = document.getElementById('add-tab');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');
const homeBtn = document.getElementById('home');
const privateBtn = document.getElementById('private-btn');
const historyBtn = document.getElementById('history-btn');
const bookmarkBtn = document.getElementById('bookmark-btn');
const bookmarkStar = document.getElementById('bookmark-star');
const indicatorLeft = document.getElementById('swipe-indicator-left');
const indicatorRight = document.getElementById('swipe-indicator-right');

// Sidebar elements
const sidebarOverlay = document.getElementById('sidebar-overlay');
const sidebar = document.getElementById('sidebar');
const sbShowHistory = document.getElementById('sb-show-history');
const sbShowBookmarks = document.getElementById('sb-show-bookmarks');
const closeSidebar = document.getElementById('close-sidebar');
const sidebarSearch = document.getElementById('sidebar-search');
const sidebarContent = document.getElementById('sidebar-content');
const sbShowSessions = document.getElementById('sb-show-sessions');

// Session modal elements
const sessionModal = document.getElementById('session-modal');
const sessionNameInput = document.getElementById('session-name-input');
const sessionSaveBtn = document.getElementById('session-save');
const sessionSkipBtn = document.getElementById('session-skip');
const sessionCancelBtn = document.getElementById('session-cancel');
const sessionModalOverlay = document.getElementById('session-modal-overlay');

// Omnibox Suggestions
const suggestionsContainer = document.getElementById('suggestions-container');
const tabContextMenu = document.getElementById('tab-context-menu');
const cmPin = document.getElementById('cm-pin');
const cmDuplicate = document.getElementById('cm-duplicate');
const cmClose = document.getElementById('cm-close');
const pinText = document.getElementById('pin-text');

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.nextTabId = 0;
        
        // Gesture State
        this.scrollDeltaX = 0;
        this.lastScrollTime = Date.now();
        this.isThresholdMet = false;
        this.isWaitingForLoad = false;
        this.gestureTimeout = null;

        // Sidebar State
        this.sidebarOpen = false;
        this.sidebarMode = 'history'; // 'history' or 'bookmarks'
        this.sidebarSearchQuery = '';

        // Suggestions State
        this.suggestions = [];
        this.activeSuggestionIndex = -1;
        this.suggestionTimeout = null;

        // Context Menu State
        this.contextMenuTabId = null;

        this.setupGeneralListeners();
        this.setupGlobalGestureListener();
        this.setupKeyboardShortcuts();
        this.setupContextMenuListeners();
        
        // Load pinned tabs or create a default one
        const initialPinned = Store.getPinnedTabs();
        if (initialPinned.length > 0) {
            initialPinned.forEach(p => this.createTab(p.url, true));
        }
        this.createTab();
    }

    setupGeneralListeners() {
        addTabBtn.addEventListener('click', () => this.createTab());

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this.activeSuggestionIndex >= 0 && this.suggestions[this.activeSuggestionIndex]) {
                    this.navigateActiveTab(this.suggestions[this.activeSuggestionIndex].url);
                    this.hideSuggestions();
                } else {
                    let url = urlInput.value.trim();
                    if (url) {
                        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                            url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                        }
                        this.navigateActiveTab(url);
                    }
                }
                urlInput.blur();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateSuggestions(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSuggestions(-1);
            } else if (e.key === 'Escape') {
                this.hideSuggestions();
            }
        });

        urlInput.addEventListener('input', () => {
            this.handleOmniboxInput();
        });

        urlInput.addEventListener('focus', () => {
            if (urlInput.value.trim()) this.handleOmniboxInput();
        });

        document.addEventListener('click', (e) => {
            if (!urlInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                this.hideSuggestions();
            }
        });

        backBtn.addEventListener('click', () => {
            const wv = this.getActiveWebview();
            if (wv && wv.canGoBack()) wv.goBack();
        });

        forwardBtn.addEventListener('click', () => {
            const wv = this.getActiveWebview();
            if (wv && wv.canGoForward()) wv.goForward();
        });

        refreshBtn.addEventListener('click', () => {
            const wv = this.getActiveWebview();
            if (wv) wv.reload();
        });

        homeBtn.addEventListener('click', () => {
            this.navigateActiveTab(`file://${path.join(__dirname, 'dashboard.html')}`);
        });
        // History Sidebar via Button
        historyBtn.addEventListener('click', () => {
            this.toggleSidebar('history');
        });

        // Private Window via Button
        privateBtn.addEventListener('click', () => {
            ipcRenderer.send('new-private-window');
        });

        closeSidebar.addEventListener('click', () => this.toggleSidebar());
        sidebarOverlay.addEventListener('click', () => this.toggleSidebar());

        sbShowHistory.addEventListener('mousedown', () => this.setSidebarMode('history'));
        sbShowBookmarks.addEventListener('mousedown', () => this.setSidebarMode('bookmarks'));
        sbShowSessions.addEventListener('mousedown', () => this.setSidebarMode('sessions'));

        // Session Modal Listeners
        sessionSaveBtn.addEventListener('click', () => this.confirmSaveSession());
        sessionSkipBtn.addEventListener('click', () => this.skipSaveSession());
        sessionCancelBtn.addEventListener('click', () => this.cancelSaveSession());
        sessionModalOverlay.addEventListener('click', () => this.cancelSaveSession());

        // Handle Close Interception
        window.onbeforeunload = (e) => {
            if (this.tabs.length > 1 && !this.isClosingForcefully) {
                this.showSessionModal();
                e.returnValue = false; // Prevent close
                return false;
            }
        };

        ipcRenderer.on('force-close', () => {
            this.isClosingForcefully = true;
            win.close();
        });

        sidebarSearch.addEventListener('input', (e) => {
            this.sidebarSearchQuery = e.target.value.toLowerCase();
            this.renderSidebarContent();
        });

        bookmarkBtn.addEventListener('click', () => {
            const wv = this.getActiveWebview();
            if (!wv) return;
            const url = wv.getURL();
            const title = wv.getTitle();

            if (Store.isBookmarked(url)) {
                Store.removeBookmark(url);
            } else {
                Store.saveBookmark({ url, title });
            }
            this.updateBookmarkUI(url);
        });

        // Window controls
        const win = getCurrentWindow();

        document.getElementById('win-close').addEventListener('click', () => win.close());
        document.getElementById('win-minimize').addEventListener('click', () => win.minimize());
        document.getElementById('win-maximize').addEventListener('click', () => {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
        });

        // Ad-blocker toggle
        
        const updateAdblockUI = (enabled) => {
            adblockEnabled = enabled;
            adblockIcon.style.color = enabled ? '#34d399' : '#6b7280';
            adblockStatusBadge.textContent = enabled ? 'Actif' : 'Désactivé';
            adblockStatusBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${enabled ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-gray-500/10 text-gray-500'}`;
            adblockMainToggle.textContent = enabled ? 'Désactiver le bloqueur' : 'Activer le bloqueur';
            adblockMainToggle.className = `w-full py-2 ${enabled ? 'bg-red-500/10 hover:bg-red-500/20 text-red-500' : 'bg-blue-600 hover:bg-blue-700 text-white'} rounded-xl text-sm font-medium transition-colors`;
        };
        updateAdblockUI(true);

        adblockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            adblockPopup.classList.toggle('opacity-0');
            adblockPopup.classList.toggle('pointer-events-none');
            adblockPopup.classList.toggle('scale-95');
        });

        adblockMainToggle.addEventListener('click', () => {
            adblockEnabled = !adblockEnabled;
            ipcRenderer.send('toggle-adblock', adblockEnabled);
            updateAdblockUI(adblockEnabled);
        });

        // Close popup when clicking outside
        window.addEventListener('click', (e) => {
            if (!adblockBtn.contains(e.target) && !adblockPopup.contains(e.target)) {
                adblockPopup.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
            }
        });

        // Ad-blocker stats listener
        ipcRenderer.on('ad-blocked', (event, webContentsId) => {
            const tab = this.tabs.find(t => t.webview.getWebContentsId() === webContentsId);
            if (tab) {
                tab.adsBlocked++;
                if (this.activeTabId === tab.id) {
                    adblockCount.textContent = tab.adsBlocked;
                }
            }
        });
    }

    setupContextMenuListeners() {
        cmPin.addEventListener('click', () => {
            if (this.contextMenuTabId !== null) {
                this.togglePin(this.contextMenuTabId);
                this.hideTabContextMenu();
            }
        });

        cmDuplicate.addEventListener('click', () => {
            if (this.contextMenuTabId !== null) {
                const tab = this.tabs.find(t => t.id === this.contextMenuTabId);
                if (tab) this.createTab(tab.webview.getURL());
                this.hideTabContextMenu();
            }
        });

        cmClose.addEventListener('click', () => {
            if (this.contextMenuTabId !== null) {
                this.closeTab(this.contextMenuTabId);
                this.hideTabContextMenu();
            }
        });

        window.addEventListener('click', (e) => {
            if (!tabContextMenu.contains(e.target)) {
                this.hideTabContextMenu();
            }
        });
    }

    showTabContextMenu(e, id) {
        this.contextMenuTabId = id;
        const tab = this.tabs.find(t => t.id === id);
        if (!tab) return;

        pinText.textContent = tab.isPinned ? 'Désépingler' : 'Épingler';
        
        tabContextMenu.style.left = `${e.clientX}px`;
        tabContextMenu.style.top = `${e.clientY}px`;
        tabContextMenu.classList.remove('opacity-0', 'pointer-events-none', 'scale-95');
    }

    hideTabContextMenu() {
        tabContextMenu.classList.add('opacity-0', 'pointer-events-none', 'scale-95');
        this.contextMenuTabId = null;
    }

    togglePin(id) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;
        const tab = this.tabs[index];
        const wasPinned = tab.isPinned;
        
        // Remove current tab
        tab.tabEl.remove();
        this.tabs.splice(index, 1);
        
        // Recreation with new pinned state
        this.createTab(tab.webview.getURL(), !wasPinned);
        
        // Move content
        const newTab = this.tabs.find(t => t.id === this.nextTabId - 1);
        newTab.webview.remove();
        newTab.webview = tab.webview;
        webviewContainer.appendChild(newTab.webview);
        
        // Sync ready state
        newTab.isReady = tab.isReady;
        
        // Persist
        Store.savePinnedTabs(this.tabs.filter(t => t.isPinned));
        
        this.switchTab(newTab.id);
    }

    setupKeyboardShortcuts() {
        window.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch(e.key.toLowerCase()) {
                    case 't':
                        e.preventDefault();
                        this.createTab();
                        break;
                    case 'w':
                        e.preventDefault();
                        if (this.activeTabId !== null) this.closeTab(this.activeTabId);
                        break;
                    case 'l':
                        e.preventDefault();
                        urlInput.focus();
                        urlInput.select();
                        break;
                    case 'r':
                        e.preventDefault();
                        const wv = this.getActiveWebview();
                        if (wv) wv.reload();
                        break;
                    case 'h':
                        e.preventDefault();
                        this.toggleSidebar('history');
                        break;
                    case 'b':
                        e.preventDefault();
                        this.toggleSidebar('bookmarks');
                        break;
                    case 'n':
                        e.preventDefault();
                        if (e.shiftKey) {
                            ipcRenderer.send('new-private-window');
                        } else {
                            ipcRenderer.send('new-window');
                        }
                        break;
                }
            }
            if (e.altKey) {
                const wv = this.getActiveWebview();
                if (!wv) return;
                if (e.key === 'ArrowLeft' && wv.canGoBack()) wv.goBack();
                if (e.key === 'ArrowRight' && wv.canGoForward()) wv.goForward();
            }
        });
    }

    // Handles gestures for the UI areas
    setupGlobalGestureListener() {
        window.addEventListener('wheel', (e) => {
            if (e.target.closest('webview')) return;
            this.handleGestureScroll(e.deltaX, e.deltaY);
        }, { capture: true, passive: true });
    }

    handleGestureScroll(deltaX, deltaY) {
        const wv = this.getActiveWebview();
        if (!wv || this.isWaitingForLoad) return;

        const now = Date.now();
        if (Math.abs(deltaY) > Math.abs(deltaX) * 1.5 || now - this.lastScrollTime > 150) {
            if (!this.isThresholdMet) {
                this.scrollDeltaX = 0;
                this.resetVisualFeedback();
            }
        }
        this.lastScrollTime = now;

        if (Math.abs(deltaX) > 0.5) {
            this.scrollDeltaX += deltaX;
            const triggerThreshold = 250; 
            const isLeft = this.scrollDeltaX < 0;
            const activeIndicator = isLeft ? indicatorLeft : indicatorRight;
            const inactiveIndicator = isLeft ? indicatorRight : indicatorLeft;

            const progress = Math.min(1, Math.abs(this.scrollDeltaX) / triggerThreshold);
            
            if (Math.abs(this.scrollDeltaX) > 10) {
                const translateX = isLeft ? (-100 + (progress * 140)) : (100 - (progress * 140));
                activeIndicator.style.transform = `translateY(-50%) translateX(${translateX}%)`;
                activeIndicator.style.opacity = progress;
                
                const innerCircle = activeIndicator.querySelector('div');
                if (innerCircle) {
                    innerCircle.style.transform = `scale(${0.6 + (progress * 0.4)})`;
                    if (Math.abs(this.scrollDeltaX) >= triggerThreshold) {
                        innerCircle.style.backgroundColor = 'rgba(59, 130, 246, 0.9)';
                        innerCircle.style.borderColor = '#ffffff';
                        innerCircle.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.6)';
                        this.isThresholdMet = true;
                    } else {
                        innerCircle.style.backgroundColor = 'rgba(59, 130, 246, 0.2)';
                        innerCircle.style.borderColor = 'rgba(96, 165, 250, 0.3)';
                        innerCircle.style.boxShadow = 'none';
                        this.isThresholdMet = false;
                    }
                }
                inactiveIndicator.style.opacity = '0';
            }

            clearTimeout(this.gestureTimeout);
            this.gestureTimeout = setTimeout(() => {
                if (this.isThresholdMet) {
                    if (isLeft && wv.canGoBack()) {
                        wv.goBack();
                        this.isWaitingForLoad = true;
                        this.showTriggeredState(indicatorLeft, 'Retour');
                    } else if (!isLeft && wv.canGoForward()) {
                        wv.goForward();
                        this.isWaitingForLoad = true;
                        this.showTriggeredState(indicatorRight, 'Suivant');
                    } else {
                        this.resetVisualFeedback();
                    }
                } else {
                    this.resetVisualFeedback();
                }
                this.scrollDeltaX = 0;
                this.isThresholdMet = false;
            }, 100);
        }
    }

    showTriggeredState(indicator, text) {
        indicator.style.transform = 'translateY(-50%) translateX(0)';
        indicator.style.opacity = '1';
        const innerCircle = indicator.querySelector('div');
        if (innerCircle) {
            innerCircle.style.transform = 'scale(1.2)';
            innerCircle.style.backgroundColor = 'rgba(59, 130, 246, 0.8)';
            innerCircle.style.borderColor = '#ffffff';
            innerCircle.style.color = '#ffffff';
            
            let label = indicator.querySelector('.swipe-label');
            if (!label) {
                label = document.createElement('span');
                label.className = 'swipe-label absolute top-full mt-2 left-1/2 -translate-x-1/2 text-[10px] font-bold text-white uppercase tracking-widest whitespace-nowrap';
                indicator.appendChild(label);
            }
            label.textContent = text + '...';
        }
    }

    createTab(url = null, isPinned = false) {
        if (!url) {
            url = `file://${path.join(__dirname, 'dashboard.html')}`;
        }
        const id = this.nextTabId++;
        
        const tabEl = document.createElement('div');
        tabEl.className = 'group flex items-center h-8 px-3 bg-black/5 dark:bg-gray-800 rounded-t-lg border-x border-t border-black/5 dark:border-gray-700 text-gray-600 dark:text-gray-400 transition-all cursor-pointer relative shrink-0';
        
        if (isPinned) {
            tabEl.classList.add('w-12', 'justify-center');
            tabEl.classList.remove('min-w-[120px]');
        } else {
            tabEl.classList.add('max-w-[200px]', 'min-w-[120px]');
        }
        
        tabEl.id = `tab-${id}`;
        tabEl.innerHTML = `
            <div class="fav-container w-4 h-4 flex-shrink-0 flex items-center justify-center ${isPinned ? '' : 'mr-2'} pointer-events-none">
                <img src="https://www.google.com/s2/favicons?sz=64&domain=google.com" class="w-4 h-4 opacity-70">
            </div>
            ${isPinned ? '' : '<span class="text-xs truncate mr-2 pointer-events-none flex-1">Home</span>'}
            ${isPinned ? '' : `
                <button class="close-tab p-0.5 hover:bg-black/10 dark:hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
                </button>
            `}
        `;

        tabEl.addEventListener('click', (e) => {
            if (e.target.closest('.close-tab')) this.closeTab(id);
            else this.switchTab(id);
        });

        // Context Menu Event
        tabEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this.showTabContextMenu(e, id);
        });

        const webview = document.createElement('webview');
        webview.id = `webview-${id}`;
        webview.src = url;
        webview.setAttribute('allowpopups', '');
        webview.setAttribute('nodeintegration', '');
        webview.setAttribute('preload', `file://${path.join(__dirname, 'preload.js')}`);
        if (isPrivate) {
            webview.setAttribute('partition', 'in-memory');
        }
        webview.className = 'absolute inset-0 w-full h-full invisible bg-white';

        this.setupWebviewListeners(webview, id, tabEl);
        webviewContainer.appendChild(webview);

        const tabObj = { id, tabEl, webview, isReady: false, adsBlocked: 0, isPinned };
        
        // Insertion sorting: Pinned always first
        if (isPinned) {
            const lastPinnedIndex = [...this.tabs].reverse().findIndex(t => t.isPinned);
            if (lastPinnedIndex === -1) {
                tabBar.insertBefore(tabEl, tabBar.firstChild);
                this.tabs.unshift(tabObj);
            } else {
                const actualIndex = this.tabs.length - 1 - lastPinnedIndex;
                const nextTabEl = this.tabs[actualIndex + 1]?.tabEl || addTabBtn;
                tabBar.insertBefore(tabEl, nextTabEl);
                this.tabs.splice(actualIndex + 1, 0, tabObj);
            }
        } else {
            tabBar.insertBefore(tabEl, addTabBtn);
            this.tabs.push(tabObj);
        }
        
        this.switchTab(id);
    }

    setupWebviewListeners(wv, id, tabEl) {
        const updateUI = () => {
            const tab = this.tabs.find(t => t.id === id);
            if (this.activeTabId === id && tab && tab.isReady) this.syncBrowserUI(wv);
        };

        // Inject CSS to hide scrollbars
        wv.addEventListener('dom-ready', () => {
            wv.insertCSS(`
                ::-webkit-scrollbar {
                    display: none !important;
                }
                * {
                    scrollbar-width: none !important;
                }
            `);
        });

        wv.addEventListener('did-start-loading', () => {
            if (this.activeTabId === id) refreshBtn.classList.add('animate-spin');
        });

        wv.addEventListener('did-stop-loading', () => {
            if (this.activeTabId === id) {
                refreshBtn.classList.remove('animate-spin');
                if (this.isWaitingForLoad) {
                    this.resetVisualFeedback();
                    this.isWaitingForLoad = false;
                }
                
                // Track History
                const url = wv.getURL();
                const title = wv.getTitle();
                if (!isPrivate) {
                    Store.addHistory({ url, title });
                }
                this.updateBookmarkUI(url);

                // Reset ad counter on navigation (optional, but standard for "on this page")
                const tab = this.tabs.find(t => t.id === id);
                if (tab) {
                    tab.adsBlocked = 0;
                    if (this.activeTabId === id) adblockCount.textContent = '0';
                }

                // Inject data into Dashboard if loaded
                if (url.includes('dashboard.html')) {
                    const history = JSON.stringify(Store.getHistory());
                    const bookmarks = JSON.stringify(Store.getBookmarks());
                    const theme = JSON.stringify(Store.getTheme() || 'dark');
                    wv.executeJavaScript(`
                        if (typeof window.injectDashboardData === 'function') {
                            window.injectDashboardData(${history}, ${bookmarks}, ${theme});
                        }
                    `).catch((e) => console.error('Dashboard Injection Error:', e));
                }
            }
            updateUI();
        });

        wv.addEventListener('dom-ready', () => {
            const tab = this.tabs.find(t => t.id === id);
            if (tab) {
                tab.isReady = true;
                this.updateFavicon(wv, tabEl);
            }
            updateUI();
        });

        wv.addEventListener('did-navigate', updateUI);
        wv.addEventListener('did-navigate-in-page', updateUI);
        
        wv.addEventListener('did-start-navigation', (e) => {
            if (this.activeTabId === id) urlInput.value = e.url.includes('dashboard.html') ? '' : e.url;
        });

        wv.addEventListener('ipc-message', (e) => {
            if (e.channel === 'gesture-wheel') {
                if (this.activeTabId === id) {
                    this.handleGestureScroll(e.args[0].deltaX, e.args[0].deltaY);
                }
            }
        });
    }

    updateFavicon(wv, tabEl) {
        const favImg = tabEl.querySelector('.fav-container img');
        if (favImg) {
            try {
                const url = new URL(wv.getURL());
                favImg.src = `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`;
            } catch (e) {
                favImg.src = 'https://www.google.com/s2/favicons?sz=64&domain=google.com';
            }
        }
    }

    updateBookmarkUI(url) {
        if (Store.isBookmarked(url)) {
            bookmarkStar.style.fill = '#facc15';
            bookmarkStar.style.stroke = '#facc15';
            bookmarkStar.parentElement.classList.add('text-yellow-400');
        } else {
            bookmarkStar.style.fill = 'none';
            bookmarkStar.style.stroke = 'currentColor';
            bookmarkStar.parentElement.classList.remove('text-yellow-400');
        }
    }

    resetVisualFeedback() {
        backBtn.style.transform = 'scale(1)';
        forwardBtn.style.transform = 'scale(1)';
        backBtn.style.color = '';
        forwardBtn.style.color = '';
        backBtn.style.filter = '';
        forwardBtn.style.filter = '';

        if (indicatorLeft) {
            indicatorLeft.style.transform = 'translateY(-50%) translateX(-100%)';
            indicatorLeft.style.opacity = '0';
            const inner = indicatorLeft.querySelector('div');
            if (inner) {
                inner.style.backgroundColor = '';
                inner.style.borderColor = '';
                inner.style.boxShadow = 'none';
                inner.style.transform = 'scale(0.6)';
            }
            const label = indicatorLeft.querySelector('.swipe-label');
            if (label) label.textContent = '';
        }
        if (indicatorRight) {
            indicatorRight.style.transform = 'translateY(-50%) translateX(100%)';
            indicatorRight.style.opacity = '0';
            const inner = indicatorRight.querySelector('div');
            if (inner) {
                inner.style.backgroundColor = '';
                inner.style.borderColor = '';
                inner.style.boxShadow = 'none';
                inner.style.transform = 'scale(0.6)';
            }
            const label = indicatorRight.querySelector('.swipe-label');
            if (label) label.textContent = '';
        }
    }

    switchTab(id) {
        this.resetVisualFeedback();
        this.isWaitingForLoad = false;
        this.tabs.forEach(tab => {
            if (tab.id === id) {
                tab.tabEl.classList.add('bg-white', 'dark:bg-gray-700', 'text-blue-600', 'dark:text-white', 'border-black/10', 'dark:border-gray-600', 'shadow-sm', 'dark:shadow-none');
                tab.tabEl.classList.remove('bg-black/5', 'dark:bg-gray-800', 'text-gray-600', 'dark:text-gray-400', 'border-black/5', 'dark:border-gray-700');
                tab.webview.classList.remove('invisible');
                this.activeTabId = id;
                if (tab.isReady) {
                    this.syncBrowserUI(tab.webview);
                    this.updateBookmarkUI(tab.webview.getURL());
                    adblockCount.textContent = tab.adsBlocked || 0;
                }
            } else {
                tab.tabEl.classList.add('bg-black/5', 'dark:bg-gray-800', 'text-gray-600', 'dark:text-gray-400', 'border-black/5', 'dark:border-gray-700');
                tab.tabEl.classList.remove('bg-white', 'dark:bg-gray-700', 'text-blue-600', 'dark:text-white', 'border-black/10', 'dark:border-gray-600', 'shadow-sm', 'dark:shadow-none');
                tab.webview.classList.add('invisible');
            }
        });
    }

    closeTab(id) {
        const index = this.tabs.findIndex(t => t.id === id);
        if (index === -1) return;
        const tab = this.tabs[index];
        tab.tabEl.remove();
        tab.webview.remove();
        this.tabs.splice(index, 1);
        if (this.tabs.length === 0) this.createTab();
        else if (this.activeTabId === id) this.switchTab(this.tabs[Math.max(0, index - 1)].id);
    }

    syncBrowserUI(wv) {
        try {
            if (!wv || typeof wv.getURL !== 'function') return;
            const url = wv.getURL();
            urlInput.value = url.includes('dashboard.html') ? '' : url;
            backBtn.disabled = !wv.canGoBack();
            forwardBtn.disabled = !wv.canGoForward();
            backBtn.style.opacity = wv.canGoBack() ? '1' : '0.3';
            forwardBtn.style.opacity = wv.canGoForward() ? '1' : '0.3';
            this.updateBookmarkUI(url);
        } catch (e) {}
    }

    navigateActiveTab(url) {
        const activewv = this.getActiveWebview();
        if (activewv) activewv.src = url;
    }

    getActiveWebview() {
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        return activeTab ? activeTab.webview : null;
    }

    handleOmniboxInput() {
        clearTimeout(this.suggestionTimeout);
        const query = urlInput.value.trim();
        if (!query) { this.hideSuggestions(); return; }
        this.suggestionTimeout = setTimeout(() => this.fetchSuggestions(query), 150);
    }

    fetchSuggestions(query) {
        const history = Store.getHistory();
        const bookmarks = Store.getBookmarks();

        // Local matches from history and bookmarks
        const localMatches = [...history, ...bookmarks]
            .filter(item => item.url && item.title)
            .filter((item, idx, arr) => arr.findIndex(t => t.url === item.url) === idx) // unique
            .filter(item =>
                item.url.toLowerCase().includes(query.toLowerCase()) ||
                (item.title && item.title.toLowerCase().includes(query.toLowerCase()))
            )
            .slice(0, 4)
            .map(item => ({ type: 'history', label: item.title, url: item.url, host: new URL(item.url).hostname }));

        // Google search suggestion
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
        const searchSuggestion = { type: 'search', label: query, url: searchUrl };

        this.suggestions = [...localMatches, searchSuggestion];
        this.activeSuggestionIndex = -1;
        this.renderSuggestions(query);
    }

    renderSuggestions(query) {
        if (this.suggestions.length === 0) { this.hideSuggestions(); return; }

        suggestionsContainer.classList.remove('opacity-0', 'pointer-events-none');

        suggestionsContainer.innerHTML = this.suggestions.map((s, i) => {
            const icon = s.type === 'history'
                ? `<img src="https://www.google.com/s2/favicons?sz=64&domain=${s.host}" class="w-4 h-4" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=google.com'">`
                : `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`;
            const badge = s.type === 'history'
                ? `<span class="text-[9px] font-bold uppercase text-blue-600 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full shrink-0">Visité</span>`
                : `<span class="text-[9px] font-bold uppercase text-gray-500 bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded-full shrink-0">Recherche</span>`;
            const activeClass = i === this.activeSuggestionIndex ? 'bg-black/5 dark:bg-white/10' : '';
            return `
                <div class="flex items-center gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer ${activeClass} suggestion-item" 
                     data-idx="${i}" 
                     onclick="window.activeTabManager.selectSuggestion(${i})">
                    <div class="w-7 h-7 rounded-lg bg-gray-200 dark:bg-gray-800 flex items-center justify-center shrink-0 text-gray-500 dark:text-gray-400">${icon}</div>
                    <span class="text-sm text-gray-800 dark:text-gray-200 truncate flex-1">${s.label}</span>
                    ${badge}
                </div>
            `;
        }).join('');
    }

    selectSuggestion(idx) {
        if (this.suggestions[idx]) {
            this.navigateActiveTab(this.suggestions[idx].url);
            this.hideSuggestions();
        }
    }

    navigateSuggestions(direction) {
        const len = this.suggestions.length;
        if (len === 0) return;
        this.activeSuggestionIndex = (this.activeSuggestionIndex + direction + len) % len;
        urlInput.value = this.suggestions[this.activeSuggestionIndex].label;
        this.renderSuggestions(urlInput.value);
    }

    hideSuggestions() {
        suggestionsContainer.classList.add('opacity-0', 'pointer-events-none');
        this.activeSuggestionIndex = -1;
        this.suggestions = [];
    }

    toggleSidebar(mode = null) {
        if (mode) this.sidebarMode = mode;
        
        this.sidebarOpen = !this.sidebarOpen;
        if (this.sidebarOpen) {
            sidebar.classList.remove('translate-x-full');
            sidebarOverlay.classList.remove('opacity-0', 'pointer-events-none');
            this.setSidebarMode(this.sidebarMode);
            sidebarSearch.focus();
        } else {
            sidebar.classList.add('translate-x-full');
            sidebarOverlay.classList.add('opacity-0', 'pointer-events-none');
            sidebarSearch.value = '';
            this.sidebarSearchQuery = '';
        }
    }

    setSidebarMode(mode) {
        this.sidebarMode = mode;
        const tabs = [sbShowHistory, sbShowBookmarks, sbShowSessions];
        
        tabs.forEach(btn => {
            btn.classList.remove('text-blue-600', 'dark:text-blue-400', 'bg-white', 'dark:bg-blue-500/10', 'shadow-sm');
            btn.classList.add('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-900', 'dark:hover:text-white');
        });

        const activeBtn = mode === 'history' ? sbShowHistory : (mode === 'bookmarks' ? sbShowBookmarks : sbShowSessions);
        if (activeBtn) {
            activeBtn.classList.add('text-blue-600', 'dark:text-blue-400', 'bg-white', 'dark:bg-blue-500/10', 'shadow-sm');
            activeBtn.classList.remove('text-gray-500', 'dark:text-gray-400', 'hover:text-gray-900', 'dark:hover:text-white');
        }

        this.renderSidebarContent();
    }

    renderSidebarContent() {
        if (this.sidebarMode === 'sessions') {
            this.renderSessionsContent();
            return;
        }

        const data = this.sidebarMode === 'history' ? Store.getHistory() : Store.getBookmarks();
        const filtered = data.filter(item => 
            item.title?.toLowerCase().includes(this.sidebarSearchQuery) || 
            item.url.toLowerCase().includes(this.sidebarSearchQuery)
        );

        if (filtered.length === 0) {
            sidebarContent.innerHTML = `
                <div class="text-center py-12 text-gray-500 border border-black/10 dark:border-white/5 border-dashed rounded-2xl p-4">
                    <p class="text-sm font-medium">Aucun résultat</p>
                </div>
            `;
            return;
        }

        sidebarContent.innerHTML = filtered.map(item => `
            <div class="group flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm dark:shadow-none" onclick="window.activeTabManager.navigateActiveTab('${item.url}'); window.activeTabManager.toggleSidebar()">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg bg-black/5 dark:bg-gray-950/50 flex items-center justify-center shrink-0">
                        <img src="https://www.google.com/s2/favicons?sz=64&domain=${new URL(item.url).hostname}" class="w-4 h-4" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=google.com'">
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${item.title || item.url}</p>
                        <p class="text-[10px] text-gray-500 truncate">${new URL(item.url) ? new URL(item.url).hostname : ''}</p>
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderSessionsContent() {
        const sessions = Store.getSessions();
        const sessionNames = Object.keys(sessions).filter(name => name.toLowerCase().includes(this.sidebarSearchQuery));

        if (sessionNames.length === 0) {
            sidebarContent.innerHTML = `
                <div class="text-center py-12 text-gray-500 border border-black/10 dark:border-white/5 border-dashed rounded-2xl p-4">
                    <p class="text-sm font-medium">Aucune session enregistrée</p>
                </div>
            `;
            return;
        }

        sidebarContent.innerHTML = sessionNames.map(name => `
            <div class="group flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-black/5 dark:hover:border-white/5 shadow-sm dark:shadow-none">
                <div class="flex items-center gap-3 overflow-hidden flex-1" onclick="window.activeTabManager.restoreSession('${name}')">
                    <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-600"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-[13px] font-medium text-gray-800 dark:text-gray-200 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${name}</p>
                        <p class="text-[10px] text-gray-500 truncate">${sessions[name].length} onglets</p>
                    </div>
                </div>
                <button class="p-2 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all" onclick="window.activeTabManager.deleteSession('${name}')">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/></svg>
                </button>
            </div>
        `).join('');
    }

    showSessionModal() {
        sessionModal.classList.remove('opacity-0', 'pointer-events-none');
        sessionModal.querySelector('.transform').classList.remove('scale-95');
        sessionNameInput.value = `Session du ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`;
        sessionNameInput.focus();
    }

    hideSessionModal() {
        sessionModal.classList.add('opacity-0', 'pointer-events-none');
        sessionModal.querySelector('.transform').classList.add('scale-95');
    }

    confirmSaveSession() {
        const name = sessionNameInput.value.trim() || `Session ${Date.now()}`;
        Store.saveSession(name, this.tabs);
        this.isClosingForcefully = true;
        getCurrentWindow().close();
    }

    skipSaveSession() {
        this.isClosingForcefully = true;
        getCurrentWindow().close();
    }

    cancelSaveSession() {
        this.hideSessionModal();
    }

    restoreSession(name) {
        const sessions = Store.getSessions();
        const tabsData = sessions[name];
        if (!tabsData) return;

        // Close all existing tabs first
        [...this.tabs].forEach(t => this.closeTab(t.id));

        // Restore pinned tabs and then normal tabs
        tabsData.forEach(tabData => {
            this.createTab(tabData.url, tabData.isPinned);
        });

        this.toggleSidebar();
    }

    deleteSession(name) {
        if (confirm(`Voulez-vous supprimer la session "${name}" ?`)) {
            Store.deleteSession(name);
            this.renderSessionsContent();
        }
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    if (isPrivate) {
        document.body.classList.add('private-mode');
    }
    window.activeTabManager = new TabManager();

    // ── Navbar Auto-Hide (Removed per user request) ────────────────
});
