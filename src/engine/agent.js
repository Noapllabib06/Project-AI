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
const { open_web_tool, scrape_web_tool, search_web_tool, extractUrl, KNOWN_SITES } = require("../tools/web_tools");
const { yt_search_tool, play_youtube_music, play_youtube_video, getVideoInfo } = require("../tools/yt_tools");
const { createFile } = require("../tools/file_tools");

class JarvisAgent {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5:7b",
            temperature: 0,
        });
        
        // Memori jangka pendek (Array lokal)
        this.history = []; 
        this.maxHistory = 12;
        
        // Status awal sistem
        this.currentState = "Menunggu perintah pengguna (Idle)"; 
        
        // URL terakhir yang dibuka (untuk "buka lagi")
        this.lastOpenedUrl = null;
        
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
                    result = createFile(query);
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
     * Parse output LLM: jika JSON tool call → eksekusi tool; jika chat → return teks.
     * Mencegah JSON bocor ke UI.
     */
    async resolveAIOutput(aiOutput, startTime, onTokenCallback = null) {
        const validation = parseAndValidateAIOutput(aiOutput);

        if (validation.success) {
            const { tool, query } = validation.data;
            logger.debug('Agent', `AI output validated: tool=${tool}, query=${query.substring(0, 50)}`);
            return await this.handleToolFromAI(tool, query, startTime, onTokenCallback);
        }

        // Fallback regex
        const toolMatch = aiOutput.match(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"query"\s*:\s*"([^"]*)"\s*\}/);
        if (toolMatch) {
            const fallbackTool = toolMatch[1];
            const fallbackQuery = toolMatch[2];
            logger.debug('Agent', `Fallback regex extracted: tool=${fallbackTool}, query=${fallbackQuery.substring(0, 50)}`);
            if (fallbackTool !== 'chat') {
                return await this.handleToolFromAI(fallbackTool, fallbackQuery, startTime, onTokenCallback);
            }
        }

        // Bukan tool call → tampilkan teks (strip sisa JSON jika ada)
        const cleaned = this.stripJsonFromResponse(aiOutput);
        if (onTokenCallback) onTokenCallback(cleaned);
        this.history.push(`Jarvis: ${cleaned}`);
        if (this.history.length > this.maxHistory) this.history.shift();
        logger.jarvis(`${cleaned.substring(0, 200)} (${Date.now() - startTime}ms)`);
        return cleaned;
    }

    /**
     * Eksekusi tool dari output LLM, lalu rangkum jawaban natural.
     */
    async handleToolFromAI(tool, query, startTime, onTokenCallback = null) {
        // Tool chat → langsung return query
        if (tool === 'chat') {
            if (onTokenCallback) onTokenCallback(query);
            this.history.push(`Jarvis: ${query}`);
            if (this.history.length > this.maxHistory) this.history.shift();
            logger.jarvis(`${query.substring(0, 200)} (${Date.now() - startTime}ms)`);
            return query;
        }

        const toolResult = await this.executeTool(tool, query);
        if (!toolResult) {
            const msg = `❌ Gagal menjalankan tool: ${tool}`;
            if (onTokenCallback) onTokenCallback(msg);
            return msg;
        }

        // open_web / play_music / play_video: hasil sudah human-readable
        if (tool === 'open_web' || tool === 'play_music' || tool === 'play_video') {
            if (onTokenCallback) onTokenCallback(toolResult);
            this.history.push(`Jarvis: ${toolResult}`);
            if (this.history.length > this.maxHistory) this.history.shift();
            logger.jarvis(`${toolResult.substring(0, 200)} (${Date.now() - startTime}ms)`);
            return toolResult;
        }

        // search_web / scrape_web / create_file: feed hasil tool ke LLM untuk jawaban natural
        this.history.push(`[Tool Result: ${tool}]\n${toolResult}`);
        const conversationHistory = this.history.join("\n");
        const fullPrompt = `Kamu adalah JARVIS. Berdasarkan hasil eksekusi di atas, berikan jawaban akhir ke pengguna dalam format chat dalam Bahasa Indonesia. JANGAN output JSON.\n\n${conversationHistory}\n\nJawaban:`;

        let finalAnswer = toolResult;
        try {
            if (onTokenCallback) {
                const stream = await this.model.stream(fullPrompt);
                finalAnswer = "";
                for await (const chunk of stream) {
                    const token = chunk.content || "";
                    finalAnswer += token;
                    onTokenCallback(token);
                }
                finalAnswer = finalAnswer.trim();
            } else {
                const response = await this.model.invoke(fullPrompt);
                finalAnswer = (response.content || "").trim();
            }
            // Jika LLM masih mengeluarkan JSON tool call, pakai hasil tool
            if (finalAnswer.startsWith('{') && finalAnswer.includes('"tool"')) {
                finalAnswer = this.stripJsonFromResponse(finalAnswer);
                if (!finalAnswer || finalAnswer.length < 10) {
                    finalAnswer = toolResult;
                }
                if (onTokenCallback) onTokenCallback(finalAnswer);
            }
        } catch (e) {
            finalAnswer = toolResult;
            if (onTokenCallback) onTokenCallback(finalAnswer);
        }

        if (!finalAnswer || finalAnswer.length < 5) finalAnswer = toolResult;
        finalAnswer = this.stripJsonFromResponse(finalAnswer);
        this.history.push(`Jarvis: ${finalAnswer}`);
        if (this.history.length > this.maxHistory) this.history.shift();
        logger.jarvis(`${finalAnswer.substring(0, 200)} (${Date.now() - startTime}ms)`);
        return finalAnswer;
    }

    /**
     * Strip JSON tool calls from any response before displaying to user
     */
    stripJsonFromResponse(text) {
        if (!text) return text;
        let cleaned = text.replace(/\{"tool":\s*"[^"]+",\s*"query":\s*"([^"]*)"\s*\}/g, '$1');
        cleaned = cleaned.replace(/\{["\s]*tool["\s]*:["\s]*"[^"]+"["\s]*,["\s]*query["\s]*:["\s]*"([^"]*)"["\s]*\}/g, '$1');
        if (cleaned.startsWith('{') && cleaned.includes('"tool"')) {
            const match = cleaned.match(/"query":\s*"([^"]+)"/);
            if (match) cleaned = match[1];
        }
        return cleaned;
    }

    /**
     * Agentic Loop (ReAct) — panggil LLM → tool → ulangi sampai 'chat' / maxLoops.
     * Mempertahankan Structured Output (JSON Schema) lewat parseAndValidateAIOutput.
     * Dilengkapi Loop Breaker: berhenti jika LLM mengulang aksi yang sama persis.
     */
    async _runAgenticLoop({ onTokenCallback = null, startTime = null } = {}) {
        const t0 = startTime || Date.now();
        const maxLoops = 5;
        let isTaskComplete = false;
        let loopCount = 0;
        let previousAction = "";
        let finalText = "";

        while (!isTaskComplete && loopCount < maxLoops) {
            loopCount++;
            logger.debug('Agent.loop', `Iterasi #${loopCount}/${maxLoops}`);

            // Bangun prompt lengkap (system + history)
            const systemInstruction = _prompt.getDynamicPrompt(this.currentState);
            const conversationHistory = this.history.join("\n");
            const fullPrompt = `${systemInstruction}\n\nRiwayat Percakapan:\n${conversationHistory}\n\nJarvis:`;

            // 1. Panggil LLM (Structured Output: akan output JSON valid)
            let aiOutput = "";
            try {
                const response = await this.model.invoke(fullPrompt);
                aiOutput = (response.content || "").trim();
            } catch (e) {
                logger.logError('Agent.loop.callLLM', e);
                const msg = "❌ Maaf, gagal memanggil model AI.";
                if (onTokenCallback) onTokenCallback(msg);
                return msg;
            }

            // 2. Parse output LLM (aman karena JSON Schema)
            const validation = parseAndValidateAIOutput(aiOutput);
            let tool, query;
            if (validation.success) {
                tool = validation.data.tool;
                query = validation.data.query;
            } else {
                // Fallback: coba regex
                const toolMatch = aiOutput.match(/\{"tool"\s*:\s*"([^"]+)"\s*,\s*"query"\s*:\s*"([^"]*)"\s*\}/);
                if (toolMatch) {
                    tool = toolMatch[1];
                    query = toolMatch[2];
                    logger.debug('Agent.loop', `Fallback regex: tool=${tool}`);
                } else {
                    // Bukan tool call → anggap jawaban natural (chat fallback)
                    const cleaned = this.stripJsonFromResponse(aiOutput);
                    finalText = cleaned;
                    if (onTokenCallback) onTokenCallback(cleaned);
                    this.history.push(`Jarvis: ${cleaned}`);
                    if (this.history.length > this.maxHistory) this.history.shift();
                    isTaskComplete = true;
                    break;
                }
            }

            const currentAction = `${tool}:${query}`;

            // 3. Loop Breaker (Anti-Macet)
            if (currentAction === previousAction) {
                const msg = "⚠️ Jarvis mendeteksi perulangan instruksi. Menghentikan proses untuk mencegah crash.";
                logger.warn('Agent.loop', `Loop terdeteksi: ${currentAction}`);
                if (onTokenCallback) onTokenCallback(msg);
                finalText = msg;
                break;
            }
            previousAction = currentAction;

            // 4. Eksekusi alat
            if (tool === 'chat') {
                // Jawaban final untuk pengguna
                finalText = query;
                if (onTokenCallback) onTokenCallback(query);
                this.history.push(`Jarvis: ${query}`);
                if (this.history.length > this.maxHistory) this.history.shift();
                isTaskComplete = true;
            } else {
                // Eksekusi tool
                const toolResult = await this.executeTool(tool, query);
                // PENTING: Masukkan hasil alat ke history agar dibaca LLM di iterasi berikutnya
                const resultLine = `[System Tool Result for ${tool}]: ${toolResult || "(no result)"}`;
                this.history.push(resultLine);
                if (this.history.length > this.maxHistory) this.history.shift();

                // Untuk tool yang langsung user-facing (open_web, play_music, play_video),
                // tampilkan hasilnya ke UI agar pengguna tahu progres, tapi JANGAN stop loop
                // kecuali LLM sudah memutuskan 'chat'. Lanjutkan ke iterasi berikutnya.
                if ((tool === 'open_web' || tool === 'play_music' || tool === 'play_video') && toolResult) {
                    if (onTokenCallback) onTokenCallback(`${toolResult}\n`);
                }

                // Loop akan berlanjut sampai LLM mengembalikan 'chat' atau maxLoops tercapai
            }
        }

        if (!isTaskComplete && loopCount >= maxLoops) {
            const msg = "\n\n⏱️ Batas maksimum iterasi tercapai (5 langkah). Berikut ringkasan tindakan yang sudah dilakukan.";
            if (onTokenCallback) onTokenCallback(msg);
            finalText = (finalText || "") + msg;
        }

        logger.jarvis(`${(finalText || "").substring(0, 200)} (${Date.now() - t0}ms, ${loopCount} iter)`);
        return finalText;
    }

    /**
     * Proses input tanpa streaming — dipakai main.js (process-command)
     * Agentic Loop: LLM ↔ tool, max 5 iterasi, anti-loop.
     */
    async processInput(userInput) {
        logger.user(userInput);
        const startTime = Date.now();

        try {
            // Fast-path: IntentDetector untuk perintah SANGAT jelas
            const intent = this.detectIntent(userInput);
            if (intent.tool !== 'chat') {
                const toolResult = await this.executeTool(intent.tool, intent.query);
                if (toolResult) {
                    this.history.push(`User: ${userInput}`);
                    if (this.history.length > this.maxHistory) this.history.shift();
                    this.history.push(`Jarvis: ${toolResult}`);
                    if (this.history.length > this.maxHistory) this.history.shift();
                    logger.jarvis(`${toolResult.substring(0, 200)} (${Date.now() - startTime}ms)`);
                    return toolResult;
                }
            }

            // Chat path → masuk Agentic Loop
            this.history.push(`User: ${userInput}`);
            if (this.history.length > this.maxHistory) this.history.shift();

            return await this._runAgenticLoop({ onTokenCallback: null, startTime });
        } catch (error) {
            logger.logError('Agent.processInput', error);
            return "❌ Maaf, terjadi kesalahan. Silakan coba lagi.";
        }
    }

    /**
     * Proses input dengan streaming — UI memakai path ini (process-command-stream)
     * Agentic Loop + streaming ke UI per token.
     */
    async processInputStream(userInput, onTokenCallback) {
        logger.user(userInput);
        const startTime = Date.now();

        try {
            // Fast-path: IntentDetector untuk perintah SANGAT jelas
            const intent = this.detectIntent(userInput);
            if (intent.tool !== 'chat') {
                const toolResult = await this.executeTool(intent.tool, intent.query);
                if (toolResult) {
                    this.history.push(`User: ${userInput}`);
                    if (this.history.length > this.maxHistory) this.history.shift();
                    this.history.push(`Jarvis: ${toolResult}`);
                    if (this.history.length > this.maxHistory) this.history.shift();
                    if (onTokenCallback) onTokenCallback(toolResult);
                    logger.jarvis(`${toolResult.substring(0, 200)} (${Date.now() - startTime}ms)`);
                    return toolResult;
                }
            }

            // Chat path → masuk Agentic Loop (dengan streaming)
            this.history.push(`User: ${userInput}`);
            if (this.history.length > this.maxHistory) this.history.shift();

            return await this._runAgenticLoop({ onTokenCallback, startTime });
        } catch (error) {
            logger.logError('Agent.processInputStream', error);
            if (onTokenCallback) onTokenCallback("❌ Maaf, terjadi kesalahan.");
            return "❌ Maaf, terjadi kesalahan.";
        }
    }
}

module.exports = new JarvisAgent();