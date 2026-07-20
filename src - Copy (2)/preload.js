// src/preload.js
// Jembatan aman antara Frontend (renderer) dan Backend (main process)
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('jarvis', {
    // ==================== AI AGENT ====================
    
    /** Kirim perintah dan dapatkan response (non-streaming) */
    sendCommand: (input) => ipcRenderer.invoke('process-command', input),
    
    /** Kirim perintah dengan streaming response real-time */
    sendCommandStream: (input) => ipcRenderer.invoke('process-command-stream', input),
    
    /** Listener untuk token streaming dari AI */
    onStreamToken: (callback) => {
        ipcRenderer.on('stream-token', (event, token) => callback(token));
    },
    
    /** Listener untuk status update */
    onStatusUpdate: (callback) => {
        ipcRenderer.on('status-update', (event, data) => callback(data));
    },
    
    // ==================== WEB TOOLS ====================
    
    /** Buka URL di browser default */
    openWeb: (url) => ipcRenderer.invoke('tool-open-web', url),
    
    /** Baca/scrape konten dari halaman web */
    scrapeWeb: (url) => ipcRenderer.invoke('tool-scrape-web', url),
    
    /** Cari informasi di web (Google Search) */
    searchWeb: (query) => ipcRenderer.invoke('tool-search-web', query),
    
    // ==================== YOUTUBE TOOLS ====================
    
    /** Cari konten di YouTube */
    searchYouTube: (query) => ipcRenderer.invoke('tool-search-yt', query),
    
    /** Putar lagu dari YouTube Music */
    playMusic: (query) => ipcRenderer.invoke('tool-play-music', query),
    
    /** Putar video dari YouTube */
    playVideo: (query) => ipcRenderer.invoke('tool-play-video', query),
    
    /** Dapatkan info video YouTube */
    getYouTubeInfo: (url) => ipcRenderer.invoke('tool-yt-info', url),
    
    // ==================== AGENT STATE ====================
    
    /** Dapatkan status agent saat ini */
    getAgentState: () => ipcRenderer.invoke('get-agent-state'),
    
    /** Update status agent */
    updateAgentState: (newState) => ipcRenderer.invoke('update-agent-state', newState),
    
    // ==================== WINDOW CONTROLS ====================
    
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),
    
    /** Tandai bahwa window sudah siap */
    windowReady: () => ipcRenderer.send('window-ready'),
});