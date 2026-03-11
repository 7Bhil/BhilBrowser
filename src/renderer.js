const { ipcRenderer } = require('electron');
const path = require('path');
const Store = require('./store');

// Detect if we are in a private window
const isPrivate = new URLSearchParams(window.location.search).get('private') === 'true';

// Select DOM elements
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

// Omnibox Suggestions
const suggestionsContainer = document.getElementById('suggestions-container');

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

        this.setupGeneralListeners();
        this.setupGlobalGestureListener();
        this.setupKeyboardShortcuts();
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

        sbShowHistory.addEventListener('click', () => this.setSidebarMode('history'));
        sbShowBookmarks.addEventListener('click', () => this.setSidebarMode('bookmarks'));

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
        const { getCurrentWindow } = require('@electron/remote');
        const win = getCurrentWindow();

        document.getElementById('win-close').addEventListener('click', () => win.close());
        document.getElementById('win-minimize').addEventListener('click', () => win.minimize());
        document.getElementById('win-maximize').addEventListener('click', () => {
            if (win.isMaximized()) win.unmaximize();
            else win.maximize();
        });

        // Ad-blocker toggle
        const { ipcRenderer } = require('electron');
        const adblockBtn = document.getElementById('adblock-btn');
        const adblockIcon = document.getElementById('adblock-icon');
        let adblockEnabled = true;

        const updateAdblockUI = (enabled) => {
            adblockIcon.style.color = enabled ? '#34d399' : '#6b7280';
            adblockBtn.title = enabled ? 'Bloqueur actif (cliquer pour désactiver)' : 'Bloqueur désactivé (cliquer pour activer)';
        };
        updateAdblockUI(true);

        adblockBtn.addEventListener('click', () => {
            adblockEnabled = !adblockEnabled;
            ipcRenderer.send('toggle-adblock', adblockEnabled);
            updateAdblockUI(adblockEnabled);
        });
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

    createTab(url = null) {
        if (!url) {
            url = `file://${path.join(__dirname, 'dashboard.html')}`;
            console.log('Loading Dashboard from:', url);
        }
        const id = this.nextTabId++;
        
        const tabEl = document.createElement('div');
        tabEl.className = 'group flex items-center h-8 px-3 bg-gray-800 rounded-t-lg border-x border-t border-gray-700 max-w-[200px] min-w-[120px] transition-all cursor-pointer relative shrink-0';
        tabEl.id = `tab-${id}`;
        tabEl.innerHTML = `
            <span class="text-xs truncate mr-2 pointer-events-none flex-1">Home</span>
            <button class="close-tab p-0.5 hover:bg-gray-700 rounded transition-colors opacity-0 group-hover:opacity-100">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
        `;

        tabEl.addEventListener('click', (e) => {
            if (e.target.closest('.close-tab')) this.closeTab(id);
            else this.switchTab(id);
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
        tabBar.insertBefore(tabEl, addTabBtn);
        this.tabs.push({ id, tabEl, webview, isReady: false });
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

                // Inject data into Dashboard if loaded
                if (url.includes('dashboard.html')) {
                    const history = JSON.stringify(Store.getHistory());
                    const bookmarks = JSON.stringify(Store.getBookmarks());
                    wv.executeJavaScript(`
                        if (typeof window.injectDashboardData === 'function') {
                            window.injectDashboardData(${history}, ${bookmarks});
                        }
                    `).catch(() => {});
                }
            }
            updateUI();
        });

        wv.addEventListener('dom-ready', () => {
            const tab = this.tabs.find(t => t.id === id);
            if (tab) tab.isReady = true;
            updateUI();
        });

        wv.addEventListener('did-navigate', updateUI);
        wv.addEventListener('did-navigate-in-page', updateUI);
        
        wv.addEventListener('did-start-navigation', (e) => {
            if (this.activeTabId === id) urlInput.value = e.url.includes('dashboard.html') ? '' : e.url;
        });

        wv.addEventListener('page-title-updated', (e) => {
            const title = e.title || (wv.getURL().includes('dashboard.html') ? 'Home' : 'Loading...');
            tabEl.querySelector('span').textContent = title;
        });

        wv.addEventListener('ipc-message', (e) => {
            if (e.channel === 'gesture-wheel') {
                if (this.activeTabId === id) {
                    this.handleGestureScroll(e.args[0].deltaX, e.args[0].deltaY);
                }
            }
        });
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
                tab.tabEl.classList.add('bg-gray-700', 'text-white', 'border-gray-600');
                tab.tabEl.classList.remove('bg-gray-900', 'text-gray-400');
                tab.webview.classList.remove('invisible');
                this.activeTabId = id;
                if (tab.isReady) {
                    this.syncBrowserUI(tab.webview);
                    this.updateBookmarkUI(tab.webview.getURL());
                }
            } else {
                tab.tabEl.classList.add('bg-gray-900', 'text-gray-400');
                tab.tabEl.classList.remove('bg-gray-700', 'text-white', 'border-gray-600');
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
                ? `<span class="text-[9px] font-bold uppercase text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full shrink-0">Visité</span>`
                : `<span class="text-[9px] font-bold uppercase text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full shrink-0">Recherche</span>`;
            const activeClass = i === this.activeSuggestionIndex ? 'bg-white/10' : '';
            return `
                <div class="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors cursor-pointer ${activeClass} suggestion-item" 
                     data-idx="${i}" 
                     onclick="window.activeTabManager.selectSuggestion(${i})">
                    <div class="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 text-gray-400">${icon}</div>
                    <span class="text-sm text-gray-200 truncate flex-1">${s.label}</span>
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
        if (mode === 'history') {
            sbShowHistory.classList.add('text-blue-400', 'bg-blue-500/10');
            sbShowBookmarks.classList.remove('text-blue-400', 'bg-blue-500/10');
            sbShowBookmarks.classList.add('text-gray-400');
        } else {
            sbShowBookmarks.classList.add('text-blue-400', 'bg-blue-500/10');
            sbShowHistory.classList.remove('text-blue-400', 'bg-blue-500/10');
            sbShowHistory.classList.add('text-gray-400');
        }
        this.renderSidebarContent();
    }

    renderSidebarContent() {
        const data = this.sidebarMode === 'history' ? Store.getHistory() : Store.getBookmarks();
        const filtered = data.filter(item => 
            item.title?.toLowerCase().includes(this.sidebarSearchQuery) || 
            item.url.toLowerCase().includes(this.sidebarSearchQuery)
        );

        if (filtered.length === 0) {
            sidebarContent.innerHTML = `
                <div class="text-center py-12 text-gray-600 border border-white/5 border-dashed rounded-2xl">
                    Aucun résultat
                </div>
            `;
            return;
        }

        sidebarContent.innerHTML = filtered.map(item => `
            <div class="group flex items-center justify-between p-3 hover:bg-white/5 rounded-xl transition-all cursor-pointer border border-transparent hover:border-white/5" onclick="window.activeTabManager.navigateActiveTab('${item.url}'); window.activeTabManager.toggleSidebar()">
                <div class="flex items-center gap-3 overflow-hidden">
                    <div class="w-8 h-8 rounded-lg bg-gray-950/50 flex items-center justify-center shrink-0">
                        <img src="https://www.google.com/s2/favicons?sz=64&domain=${new URL(item.url).hostname}" class="w-4 h-4" onerror="this.src='https://www.google.com/s2/favicons?sz=64&domain=google.com'">
                    </div>
                    <div class="overflow-hidden">
                        <p class="text-[13px] font-medium text-gray-200 truncate group-hover:text-blue-400 transition-colors">${item.title || item.url}</p>
                        <p class="text-[10px] text-gray-500 truncate">${new URL(item.url).hostname}</p>
                    </div>
                </div>
            </div>
        `).join('');
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
