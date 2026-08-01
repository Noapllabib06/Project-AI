/**
 * src/engine/agent.js
 * Mesin utama — Tool Registry Pattern + Dynamic Tool Routing.
 * 
 * Alur:
 * 1. Registry memuat semua tool dari src/tools/ secara otomatis
 * 2. Input user dianalisis untuk menentukan kategori tool yang relevan (scoring-based)
 * 3. Hanya tool yang relevan (max 3-5) yang disertakan dalam system prompt
 * 4. LLM output JSON { tool, query } — parsing standar
 * 5. Eksekusi tool via registry.execute()
 * 6. Jika gagal, Micro ReAct loop maksimal 1 retry
 */

const { ChatOllama } = require("@langchain/ollama");
const _prompt = require("./prompt.js");
const { PERSONA } = _prompt;
const logger = require("../utils/logger");
const registry = require("../tools/registry");
const { generateErrorFeedback } = require("./feedback_loop");
const json_validator = require("./json_validator");

// Muat semua tool dari registry sekali saat startup
registry.loadAll();

// ===================== DYNAMIC TOOL ROUTING =====================
// Heuristic keyword mapper untuk mengelompokkan tool berdasarkan kategori.
// Setiap kategori memiliki daftar keyword pemicu dan tool yang sesuai.
// Kategori diurutkan berdasarkan skor jumlah keyword match (scoring-based).

const TOOL_CATEGORIES = {
    WEB: {
        keywords: ['cari', 'berita', 'web', 'google', 'search', 
                   'info', 'informasi', 'tentang', 'apa itu', 'siapa', 'kapan', 'dimana', 'mengapa',
                   'buka', 'open', 'website', 'situs', 'halaman', 'browser', 'maps', 'lokasi',
                   'alamat', 'berikan'],
        tools: ['search_web', 'open_website', 'read_webpage', 'research_and_summarize']
    },
    MEDIA: {
        keywords: ['putar', 'lagu', 'video', 'tutorial', 'youtube', 'musik', 'music', 'play', 
                   'nonton', 'tonton', 'dengerin', 'dengarkan', 'mainkan', 'stream',
                   'channel', 'chanel', 'kanal'],
        tools: ['search_youtube', 'play_music', 'play_video', 'open_youtube_channel']
    },
    FILE: {
        keywords: ['berkas', 'file', 'tulis', 'baca', 'kode', 'catatan', 'dokumen', 'document',
                   'buka file', 'folder', 'proyek', 'project', 'indeks kode', 'codebase'],
        tools: ['create_file', 'read_file', 'ingest_codebase']
    }
};

/**
 * Menganalisis input user untuk menentukan kategori tool yang relevan
 * menggunakan scoring-based approach (jumlah keyword match per kategori).
 * @param {string} userInput - Input dari user yang sudah dibersihkan
 * @returns {Array} - Array nama tool yang relevan (max 5), diurutkan berdasarkan relevansi
 */
function determineRelevantTools(userInput) {
    if (!userInput || typeof userInput !== 'string') return [];

    const lowerInput = userInput.toLowerCase();
    const categoryScores = {};

    for (const [categoryName, category] of Object.entries(TOOL_CATEGORIES)) {
        const matchCount = category.keywords.filter(kw => lowerInput.includes(kw)).length;
        if (matchCount > 0) categoryScores[categoryName] = matchCount;
    }

    if (Object.keys(categoryScores).length === 0) {
        logger.debug('ToolRouter', 'No categories matched — pure chat mode');
        return [];
    }

    // Urutkan kategori berdasarkan skor tertinggi
    const sortedCategories = Object.entries(categoryScores).sort((a, b) => b[1] - a[1]);
    const selectedTools = new Set();
    for (const [categoryName] of sortedCategories) {
        TOOL_CATEGORIES[categoryName].tools.forEach(t => selectedTools.add(t));
    }

    // Batasi maksimal 5 tools untuk mencegah choice overload
    const limitedTools = Array.from(selectedTools).slice(0, 5);
    
    logger.debug('ToolRouter', `Category scores: ${JSON.stringify(categoryScores)} -> Tools: [${limitedTools.join(', ')}]`);
    
    return limitedTools;
}

/**
 * Mendapatkan definisi tool dari registry berdasarkan nama tool yang dipilih.
 * @param {Array} toolNames - Array nama tool
 * @returns {Array} - Array tool definition objects
 */
function getFilteredToolDefinitions(toolNames) {
    if (!toolNames || toolNames.length === 0) return [];
    
    const allDefs = registry.getToolDefinitions();
    return allDefs.filter(def => {
        const name = (def.function || def).name;
        return toolNames.includes(name);
    });
}

const STALE_KNOWLEDGE_KEYWORDS = [
    'presiden', 'wakil presiden', 'menteri', 'gubernur', 'walikota', 'bupati',
    'ceo', 'direktur utama', 'ketua umum', 'kapolri', 'panglima',
    'harga', 'kurs', 'nilai tukar', 'saham',
    'saat ini', 'sekarang', 'terbaru', 'terkini'
];

function requiresForcedWebSearch(userInput) {
    const lower = userInput.toLowerCase();
    return STALE_KNOWLEDGE_KEYWORDS.some(kw => lower.includes(kw));
}

// ===================== AGENT CLASS =====================

class JarvisAgent {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5:7b",
            temperature: 0.1,
            num_ctx: 32000,
        });

        this.visionModel = new ChatOllama({
            model: "llava:7b",
            temperature: 0.1,
            num_ctx: 8000,
        });
        
        this.chatHistory = [];
        this.maxChatHistory = 15;
        this.isCompacting = false;
        // TODO: belum diimplementasi, reserved untuk fitur context-aware follow-up
        this.history = []; 
        this.maxHistory = 12;
        this.currentState = "Menunggu perintah pengguna (Idle)"; 
        // TODO: belum diimplementasi, reserved untuk fitur context-aware follow-up
        this.lastOpenedUrl = null;
        this.lastToolOutput = null;
        this.lastTool = null;
        this.lastQuery = null;
        this.createdFilesInSession = new Set();
        
        logger.info('JarvisAgent', 'Agent initialized with Ollama model: qwen2.5:7b');
    }

    updateState(newState) {
        this.currentState = newState;
        logger.debug('JarvisAgent', `State updated: "${newState}"`);
    }

    async _extractFactsBackground(userInput) {
        try {
            const prompt = `Ekstrak fakta permanen tentang pengguna dari pesan ini (jika ada). 
Jika tidak ada informasi penting permanen (seperti nama, hobi, pekerjaan, preferensi), kembalikan tepat kata "NONE" tanpa tanda kutip.
Pesan: "${userInput}"`;

            const response = await this.model.invoke([{ role: 'user', content: prompt }]);
            const result = (response.content || "").trim();

            if (result && result !== "NONE" && result.length > 0) {
                const memory_manager = require('./memory_manager');
                memory_manager.addFacts(result);
                logger.debug('FactExtractor', `Fakta baru ditemukan: ${result}`);
            }
        } catch (e) {
            logger.error('FactExtractor', 'Gagal mengekstrak fakta: ' + e.message);
        }
    }

    async _compactHistory() {
        if (this.isCompacting || this.chatHistory.length <= 10) return;
        this.isCompacting = true;

        try {
            // Ambil 4 pesan pertama
            const toCompact = this.chatHistory.slice(0, 4);
            const conversationText = toCompact.map(m => `${m.role}: ${m.content}`).join('\n');
            const prompt = `Buatlah ringkasan singkat tapi padat dari 4 pesan percakapan berikut:\n${conversationText}\n\nRingkasan harus mempertahankan konteks utama dan informasi penting. JANGAN menjawab percakapan tersebut, cukup ringkas saja.`;

            logger.debug('AutoCompaction', 'Memulai peringkasan background...');
            const response = await this.model.invoke([{ role: 'user', content: prompt }]);
            const summary = (response.content || "").trim();

            if (summary) {
                // Potong 4 pesan pertama, gantikan dengan ringkasan
                this.chatHistory.splice(0, 4, { role: 'system', content: `[Ringkasan percakapan sebelumnya]: ${summary}` });
                logger.info('AutoCompaction', 'Berhasil meringkas history chat.');
            }
        } catch (e) {
            logger.error('AutoCompaction', 'Gagal meringkas history: ' + e.message);
        } finally {
            this.isCompacting = false;
        }
    }

    cleanInput(input) {
        let cleaned = input.trim();
        cleaned = cleaned.replace(/^(bisa\s+(kamu|anda|kak)\s+)/i, '');
        cleaned = cleaned.replace(/^(tolong\s+(kamu|anda|kak)?\s*)/i, '');
        cleaned = cleaned.replace(/^(kak\s+)/i, '');
        cleaned = cleaned.replace(/^(coba\s+(kamu|anda)?\s*)/i, '');
        cleaned = cleaned.replace(/^((saya|aku)\s+(mau|ingin|minta)\s+)/i, '');
        return cleaned.trim();
    }

    /**
     * One-Shot Router with Dynamic Tool Routing + Micro ReAct
     * 
     * Alur:
     * A. Bersihkan input user dengan cleanInput()
     * B. Analisis input → tentukan kategori tool yang relevan (scoring-based)
     * C. Filter tool definitions berdasarkan kategori
     * D. Panggil Ollama API dengan system prompt yang sudah difilter
     * E. Parse JSON balasan { tool, query }
     * F. Eksekusi tool via registry.execute()
     * G. Jika tool gagal & retryCount < 1, inject feedback ke chatHistory & rekursi
     * H. Jika tool gagal & retryCount >= 1, return graceful apology
     */
    async _executePipeline(userInput, { onTokenCallback = null, startTime = null, retryCount = 0 } = {}) {
        const t0 = startTime || Date.now();

        try {
            // A. Bersihkan input user — hanya push ke chatHistory jika retry pertama (retryCount === 0)
            const cleanedInput = this.cleanInput(userInput);
            
            if (retryCount === 0) {
                this.chatHistory.push({ role: 'user', content: cleanedInput });
                if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();
            }

            // B. Dynamic Tool Routing: tentukan tool yang relevan berdasarkan input (scoring-based)
            const relevantToolNames = determineRelevantTools(cleanedInput);
            const filteredToolDefs = getFilteredToolDefinitions(relevantToolNames);

            // C. Bangun system prompt dengan tool yang sudah difilter
            const systemPrompt = _prompt.buildSystemPrompt(filteredToolDefs, this.currentState);
            
            const messages = [
                { role: 'system', content: systemPrompt },
                ...this.chatHistory
            ];

            // D. Panggil Ollama API
            let aiOutput = "";
            try {
                if (onTokenCallback) {
                    onTokenCallback("Memproses...\n");
                    const stream = await this.model.stream(messages);
                    for await (const chunk of stream) {
                        aiOutput += (chunk.content || "");
                    }
                } else {
                    const response = await this.model.invoke(messages);
                    aiOutput = (response.content || "").trim();
                }
            } catch (e) {
                logger.logError('Agent.callLLM', e);
                const msg = "❌ Maaf, gagal memanggil model AI.";
                if (onTokenCallback) onTokenCallback(msg);
                return msg;
            }

            // E. Simpan balasan assistant ke chatHistory
            this.chatHistory.push({ role: 'assistant', content: aiOutput });
            if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();

            // F. Parse JSON dari balasan Ollama menggunakan json_validator
            const parseResult = json_validator.parseAndValidateAIOutput(aiOutput);
            
            let toolsToExecute = [];
            if (!parseResult.success) {
                // Teks biasa tanpa JSON → anggap chat
                const cleaned = aiOutput.replace(/^["'\s]+|["'\s]+$/g, '');
                if (onTokenCallback) onTokenCallback(cleaned);
                logger.jarvis(`${cleaned.substring(0, 200)} (${Date.now() - t0}ms)`);
                return cleaned;
            } else {
                toolsToExecute = parseResult.data; // Ini selalu Array of tools
            }

            // H. Eksekusi Tool (Paralel)
            const SYNTHESIS_REQUIRED_TOOLS = ['search_web', 'read_webpage', 'research_and_summarize'];
            let needsSynthesis = false;
            let rawSynthesisData = "";
            let finalOutput = "";

            // Jika hanya chat biasa
            if (toolsToExecute.length === 1 && toolsToExecute[0].tool === 'chat') {
                let query = toolsToExecute[0].query;
                
                // StaleKnowledgeGuard
                if (requiresForcedWebSearch(cleanedInput)) {
                    logger.warn('StaleKnowledgeGuard', `Model coba jawab langsung untuk query rawan-basi: "${cleanedInput}". Override ke search_web.`);
                    toolsToExecute[0].tool = 'search_web';
                    toolsToExecute[0].query = cleanedInput;
                } else {
                    if (onTokenCallback) onTokenCallback(query);
                    logger.jarvis(`${query.substring(0, 200)} (${Date.now() - t0}ms)`);
                    return query;
                }
            }

            const toolNames = toolsToExecute.map(t => t.tool).join(', ');
            if (onTokenCallback) onTokenCallback(`Menjalankan: ${toolNames}...\n`);

            // Eksekusi semua tool secara paralel
            const executionPromises = toolsToExecute.map(async (tObj) => {
                const tName = tObj.tool;
                const tQuery = tObj.query;
                
                try {
                    const execResult = await registry.execute(tName, { query: tQuery });
                    return {
                        tool: tName,
                        success: execResult.success,
                        data: execResult.success ? execResult.data : null,
                        error: execResult.success ? null : execResult.error
                    };
                } catch (execError) {
                    return {
                        tool: tName,
                        success: false,
                        error: execError.message || String(execError)
                    };
                }
            });

            const results = await Promise.all(executionPromises);
            
            // Evaluasi Hasil Tool
            let errorCount = 0;
            let lastError = "";

            for (const res of results) {
                const isError = !res.success || (typeof res.data === 'string' && res.data.startsWith('❌'));
                
                if (isError) {
                    errorCount++;
                    lastError = res.error || (typeof res.data === 'string' ? res.data.replace(/^❌\s*/, '') : 'Unknown error');
                    finalOutput += `❌ Gagal eksekusi ${res.tool}: ${lastError}\n`;
                } else {
                    if (SYNTHESIS_REQUIRED_TOOLS.includes(res.tool) && typeof res.data === 'string') {
                        needsSynthesis = true;
                        rawSynthesisData += `\n--- Hasil dari ${res.tool} ---\n${res.data}\n`;
                    } else {
                        // Tool singkat / aksi selesai
                        if (typeof res.data === 'string') {
                            finalOutput += `${res.data}\n`;
                        } else {
                            finalOutput += `✅ ${res.tool} dieksekusi.\n`;
                        }
                    }
                }
            }

            // Jika semua tool gagal, jalankan mekanisme fallback/retry
            if (errorCount > 0 && errorCount === results.length) {
                if (retryCount < 1) {
                    logger.warn('MicroReAct', `Semua tool gagal. Injecting feedback & retrying (retryCount=${retryCount})...`);
                    const feedbackPrompt = json_validator.generateFeedbackMessage(aiOutput, lastError);
                    this.chatHistory.push({ role: 'user', content: feedbackPrompt });
                    
                    if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();
                    
                    return await this._executePipeline(userInput, {
                        onTokenCallback,
                        startTime: t0,
                        retryCount: retryCount + 1
                    });
                } else {
                    const fallbackMsg = `Maaf, saya tidak dapat menyelesaikan perintah Anda: ${lastError}`;
                    logger.warn('MicroReAct', `Final fallback after ${retryCount} retries.`);
                    if (onTokenCallback) onTokenCallback(fallbackMsg);
                    return fallbackMsg;
                }
            }

            // J. Synthesis pass (hanya jika ada setidaknya satu tool yang butuh disintesis)
            if (needsSynthesis) {
                if (onTokenCallback) onTokenCallback('\nMerangkum hasil...\n');

                const synthesisPrompt = `Berikut hasil mentah dari tool untuk query "${cleanedInput}":

${rawSynthesisData}

Rangkum 3-4 poin informasi PALING PENTING dan PALING RELEVAN dengan query di atas.
Jawab langsung dalam bahasa natural (BUKAN format JSON), ringkas, dan mudah dibaca.
WAJIB sertakan link sumber paling relevan di akhir jawaban.
Jika hasil pencarian tidak relevan dengan query, katakan terus terang bahwa
informasi yang ditemukan kurang relevan/kurang update, jangan memaksakan jawaban.`;

                try {
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
                    const synthesisResponse = await this.model.invoke([
                        { role: 'system', content: PERSONA + `\n\nWaktu sistem saat ini: ${currentTime} WIB.` },
                        { role: 'user', content: synthesisPrompt }
                    ]);
                    const synthesized = (synthesisResponse.content || '').trim();

                    finalOutput = synthesized + '\n' + finalOutput;
                    if (onTokenCallback) onTokenCallback(finalOutput);
                    logger.jarvis(`[synthesized] ${synthesized.substring(0, 200)} (${Date.now() - t0}ms)`);
                    return finalOutput;
                } catch (synthErr) {
                    logger.error('Agent.synthesis', synthErr);
                    const fallbackSynthesis = rawSynthesisData.substring(0, 500) + '... (Synthesis failed)';
                    if (onTokenCallback) onTokenCallback(fallbackSynthesis);
                    return fallbackSynthesis;
                }
            }

            // Return langsung tanpa synthesis
            if (onTokenCallback) onTokenCallback(finalOutput.trim());
            logger.jarvis(`${finalOutput.substring(0, 200)} (${Date.now() - t0}ms)`);
            return finalOutput.trim();

        } catch (error) {
            logger.logError('Agent.router', error);
            const msg = `⚠️ System Exception: ${error.message}`;
            if (onTokenCallback) onTokenCallback(msg);
            return msg;
        } finally {
            this.history = [];
            this.createdFilesInSession.clear();
        }
    }

    /**
     * Eksekusi langsung ke vision model jika input memiliki gambar
     */
    async _executeVision(userInput, imageBase64, onTokenCallback) {
        this.updateState('Menganalisis gambar...');
        try {
            const promptText = userInput || "Tolong jelaskan secara detail apa yang ada di gambar ini.";
            const messages = [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: promptText },
                        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                    ]
                }
            ];

            const response = await this.visionModel.invoke(messages);
            const content = (response.content || "").trim();
            
            if (onTokenCallback) {
                onTokenCallback(content);
            }
            logger.jarvis(`[Vision] ${content}`);
            
            this.chatHistory.push({ role: 'user', content: `[User mengirim gambar] ${promptText}` });
            this.chatHistory.push({ role: 'assistant', content });
            
            return content;
        } catch (error) {
            logger.error('Agent.vision', error);
            const msg = `❌ Gagal menganalisis gambar: pastikan model 'llava:7b' sudah terinstal di Ollama. Error: ${error.message}`;
            if (onTokenCallback) onTokenCallback(msg);
            return msg;
        } finally {
            this.updateState('idle');
        }
    }

    /**
     * Proses input tanpa streaming
     */
    async processInput(payload) {
        let userInput = payload;
        let imageBase64 = null;
        
        if (typeof payload === 'object' && payload !== null) {
            userInput = payload.text || "";
            imageBase64 = payload.image;
        }

        logger.user(userInput || "[Image Upload]");
        this._extractFactsBackground(userInput); // fire and forget

        if (imageBase64) {
            const res = await this._executeVision(userInput, imageBase64, null);
            this._compactHistory();
            return res;
        }

        const res = await this._executePipeline(userInput, { onTokenCallback: null });
        this._compactHistory(); // fire and forget
        return res;
    }

    /**
     * Proses input dengan streaming
     */
    async processInputStream(payload, onTokenCallback) {
        let userInput = payload;
        let imageBase64 = null;
        
        if (typeof payload === 'object' && payload !== null) {
            userInput = payload.text || "";
            imageBase64 = payload.image;
        }

        logger.user(userInput || "[Image Upload]");
        this._extractFactsBackground(userInput); // fire and forget

        if (imageBase64) {
            const res = await this._executeVision(userInput, imageBase64, onTokenCallback);
            this._compactHistory();
            return res;
        }

        const res = await this._executePipeline(userInput, { onTokenCallback });
        this._compactHistory(); // fire and forget
        return res;
    }
}

const agentInstance = new JarvisAgent();
module.exports = agentInstance;
module.exports._determineRelevantTools = determineRelevantTools; // export untuk testing