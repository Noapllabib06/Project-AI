/**
 * src/engine/json_validator.js
 * Validasi dan extract JSON dari output AI
 * Memastikan AI hanya mengeluarkan JSON yang valid untuk tool calling
 */

const logger = require('../utils/logger');

/**
 * Extract JSON dari teks yang mungkin mengandung narasi
 * Contoh: "Saya akan membuka youtube: {"tool": "open_web", "query": "youtube"}"
 * Hasil: {"tool": "open_web", "query": "youtube"}
 */
function extractJsonFromText(text) {
    if (!text || typeof text !== 'string') {
        return null;
    }

    // Cari JSON object di dalam teks (menggunakan regex untuk kurung kurawal)
    const jsonRegex = /\{[\s\S]*\}/;
    const match = text.match(jsonRegex);
    
    if (match) {
        try {
            const parsed = JSON.parse(match[0]);
            return parsed;
        } catch (e) {
            logger.warn('JsonValidator', `JSON.parse gagal, mencoba regex fallback untuk multiline...`);
            
            // === REGEX FALLBACK UNTUK MULTILINE STRING ===
            // Saat LLM memasukkan literal newline di dalam string query (misal kode HTML),
            // JSON.parse akan gagal. Regex ini mengekstrak tool dan query secara manual.
            const toolMatch = match[0].match(/"tool"\s*:\s*"([^"]+)"/);
            // Ambil semua teks di dalam query dari tanda kutip buka hingga sebelum kurung kurawal akhir
            const queryMatch = match[0].match(/"query"\s*:\s*"([\s\S]*)"\s*\}?/);

            if (toolMatch && queryMatch) {
                let extractedQuery = queryMatch[1];
                // Bersihkan tanda kutip penutup jika ikut terbawa
                if (extractedQuery.endsWith('"')) {
                    extractedQuery = extractedQuery.slice(0, -1);
                }
                
                logger.debug('JsonValidator', `Regex fallback berhasil: tool=${toolMatch[1]}, query_length=${extractedQuery.length}`);
                return {
                    tool: toolMatch[1],
                    query: extractedQuery.trim()
                };
            }
            
            logger.warn('JsonValidator', `Regex fallback juga gagal: ${match[0].substring(0, 100)}`);
            return null;
        }
    }

    // Coba parse seluruh teks sebagai JSON
    try {
        return JSON.parse(text);
    } catch (e) {
        return null;
    }
}

/**
 * Validasi struktur JSON sesuai schema yang diharapkan
 */
function validateToolCall(json) {
    if (!json || typeof json !== 'object') {
        return { valid: false, error: 'Output bukan object' };
    }

    if (!json.tool || typeof json.tool !== 'string') {
        return { valid: false, error: 'Field "tool" tidak ditemukan atau bukan string' };
    }

    if (!json.query || typeof json.query !== 'string') {
        return { valid: false, error: 'Field "query" tidak ditemukan atau bukan string' };
    }

    // Validasi tool name
    const validTools = [
        'open_web', 'search_web', 'scrape_web',
        'play_music', 'play_video', 'search_youtube',
        'save_credential', 'list_credentials', 'delete_credential',
        'create_file',
        'chat'
    ];

    if (!validTools.includes(json.tool)) {
        return { valid: false, error: `Tool "${json.tool}" tidak valid. Harus salah satu dari: ${validTools.join(', ')}` };
    }

    return { valid: true, data: json };
}

/**
 * Parse dan validasi output AI
 * Returns: { success: boolean, data?: object, error?: string, rawOutput?: string }
 */
function parseAndValidateAIOutput(aiOutput) {
    if (!aiOutput) {
        return {
            success: false,
            error: 'Output AI kosong',
            rawOutput: aiOutput
        };
    }

    logger.debug('JsonValidator', `Parsing AI output: ${aiOutput.substring(0, 200)}`);

    // Step 1: Extract JSON dari teks
    const extracted = extractJsonFromText(aiOutput);
    
    if (!extracted) {
        return {
            success: false,
            error: 'Tidak dapat menemukan JSON valid dalam output AI',
            rawOutput: aiOutput
        };
    }

    // Step 2: Validasi struktur
    const validation = validateToolCall(extracted);
    
    if (!validation.valid) {
        return {
            success: false,
            error: validation.error,
            rawOutput: aiOutput
        };
    }

    logger.debug('JsonValidator', `Valid JSON parsed: tool=${validation.data.tool}, query=${validation.data.query.substring(0, 50)}`);
    
    return {
        success: true,
        data: validation.data,
        rawOutput: aiOutput
    };
}

/**
 * Generate feedback message untuk AI jika output invalid
 */
function generateFeedbackMessage(aiOutput, error) {
    return `
⚠️ OUTPUT TIDAK VALID. Silakan perbaiki:

Error: ${error}

Output Anda yang salah:
${aiOutput}

Format yang BENAR (HANYA JSON, TANPA teks lain):
{"tool": "nama_tool", "query": "isi_query"}

Contoh:
{"tool": "open_web", "query": "youtube"}
{"tool": "chat", "query": "siapa kamu?"}

ATURAN:
1. HANYA output JSON, TANPA penjelasan atau teks naratif
2. Format: {"tool": "...", "query": "..."}
3. Jangan tambahkan tanda kutip di luar JSON
4. Pastikan JSON valid (tidak ada trailing comma)

Coba lagi dengan format yang benar.`;
}

module.exports = {
    extractJsonFromText,
    validateToolCall,
    parseAndValidateAIOutput,
    generateFeedbackMessage
};