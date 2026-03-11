const path = require('path');
const tabBar = document.getElementById('tab-bar');
const addTabBtn = document.getElementById('add-tab');
const webviewContainer = document.getElementById('webview-container');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');

class TabManager {
    constructor() {
        this.tabs = [];
        this.activeTabId = null;
        this.nextTabId = 0;

        addTabBtn.addEventListener('click', () => this.createTab());
        
        // Initial tab
        this.createTab(`file://${path.join(__dirname, 'dashboard.html')}`);

        // URL navigation
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = urlInput.value.trim();
                if (!url.startsWith('http://') && !url.startsWith('https://')) {
                    if (url.includes('.') && !url.includes(' ')) {
                        url = 'https://' + url;
                    } else {
                        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                    }
                }
                const activeTab = this.getActiveTab();
                if (activeTab) activeTab.webview.src = url;
            }
        });

        // Controls
        backBtn.addEventListener('click', () => {
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.webview.canGoBack()) activeTab.webview.goBack();
        });

        forwardBtn.addEventListener('click', () => {
            const activeTab = this.getActiveTab();
            if (activeTab && activeTab.webview.canGoForward()) activeTab.webview.goForward();
        });

        refreshBtn.addEventListener('click', () => {
            const activeTab = this.getActiveTab();
            if (activeTab) activeTab.webview.reload();
        });
    }

    createTab(url = `file://${path.join(__dirname, 'dashboard.html')}`) {
        const id = this.nextTabId++;
        
        // Create Tab UI
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

        // Create Webview
        const webview = document.createElement('webview');
        webview.id = `webview-${id}`;
        webview.src = url;
        webview.autosize = 'on';
        webview.className = 'absolute inset-0 w-full h-full invisible';
        webview.setAttribute('allowpopups', '');

        // Webview Events
        webview.addEventListener('did-start-loading', () => {
            if (this.activeTabId === id) refreshBtn.classList.add('animate-spin');
        });

        webview.addEventListener('did-stop-loading', () => {
            let title = webview.getTitle();
            if (webview.getURL().includes('dashboard.html')) title = 'Home';
            tabEl.querySelector('span').textContent = title || 'Home';
            if (this.activeTabId === id) {
                refreshBtn.classList.remove('animate-spin');
                urlInput.value = webview.getURL().includes('dashboard.html') ? '' : webview.getURL();
                this.updateNavButtons();
            }
        });

        // Crucial for back/forward buttons state
        const updateButtons = () => {
            if (this.activeTabId === id) this.updateNavButtons();
        };

        webview.addEventListener('did-navigate', updateButtons);
        webview.addEventListener('did-navigate-in-page', updateButtons);
        webview.addEventListener('dom-ready', updateButtons);

        webview.addEventListener('page-title-updated', (e) => {
            tabEl.querySelector('span').textContent = e.title;
        });

        // Two-finger swipe gesture detection
        let scrollDeltaX = 0;
        let lastScrollTime = Date.now();

        webview.addEventListener('wheel', (e) => {
            const now = Date.now();
            if (now - lastScrollTime > 500) scrollDeltaX = 0; // Reset if pause
            lastScrollTime = now;

            // Only handle horizontal scrolls (two-finger swipe)
            if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 2) {
                scrollDeltaX += e.deltaX;
                
                // Visual feedback (optional: change button opacity or scale)
                if (Math.abs(scrollDeltaX) > 50) {
                    if (scrollDeltaX < 0) backBtn.classList.add('scale-110', 'text-blue-400');
                    else forwardBtn.classList.add('scale-110', 'text-blue-400');
                }

                // Threshold for swipe
                if (scrollDeltaX > 150) {
                    if (webview.canGoForward()) webview.goForward();
                    this.resetGestures(scrollDeltaX);
                    scrollDeltaX = 0;
                } else if (scrollDeltaX < -150) {
                    if (webview.canGoBack()) webview.goBack();
                    this.resetGestures(scrollDeltaX);
                    scrollDeltaX = 0;
                }
            } else {
                scrollDeltaX = 0;
                this.resetGestures();
            }
        });

        webviewContainer.appendChild(webview);
        tabBar.insertBefore(tabEl, addTabBtn);

        this.tabs.push({ id, tabEl, webview });
        this.switchTab(id);
    }

    resetGestures() {
        backBtn.classList.remove('scale-110', 'text-blue-400');
        forwardBtn.classList.remove('scale-110', 'text-blue-400');
    }

    switchTab(id) {
        this.tabs.forEach(tab => {
            if (tab.id === id) {
                tab.tabEl.classList.remove('bg-gray-800', 'text-gray-500');
                tab.tabEl.classList.add('bg-gray-700', 'text-white', 'border-gray-600');
                tab.webview.classList.remove('invisible');
                this.activeTabId = id;
                
                const url = tab.webview.getURL();
                urlInput.value = url.includes('dashboard.html') ? '' : url;
                
                this.updateNavButtons();
            } else {
                tab.tabEl.classList.add('bg-gray-800', 'text-gray-500');
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

    getActiveTab() {
        return this.tabs.find(t => t.id === this.activeTabId);
    }

    updateNavButtons() {
        const activeTab = this.getActiveTab();
        if (activeTab) {
            backBtn.disabled = !activeTab.webview.canGoBack();
            forwardBtn.disabled = !activeTab.webview.canGoForward();
        }
    }
}

new TabManager();
