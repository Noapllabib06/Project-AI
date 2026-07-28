/**
 * src/engine/agent.js
 * Mesin utama dengan alur Single-Pass yang stabil.
 * LLM (Qwen 2.5) memutuskan alat yang digunakan melalui output JSON.
 * IntentDetector hanya sebagai fast-path untuk perintah sederhana.
 * V5 - Single-Pass, stabil, tanpa loop
 */

const { ChatOllama } = require("@langchain/ollama");
const _prompt = require("./prompt");
const logger = require("../utils/logger");
const credentialManager = require("../utils/credentials");
const { parseAndValidateAIOutput, generateFeedbackMessage } = require("./json_validator");
const { executeWithFeedbackLoop } = require("./feedback_loop");
const { open_web_tool, scrape_web_tool, search_web_tool, readWebTool, extractUrl, KNOWN_SITES } = require("../tools/web_tools");
const { yt_search_tool, play_youtube_music, play_youtube_video, getVideoInfo } = require("../tools/yt_tools");
const { createFile, readFileTool } = require("../tools/file_tools");

class JarvisAgent {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5:7b", // Bisa Diganti kemodel Lain
            // Gunakan "Ollama list" untuk melihat model lokal yang tersedia
            // Masukan Nama Model Yang tersedia ke bagian model diatas, misal: "qwen2.5:7b" atau "gemma4:12b"
            temperature: 0.1,
            num_ctx: 65536,
        });
        
        // Chat History untuk format messages API Ollama
        this.chatHistory = [];
        this.maxChatHistory = 10;

        // Memori jangka pendek (Array lokal) — legacy
        this.history = []; 
        this.maxHistory = 12;
        
        // Status awal sistem
        this.currentState = "Menunggu perintah pengguna (Idle)"; 
        
        // URL terakhir yang dibuka (untuk "buka lagi")
        this.lastOpenedUrl = null;

        // Memori hasil tool terakhir untuk injeksi konteks eksplisit
        this.lastToolOutput = null;
        this.lastTool = null;
        this.lastQuery = null;

        // File Lock System: Set untuk melacak file yang sudah dibuat dalam sesi
        this.createdFilesInSession = new Set();
        
        logger.info('JarvisAgent', 'Agent initialized with Ollama model: qwen2.5:7b');
    }

    updateState(newState) {
        this.currentState = newState;
        logger.debug('JarvisAgent', `State updated: "${newState}"`);
    }

    /**
     * Bersihkan input dari kata-kata pengantar
     */
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
     * Fast-path Intent Detection — hanya untuk perintah SANGAT jelas.
     */
    detectIntent(input) {
        const lower = input.toLowerCase().trim();
        const hasUrl = extractUrl(input);
        const cleaned = this.cleanInput(input);
        const lowerCleaned = cleaned.toLowerCase();
        
        logger.debug('IntentDetector', `Original: "${input.substring(0, 100)}"`);

        // Fast-path: "buka lagi" → buka URL terakhir
        if ((lowerCleaned.includes('buka lagi') || lowerCleaned === 'buka') && this.lastOpenedUrl) {
            logger.logIntent(input, 'open_web', this.lastOpenedUrl);
            return { tool: 'open_web', query: this.lastOpenedUrl };
        }

        // Fast-path: URL langsung
        if (hasUrl) {
            if (hasUrl.includes('youtube.com') || hasUrl.includes('youtu.be')) {
                if (lower.includes('musik') || lower.includes('lagu') || lower.includes('music')) {
                    logger.logIntent(input, 'play_music', hasUrl);
                    return { tool: 'play_music', query: hasUrl };
                }
                logger.logIntent(input, 'play_video', hasUrl);
                return { tool: 'play_video', query: hasUrl };
            }
            logger.logIntent(input, 'open_web', hasUrl);
            return { tool: 'open_web', query: hasUrl };
        }

        // Fast-path: "buka [situs]" untuk situs terkenal
        const openKeywords = ['buka ', 'open ', 'browse ', 'masuk ke ', 'masuk ', 'kunjungi '];
        const hasOpenIntent = openKeywords.some(k => lowerCleaned.startsWith(k) || lowerCleaned.includes(` ${k}`));
        if (hasOpenIntent) {
            let siteName = cleaned;
            for (const kw of openKeywords) {
                const idx = siteName.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    siteName = siteName.substring(idx + kw.length).trim();
                    break;
                }
            }
            siteName = siteName.replace(/\s+di\s+(browser|web)/i, '').trim();
            if (siteName && KNOWN_SITES[siteName.toLowerCase()]) {
                logger.logIntent(input, 'open_web', siteName.toLowerCase());
                return { tool: 'open_web', query: siteName.toLowerCase() };
            }
        }

        // Fast-path: "putar lagu/musik" → play_music
        const musicKeywords = ['putar lagu', 'putar musik', 'mainkan lagu', 'mainkan musik', 
                               'play music', 'play song', 'putarkan lagu', 'putarkan musik'];
        const hasMusicIntent = musicKeywords.some(k => lowerCleaned.includes(k)) ||
                               (lowerCleaned.includes('youtube music') && 
                                (lowerCleaned.includes('putar') || lowerCleaned.includes('mainkan') || lowerCleaned.includes('play')));
        if (hasMusicIntent && !lowerCleaned.includes('video')) {
            let query = cleaned;
            for (const kw of musicKeywords) {
                const idx = query.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    query = query.substring(idx + kw.length).trim();
                    break;
                }
            }
            query = query.replace(/\s+di\s+(youtube\s+)?music/i, '').trim();
            if (query) {
                logger.logIntent(input, 'play_music', query);
                return { tool: 'play_music', query };
            }
        }

        // Fast-path: "putar video / tonton" → play_video
        const videoKeywords = ['putar video', 'mainkan video', 'play video', 'tonton ', 'nonton '];
        const hasVideoIntent = videoKeywords.some(k => lowerCleaned.includes(k)) ||
                               (lowerCleaned.includes('youtube') && !lowerCleaned.includes('music') &&
                                (lowerCleaned.includes('putar') || lowerCleaned.includes('mainkan') || 
                                 lowerCleaned.includes('play') || lowerCleaned.includes('tonton') || 
                                 lowerCleaned.includes('nonton')));
        if (hasVideoIntent) {
            let query = cleaned;
            for (const kw of videoKeywords) {
                const idx = query.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    query = query.substring(idx + kw.length).trim();
                    break;
                }
            }
            query = query.replace(/\s+di\s+youtube/i, '').trim();
            if (query) {
                logger.logIntent(input, 'play_video', query);
                return { tool: 'play_video', query };
            }
        }

        // Bukan fast-path → serahkan ke LLM
        logger.logIntent(input, 'chat', input);
        return { tool: 'chat', query: input };
    }

    /**
     * Eksekusi tool berdasarkan nama tool
     */
    async executeTool(tool, query) {
        const startTime = Date.now();
        logger.tool('Agent.executeTool', `Executing: ${tool}`, { query: query.substring(0, 100) });
        
        let result;
        
        try {
            switch (tool) {
                case 'open_web':
                    result = await open_web_tool(query);
                    if (result && result.includes('✅ Membuka')) {
                        const urlMatch = result.match(/https?:\/\/[^\s]+/);
                        if (urlMatch) this.lastOpenedUrl = urlMatch[0];
                    }
                    break;
                    
                case 'scrape_web':
                    result = await scrape_web_tool(query);
                    break;
                    
                case 'search_web':
                    result = await search_web_tool(query);
                    break;
                    
                case 'play_music':
                    this.updateState(`Memutar musik: "${query}"`);
                    result = await play_youtube_music(query);
                    break;
                    
                case 'play_video':
                    this.updateState(`Memutar video: "${query}"`);
                    result = await play_youtube_video(query);
                    break;
                    
                case 'search_youtube':
                    result = await yt_search_tool(query);
                    break;
                    
                case 'create_file':
                    this.updateState(`Membuat file: "${query}"`);
                    // Validasi keamanan: nama file maksimal 50 karakter
                    const fnPart = query.split('|')[0].trim();
                    if (fnPart.length > 50) {
                        result = `❌ Gagal: Nama file "${fnPart}" terlalu panjang (${fnPart.length} karakter). Maksimal 50 karakter. Persingkat nama file.`;
                        break;
                    }
                    result = createFile(query);
                    break;

                case 'read_file':
                    this.updateState(`Membaca file: "${query}"`);
                    const readResult = await readFileTool(query);
                    result = readResult.data;
                    break;

                case 'read_web':
                    this.updateState(`Membaca artikel web...`);
                    result = await readWebTool(query);
                    break;

                case 'get_time':
                    this.updateState(`Mendapatkan waktu...`);
                    const now = new Date();
                    result = now.toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                    }) + ' WIB';
                    break;
                    
                case 'chat':
                default:
                    return null;
            }
            
            const duration = Date.now() - startTime;
            logger.logToolExecution(tool, query, result, duration);
            
            return result;
        } catch (error) {
            logger.logError('Agent.executeTool', error, { tool, query });
            return `❌ Gagal menjalankan perintah: ${error.message}`;
        }
    }

    /**
     * One-Shot Router (Flow Engineering - Single Pass)
     * A. Panggil Ollama API 1x (dengan waktu real-time)
     * B. Parse JSON balasan
     * C. Eksekusi tool via switch-case
     * D. Return hasil — DILARANG panggil Ollama lagi
     */
    async _executePipeline(userInput, { onTokenCallback = null, startTime = null } = {}) {
        const t0 = startTime || Date.now();

        try {
            // A. Simpan pesan user ke chatHistory
            this.chatHistory.push({ role: 'user', content: userInput });
            if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();

            // B. Bangun payload messages: system + chatHistory
            const messages = [
                { role: 'system', content: _prompt.getDynamicPrompt(this.currentState) },
                ...this.chatHistory
            ];

            // C. Panggil Ollama API dengan format messages array
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

            // D. Simpan balasan assistant ke chatHistory
            this.chatHistory.push({ role: 'assistant', content: aiOutput });
            if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();

            // E. Parse JSON dari balasan Ollama
            let tool = 'chat', query = '';
            try {
                const parsed = JSON.parse(aiOutput);
                tool = parsed.tool || 'chat';
                query = parsed.query || parsed.params?.query || parsed.query || '';
            } catch {
                // Fallback regex jika JSON.parse gagal
                const match = aiOutput.match(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"query"\s*:\s*"([^"]*)"\s*\}/);
                if (match) {
                    tool = match[1];
                    query = match[2];
                } else {
                    // Teks biasa tanpa JSON → anggap chat
                    const cleaned = aiOutput.replace(/^["'\s]+|["'\s]+$/g, '');
                    if (onTokenCallback) onTokenCallback(cleaned);
                    logger.jarvis(`${cleaned.substring(0, 200)} (${Date.now() - t0}ms)`);
                    return cleaned;
                }
            }

            // C. Routing & Eksekusi via switch-case (1x tool, lalu STOP)
            if (tool === 'chat') {
                if (onTokenCallback) onTokenCallback(query);
                logger.jarvis(`${query.substring(0, 200)} (${Date.now() - t0}ms)`);
                return query;
            }

            if (onTokenCallback) onTokenCallback(`Menjalankan: ${tool}...\n`);
            const toolResult = await this.executeTool(tool, query);
            
            if (!toolResult) {
                const msg = `❌ Gagal menjalankan tool: ${tool}`;
                if (onTokenCallback) onTokenCallback(msg);
                return msg;
            }

            // D. Return hasil — TIDAK ADA panggilan Ollama lagi
            if (onTokenCallback) onTokenCallback(toolResult);
            logger.jarvis(`${toolResult.substring(0, 200)} (${Date.now() - t0}ms)`);
            return toolResult;

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
     * Proses input tanpa streaming — dipakai main.js (process-command)
     * Pipeline linier: 1x LLM → 1x tool → return
     */
    async processInput(userInput) {
        logger.user(userInput);
        return await this._executePipeline(userInput, { onTokenCallback: null });
    }

    /**
     * Proses input dengan streaming — UI memakai path ini (process-command-stream)
     * Pipeline linier: 1x LLM → 1x tool → return
     */
    async processInputStream(userInput, onTokenCallback) {
        logger.user(userInput);
        return await this._executePipeline(userInput, { onTokenCallback });
    }
}

module.exports = new JarvisAgent();