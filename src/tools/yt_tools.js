// src/tools/yt_tools.js
function yt_search_tool(query) {
    console.log(`[TOOL] Searching YouTube: ${query}`);
    // Contoh logic: Jika query mengandung "musik", kita bisa memberikan rekomendasi spesifik
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    return `Tentu, saya akan mencari "${query}" di YouTube untuk Anda (Link: ${searchUrl})`;
}

module.exports = { yt_search_tool };