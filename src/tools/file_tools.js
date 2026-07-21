/**
 * src/tools/file_tools.js
 * File System Tools - Membuat dan menulis file teks ke Desktop
 * Menggunakan modul bawaan Node.js: fs, path, os
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('../utils/logger');

/**
 * Buat file teks di Desktop pengguna
 * @param {string} query - Format: "nama_file.txt|Isi konten file..."
 * @returns {string} Pesan sukses/gagal dalam bahasa Indonesia
 */
function createFile(query) {
    logger.tool('createFile', `Input: "${query.substring(0, 100)}..."`);

    try {
        // Validasi input
        if (!query || typeof query !== 'string') {
            return "❌ Query tidak valid. Gunakan format: nama_file.txt|Isi konten";
        }

        // Pisahkan nama file dan konten berdasarkan delimiter '|'
        const delimiterIndex = query.indexOf('|');
        let filename, content;

        if (delimiterIndex === -1) {
            // Jika tanpa delimiter, anggap seluruh string adalah nama file (kosong)
            filename = query.trim();
            content = '';
        } else {
            filename = query.substring(0, delimiterIndex).trim();
            content = query.substring(delimiterIndex + 1).trim();
        }

        if (!filename) {
            return "❌ Nama file tidak boleh kosong. Gunakan format: nama_file.txt|Isi konten";
        }

        // Bersihkan nama file dari karakter berbahaya
        filename = filename.replace(/[<>:"/\\|?*]/g, '_');

        // Tentukan path ke Desktop
        const desktopPath = path.join(os.homedir(), 'Desktop');
        const filePath = path.join(desktopPath, filename);

        // Konversi escape sequences: \n → newline, \t → tab, \\ → \
        // (LLM diminta menggunakan \\n di JSON agar valid, setelah JSON.parse jadi \n string literal)
        content = content.replace(/\\n/g, '\n')
                         .replace(/\\t/g, '\t')
                         .replace(/\\\\/g, '\\');

        // Buat file (sinkronus agar langsung selesai)
        fs.writeFileSync(filePath, content, { encoding: 'utf-8' });

        // Verifikasi file benar-benar tertulis
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            logger.tool('createFile', `✅ File berhasil dibuat: ${filePath} (${sizeKB} KB)`);
            return `✅ File **${filename}** berhasil dibuat di Desktop. (${sizeKB} KB)`;
        } else {
            return `❌ Gagal memverifikasi file ${filename} setelah ditulis.`;
        }
    } catch (error) {
        logger.error('createFile', error);
        return `❌ Gagal membuat file: ${error.message}`;
    }
}

/**
 * Baca isi file teks dari path yang diberikan
 * @param {string} query - Path absolut atau relatif ke file
 * @returns {Promise<{ success: boolean, data: string }>}
 */
async function readFileTool(query) {
    logger.tool('readFileTool', `Reading: "${query.substring(0, 100)}"`);
    try {
        // Ekstrak path dari query (bersihkan dari pipe atau embel-embel)
        const filePath = query.split('|')[0].trim();
        const absolutePath = path.resolve(filePath);

        // Cek eksistensi file
        if (!fs.existsSync(absolutePath)) {
            return {
                success: false,
                data: `[SYSTEM ERROR] File tidak ditemukan di lokasi: ${absolutePath}. Jangan gunakan tool read_file jika file belum ada.`
            };
        }

        // Baca isi file
        const content = fs.readFileSync(absolutePath, 'utf8');

        // Batasi output agar tidak menghabiskan memory LLM (maksimal 3000 karakter)
        const MAX_CHARS = 3000;
        if (content.length > MAX_CHARS) {
            return {
                success: true,
                data: content.substring(0, MAX_CHARS) + "\n\n... [SISTEM MEMOTONG TEKS: File terlalu panjang]"
            };
        }

        return { success: true, data: content };
    } catch (error) {
        return {
            success: false,
            data: `[SYSTEM ERROR] Gagal membaca file: ${error.message}`
        };
    }
}

module.exports = { createFile, readFileTool };
