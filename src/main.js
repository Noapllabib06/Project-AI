// src/main.js
// Electron Main Process - Window Management, IPC, Tool Orchestrator
const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const agent = require('./engine/agent');
const { open_web_tool, scrape_web_tool, search_web_tool } = require('./tools/web_tools');
const { yt_search_tool, play_youtube_music, play_youtube_video, getVideoInfo } = require('./tools/yt_tools');

// Suppress Chromium audio stream errors
process.env.ELECTRON_NO_ATTACHED_CONSOLE = '1';

// Add Electron command line switches to suppress audio stream errors
if (process.defaultApp || /[\\/]electron/.test(process.execPath)) {
    app.commandLine.appendSwitch('disable-features', 'AudioServiceOutOfProcess');
}

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        frame: false,
        transparent: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            // Microphone permissions untuk voice input
            permissions: ['microphone', 'audio-capture', 'media'],
            // Enable audio capture
            audioCapture: true,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'gui', 'index.html'));
}

// ============ AI AGENT ORCHESTRATOR ============

/**
 * Proses perintah pengguna dengan smart routing ke agent
 * Agent sudah memiliki intent detection & tool execution
 */
async function processUserCommand(userInput) {
    console.log(`\n[USER]: ${userInput}`);
    
    // Update status menjadi "Memproses..."
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', { text: 'Memproses...', state: 'thinking' });
    }
    
    // Agent akan mendeteksi intent dan menjalankan tool atau chat
    const response = await agent.processInput(userInput);
    
    console.log(`[JARVIS]: ${response}`);
    
    // Kembalikan status ke idle
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', { text: 'Menunggu perintah...', state: 'idle' });
    }
    
    return response;
}

// ============ IPC HANDLERS ============

// Handler utama: proses perintah (tanpa streaming)
ipcMain.handle('process-command', async (event, userInput) => {
    try {
        const response = await processUserCommand(userInput);
        return { success: true, response };
    } catch (error) {
        console.error("IPC Error:", error);
        return { success: false, response: "❌ Maaf, terjadi kesalahan internal." };
    }
});

// Handler streaming: untuk chat AI real-time
ipcMain.handle('process-command-stream', async (event, userInput) => {
    try {
        const stream = await agent.processInputStream(userInput, (token) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stream-token', token);
            }
        });
        return { success: true, response: stream };
    } catch (error) {
        console.error("Stream Error:", error);
        return { success: false, response: "❌ Maaf, terjadi kesalahan saat streaming." };
    }
});

// ============ TOOL IPC HANDLERS (Akses langsung dari UI jika perlu) ============

// Buka URL di browser
ipcMain.handle('tool-open-web', async (event, url) => {
    return await open_web_tool(url);
});

// Baca konten halaman web
ipcMain.handle('tool-scrape-web', async (event, url) => {
    return await scrape_web_tool(url);
});

// Cari di web
ipcMain.handle('tool-search-web', async (event, query) => {
    return await search_web_tool(query);
});

// Cari YouTube
ipcMain.handle('tool-search-yt', async (event, query) => {
    return await yt_search_tool(query);
});

// Putar musik YouTube
ipcMain.handle('tool-play-music', async (event, query) => {
    agent.updateState(`Memutar musik: "${query}"`);
    return await play_youtube_music(query);
});

// Putar video YouTube
ipcMain.handle('tool-play-video', async (event, query) => {
    agent.updateState(`Memutar video: "${query}"`);
    return await play_youtube_video(query);
});

// Dapatkan info video YouTube
ipcMain.handle('tool-yt-info', async (event, url) => {
    return await getVideoInfo(url);
});

// Dapatkan status agent
ipcMain.handle('get-agent-state', async () => {
    return agent.currentState;
});

// Update status agent
ipcMain.handle('update-agent-state', async (event, newState) => {
    agent.updateState(newState);
    return { success: true };
});

// ============ WINDOW CONTROLS ============

ipcMain.on('window-minimize', () => {
    if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
    if (mainWindow) {
        mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
    }
});

ipcMain.on('window-close', () => {
    if (mainWindow) mainWindow.close();
});

// Kirim status update ke renderer saat window siap
ipcMain.on('window-ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('status-update', { 
            text: agent.currentState, 
            state: 'idle' 
        });
    }
});

// ============ APP LIFECYCLE ============

app.whenReady().then(() => {
    // Set permissions untuk microphone dan audio
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media' || permission === 'microphone' || permission === 'audio-capture') {
            console.log('[Main] Microphone permission granted');
            callback(true);
            return;
        }
        callback(false);
    });

    // Set permission untuk media streams (audio)
    session.defaultSession.setDevicePermissionHandler((details, callback) => {
        if (details.deviceType === 'audioinput') {
            console.log('[Main] Audio input device permission granted');
            callback(true);
            return;
        }
        callback(false);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

module.exports = { processUserCommand };