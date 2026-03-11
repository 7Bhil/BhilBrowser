const { ipcRenderer } = require('electron');

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
