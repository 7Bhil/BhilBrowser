const path = require('path');

// Select DOM elements
const tabBar = document.getElementById('tab-bar');
const addTabBtn = document.getElementById('add-tab');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');
const homeBtn = document.getElementById('home');

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.nextTabId = 0;

        // Global Event Listeners
        this.setupGeneralListeners();
        
        // Initial Tab
        this.createTab();
    }

    setupGeneralListeners() {
        // Add Tab Button
        addTabBtn.addEventListener('click', () => {
            console.log('UI: Add Tab Clicked');
            this.createTab();
        });

        // URL Input (Search / Navigate)
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = urlInput.value.trim();
                console.log('UI: Navigate to', url);
                if (url) {
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                        if (url.includes('.') && !url.includes(' ')) {
                            url = 'https://' + url;
                        } else {
                            url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                        }
                    }
                    this.navigateActiveTab(url);
                }
            }
        });

        // Navigation Buttons
        backBtn.addEventListener('click', () => {
            console.log('UI: Back Clicked');
            const activeWebview = this.getActiveWebview();
            if (activeWebview) {
                activeWebview.focus();
                if (activeWebview.canGoBack()) activeWebview.goBack();
            }
        });

        forwardBtn.addEventListener('click', () => {
            console.log('UI: Forward Clicked');
            const activeWebview = this.getActiveWebview();
            if (activeWebview) {
                activeWebview.focus();
                if (activeWebview.canGoForward()) activeWebview.goForward();
            }
        });

        refreshBtn.addEventListener('click', () => {
            console.log('UI: Refresh Clicked');
            const activeWebview = this.getActiveWebview();
            if (activeWebview) activeWebview.reload();
        });

        homeBtn.addEventListener('click', () => {
            console.log('UI: Home Clicked');
            const homeUrl = `file://${path.join(__dirname, 'dashboard.html')}`;
            this.navigateActiveTab(homeUrl);
        });

        // Keyboard Shortcuts (Alt + Arrows)
        window.addEventListener('keydown', (e) => {
            if (e.altKey) {
                const activeWebview = this.getActiveWebview();
                if (!activeWebview) return;
                if (e.key === 'ArrowLeft' && activeWebview.canGoBack()) activeWebview.goBack();
                if (e.key === 'ArrowRight' && activeWebview.canGoForward()) activeWebview.goForward();
            }
        });
    }

    createTab(url = null) {
        if (!url) {
            url = `file://${path.join(__dirname, 'dashboard.html')}`;
        }
        
        const id = this.nextTabId++;
        console.log(`Tab: Creating tab ${id} with URL ${url}`);

        // 1. Create Tab UI Element
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
            if (e.target.closest('.close-tab')) {
                this.closeTab(id);
            } else {
                this.switchTab(id);
            }
        });

        // 2. Create Webview element
        const webview = document.createElement('webview');
        webview.id = `webview-${id}`;
        webview.src = url;
        webview.setAttribute('allowpopups', '');
        webview.className = 'absolute inset-0 w-full h-full invisible bg-white';

        // 3. Setup Webview Listeners
        this.setupWebviewListeners(webview, id, tabEl);

        // 4. Inject into DOM
        webviewContainer.appendChild(webview);
        tabBar.insertBefore(tabEl, addTabBtn);

        // 5. Register Tab
        this.tabs.push({ id, tabEl, webview });
        this.switchTab(id);
    }

    setupWebviewListeners(webview, id, tabEl) {
        let isReady = false;

        const updateUI = () => {
            if (this.activeTabId === id && isReady) {
                this.syncBrowserUI(webview);
            }
        };

        webview.addEventListener('did-start-loading', () => {
            if (this.activeTabId === id) refreshBtn.classList.add('animate-spin');
        });

        webview.addEventListener('did-stop-loading', () => {
            if (this.activeTabId === id) refreshBtn.classList.remove('animate-spin');
            updateUI();
        });

        webview.addEventListener('dom-ready', () => {
            isReady = true;
            console.log(`Webview ${id} is ready`);
            updateUI();
        });

        webview.addEventListener('did-navigate', updateUI);
        webview.addEventListener('did-navigate-in-page', updateUI);
        
        webview.addEventListener('did-start-navigation', (e) => {
            if (this.activeTabId === id) {
                // Instantly update URL bar for better feel
                urlInput.value = e.url.includes('dashboard.html') ? '' : e.url;
            }
        });

        webview.addEventListener('page-title-updated', (e) => {
            const title = e.title || (webview.getURL().includes('dashboard.html') ? 'Home' : 'Loading...');
            tabEl.querySelector('span').textContent = title;
        });

        // Two-finger swipe gesture detection
        let scrollDeltaX = 0;
        let lastScrollTime = Date.now();
        let isThresholdMet = false;

        webview.addEventListener('wheel', (e) => {
            const now = Date.now();
            // Reset if pause between scrolls or if vertical scroll becomes dominant
            if (now - lastScrollTime > 200 || Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                scrollDeltaX = 0;
                isThresholdMet = false;
                this.resetVisualFeedback();
            }
            lastScrollTime = now;

            // Only handle horizontal dominant scrolls
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2) {
                scrollDeltaX += e.deltaX;
                
                // Visual feedback hints (more sensitive)
                if (Math.abs(scrollDeltaX) > 30) {
                    if (scrollDeltaX < 0) {
                        backBtn.style.transform = `scale(${1 + Math.min(0.2, Math.abs(scrollDeltaX)/400)})`;
                        backBtn.style.color = '#60a5fa'; // blue-400
                    } else {
                        forwardBtn.style.transform = `scale(${1 + Math.min(0.2, Math.abs(scrollDeltaX)/400)})`;
                        forwardBtn.style.color = '#60a5fa'; // blue-400
                    }
                }

                // Threshold for swipe accomplishment (lowered for Linux trackpads)
                const threshold = 120; 
                if (!isThresholdMet) {
                    if (scrollDeltaX > threshold) {
                        if (webview.canGoForward()) {
                            console.log('Gesture: Forward triggered');
                            webview.goForward();
                            isThresholdMet = true;
                        }
                        scrollDeltaX = 0;
                        this.resetVisualFeedback();
                    } else if (scrollDeltaX < -threshold) {
                        if (webview.canGoBack()) {
                            console.log('Gesture: Back triggered');
                            webview.goBack();
                            isThresholdMet = true;
                        }
                        scrollDeltaX = 0;
                        this.resetVisualFeedback();
                    }
                }
            }
        }, { passive: true });
    }

    resetVisualFeedback() {
        backBtn.style.transform = 'scale(1)';
        forwardBtn.style.transform = 'scale(1)';
        backBtn.style.color = '';
        forwardBtn.style.color = '';
    }

    switchTab(id) {
        console.log(`Tab: Switching to tab ${id}`);
        this.tabs.forEach(tab => {
            if (tab.id === id) {
                tab.tabEl.classList.add('bg-gray-700', 'text-white', 'border-gray-600');
                tab.tabEl.classList.remove('bg-gray-900', 'text-gray-400');
                tab.webview.classList.remove('invisible');
                this.activeTabId = id;
                this.syncBrowserUI(tab.webview);
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

        if (this.tabs.length === 0) {
            this.createTab();
        } else if (this.activeTabId === id) {
            const nextTab = this.tabs[Math.max(0, index - 1)];
            this.switchTab(nextTab.id);
        }
    }

    syncBrowserUI(webview) {
        // Update URL Input
        const url = webview.getURL();
        urlInput.value = url.includes('dashboard.html') ? '' : url;

        // Update Nav Buttons State
        backBtn.disabled = !webview.canGoBack();
        forwardBtn.disabled = !webview.canGoForward();
        
        backBtn.style.opacity = webview.canGoBack() ? '1' : '0.3';
        forwardBtn.style.opacity = webview.canGoForward() ? '1' : '0.3';
    }

    navigateActiveTab(url) {
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        if (activeTab) {
            activeTab.webview.src = url;
        }
    }

    getActiveWebview() {
        const activeTab = this.tabs.find(t => t.id === this.activeTabId);
        return activeTab ? activeTab.webview : null;
    }
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    new TabManager();
});
