// src/main.js
const { ipcMain } = require('electron');
const agent = require('./engine/agent');
const { open_web_tool } = require('./tools/web_tools');
const { yt_search_tool } = require('./tools/yt_tools');

// Fungsi utama untuk memproses perintah yang datang dari UI atau Voice
async function handleCommand(userInput) {
    console.log(`\n[USER]: ${userInput}`);

    // 1. Ambil respon dasar dari AI
    let aiResponse = await agent.processInput(userInput);

    // 2. Logika Routing Tool (Fase 2)
    // Kita mengecek apakah input user atau jawaban AI memerlukan aksi fisik
    const lowerInput = userInput.toLowerCase();

    if (lowerInput.includes("buka") || lowerInput.includes("open")) {
        // Contoh: "Buka google.com" -> jalankan open_web_tool
        const result = open_web_tool(userInput); 
        aiResponse = result; // Ganti jawaban AI dengan hasil eksekusi alat jika perlu
    } 
    else if (lowerInput.includes("youtube") || lowerInput.includes("cari video")) {
        // Contoh: "Cari video musik di youtube" -> jalankan yt_search_tool
        const result = yt_search_tool(userInput);
        aiResponse = result;
    }

    console.log(`\n[JARVIS]: ${aiResponse}`);
    return aiResponse;
}

// Hanya jalankan ipcMain jika berjalan di lingkungan Electron
try {
    const { ipcMain } = require('electron');
    ipcMain.on('process-command', async (event, userInput) => {
        try {
            const response = await handleCommand(userInput);
            event.reply('process-response', response);
        } catch (error) {
            console.error("IPC Error:", error);
            event.reply('process-response', "Maaf, terjadi kesalahan.");
        }
    });
} catch (e) {
    // Jika tidak ada electron, abaikan (ini membantu saat menjalankan test_brain.js)
}

module.exports = { handleCommand }; // Export agar bisa ditest secara mandiri