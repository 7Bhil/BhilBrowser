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
const indicatorLeft = document.getElementById('swipe-indicator-left');
const indicatorRight = document.getElementById('swipe-indicator-right');

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

        this.setupGeneralListeners();
        this.setupGlobalGestureListener();
        this.createTab();
    }

    setupGeneralListeners() {
        addTabBtn.addEventListener('click', () => this.createTab());

        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = urlInput.value.trim();
                if (url) {
                    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
                        url = (url.includes('.') && !url.includes(' ')) ? 'https://' + url : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
                    }
                    this.navigateActiveTab(url);
                }
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

        window.addEventListener('keydown', (e) => {
            if (e.altKey) {
                const wv = this.getActiveWebview();
                if (!wv) return;
                if (e.key === 'ArrowLeft' && wv.canGoBack()) wv.goBack();
                if (e.key === 'ArrowRight' && wv.canGoForward()) wv.goForward();
            }
        });
    }

    // Handles gestures for the UI areas (Tabs, Nav Bar)
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
        
        // Reset if vertical scroll or pause between scrolls
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

            // 1. Calculate Progress
            const progress = Math.min(1, Math.abs(this.scrollDeltaX) / triggerThreshold);
            
            // 2. Animate Indicators (Gâchette de Navigation)
            if (Math.abs(this.scrollDeltaX) > 10) {
                // Move closer to center: from -100% to +40% (instead of 0)
                const translateX = isLeft ? 
                    (-100 + (progress * 140)) : 
                    (100 - (progress * 140));
                activeIndicator.style.transform = `translateY(-50%) translateX(${translateX}%)`;
                activeIndicator.style.opacity = progress;
                
                const innerCircle = activeIndicator.querySelector('div');
                if (innerCircle) {
                    innerCircle.style.transform = `scale(${0.6 + (progress * 0.4)})`;
                    
                    // "Armed" State visual feedback
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

            // 3. Setup "On-Release" trigger
            clearTimeout(this.gestureTimeout);
            this.gestureTimeout = setTimeout(() => {
                if (this.isThresholdMet) {
                    console.log('>>> GESTURE VALIDATED ON RELEASE');
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
            }, 100); // Wait for 100ms of inactivity to detect "release"
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
        if (!url) url = `file://${path.join(__dirname, 'dashboard.html')}`;
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
        webview.setAttribute('preload', `file://${path.join(__dirname, 'preload.js')}`);
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

    resetVisualFeedback() {
        backBtn.style.transform = 'scale(1)';
        forwardBtn.style.transform = 'scale(1)';
        backBtn.style.color = '';
        forwardBtn.style.color = '';
        backBtn.style.filter = '';
        forwardBtn.style.filter = '';

        // Reset Indicators
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
                if (tab.isReady) this.syncBrowserUI(tab.webview);
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
}

// Initialize
window.addEventListener('DOMContentLoaded', () => {
    new TabManager();
});
