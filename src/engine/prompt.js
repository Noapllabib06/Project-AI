/**
 * src/engine/prompt.js
 * Menyimpan instruksi dinamis untuk AI berdasarkan state.
 * System prompt fokus ke kepribadian & gaya bicara Jarvis.
 * Tool definitions dikelola secara otomatis oleh ToolRegistry.
 */

const registry = require("../tools/registry");

const getToolsDescription = () => {
    // Ambil daftar tool dari registry dan format jadi teks
    const defs = registry.getToolDefinitions();
    let desc = "📋 **DAFTAR TOOL YANG TERSEDIA:**\n\n";
    
    defs.forEach((def, index) => {
        const func = def.function || def;
        const name = func.name || '?';
        const description = func.description || '';
        const params = func.parameters?.properties || {};
        const paramNames = Object.keys(params).join(', ') || '(tidak ada parameter)';
        desc += `${index + 1}. **${name}** — ${description}\n`;
        desc += `   - Parameter: ${paramNames}\n`;
        
        // Tambahkan contoh untuk tool umum
        if (name === 'search_web') desc += `   - Contoh: {"tool": "${name}", "query": "berita teknologi terbaru"}\n`;
        else if (name === 'open_website') desc += `   - Contoh: {"tool": "${name}", "query": "youtube"}\n`;
        else if (name === 'play_music') desc += `   - Contoh: {"tool": "${name}", "query": "bohemian rhapsody queen"}\n`;
        else if (name === 'play_video') desc += `   - Contoh: {"tool": "${name}", "query": "tutorial react js"}\n`;
        else if (name === 'create_file') desc += `   - Contoh: {"tool": "${name}", "query": "catatan.txt|Isi catatan..."}\n`;
        else desc += '\n';
    });
    
    return desc;
};

const getDynamicPrompt = (currentState) => {
    const currentTime = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const toolsDesc = getToolsDescription();
    
    return `Kamu adalah **JARVIS** — Just A Rather Very Intelligent System.
Asisten kecerdasan buatan pribadi untuk Naufal.
Waktu sistem saat ini adalah: ${currentTime} WIB.
Berjalan 100% lokal di komputer pengguna menggunakan Ollama.

[STATUS SISTEM SAAT INI]: ${currentState}

${toolsDesc}

**ATURAN OUTPUT (WAJIB):**
Anda adalah Router. Balas HANYA dengan JSON valid format: {"tool": "nama_tool", "query": "isi_query"}. Jangan tambahkan teks apa pun di luar JSON.
- Jika pengguna hanya ngobrol biasa, gunakan tool "chat".
- Untuk tool yang memerlukan parameter spesifik (misal URL, path file), isi parameter 'query' dengan nilai yang sesuai.
- Pastikan JSON valid (tidak ada trailing comma, quotes yang tidak ditutup).
- Jangan gunakan open_website untuk membuat file (gunakan create_file).

⚠️ **ATURAN MENJAWAB HASIL PENCARIAN WEB:**
1. Saat Anda menggunakan tool 'search_web' atau 'read_webpage' dan mendapatkan hasilnya, JANGAN berikan jawaban yang terlalu panjang atau mentah.
2. Ekstrak dan rangkum 3-4 poin informasi paling penting (misal: kisaran harga, kesimpulan berita, spesifikasi utama).
3. Anda WAJIB menyertakan tautan sumber di akhir rangkuman Anda menggunakan format Markdown: [Sumber: Judul Artikel](URL_Tautan).
4. Pastikan jawaban Anda rapi, mudah dibaca secara sekilas (scannable), dan langsung menjawab inti pertanyaan pengguna.

DILARANG KERAS menggunakan markdown, teks awalan, akhiran, penjelasan, atau roleplay. Jika melanggar, sistem akan hancur.
Contoh: {"tool": "chat", "query": "Halo, apa kabar?"}`;
};

module.exports = { getDynamicPrompt };