const { exec } = require('child_process');

/**
 * Membuka URL di browser default pengguna.
 */

function open_web_tool(url) {
    console.log(`[TOOL] Opening web: ${url}`);
    try {
        // Menggunakan perintah sistem untuk membuka browser
        const command = process.platform === 'win32' ? `start ${url}` : `open ${url}`;
        exec(command); 
        return `Berhasil memerintahkan sistem untuk membuka ${url}`;
    } catch (error) {
        return `Gagal membuka website: ${error.message}`;
    }
}

module.exports = { open_web_tool };