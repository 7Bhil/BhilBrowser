const webview = document.getElementById('webview');
const urlInput = document.getElementById('url-input');
const backBtn = document.getElementById('back');
const forwardBtn = document.getElementById('forward');
const refreshBtn = document.getElementById('refresh');

// Navigation
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
        webview.src = url;
    }
});

backBtn.addEventListener('click', () => {
    if (webview.canGoBack()) webview.goBack();
});

forwardBtn.addEventListener('click', () => {
    if (webview.canGoForward()) webview.goForward();
});

refreshBtn.addEventListener('click', () => {
    webview.reload();
});

// Update URL input and buttons state
webview.addEventListener('did-start-loading', () => {
    refreshBtn.classList.add('animate-spin');
});

webview.addEventListener('did-stop-loading', () => {
    refreshBtn.classList.remove('animate-spin');
    urlInput.value = webview.getURL();
    backBtn.disabled = !webview.canGoBack();
    forwardBtn.disabled = !webview.canGoForward();
});

webview.addEventListener('did-fail-load', (e) => {
    console.error('Failed to load:', e);
});
