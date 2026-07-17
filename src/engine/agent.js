/**
 * src/engine/agent.js
 * Mesin utama dengan fitur Memori (History) dan State Management.
 * Menggunakan Ollama untuk model AI lokal.
 * Terintegrasi dengan Web Tools & YouTube Tools sebagai AI Agent universal.
 * V3 - Intent detection lebih cerdas, handle multi-intent, "bisa kamu", "masuk ke", dll.
 */

const { ChatOllama } = require("@langchain/ollama");
const _prompt = require("./prompt");
const logger = require("../utils/logger");
const credentialManager = require("../utils/credentials");
const { parseAndValidateAIOutput, generateFeedbackMessage } = require("./json_validator");
const { executeWithFeedbackLoop } = require("./feedback_loop");
const { open_web_tool, scrape_web_tool, search_web_tool, extractUrl, KNOWN_SITES } = require("../tools/web_tools");
const { yt_search_tool, play_youtube_music, play_youtube_video, getVideoInfo } = require("../tools/yt_tools");

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
     * Bersihkan input dari kata-kata pengantar seperti "bisa kamu", "tolong", "kak", dll
     */
    cleanInput(input) {
        let cleaned = input.trim();
        // Hapus pengantar umum di awal kalimat
        cleaned = cleaned.replace(/^(bisa\s+(kamu|anda|kak)\s+)/i, '');
        cleaned = cleaned.replace(/^(tolong\s+(kamu|anda|kak)?\s*)/i, '');
        cleaned = cleaned.replace(/^(kak\s+)/i, '');
        cleaned = cleaned.replace(/^(coba\s+(kamu|anda)?\s*)/i, '');
        cleaned = cleaned.replace(/^((saya|aku)\s+(mau|ingin|minta)\s+)/i, '');
        return cleaned.trim();
    }

    /**
     * Smart Intent Detection V3
     */
    detectIntent(input) {
        const lower = input.toLowerCase().trim();
        const hasUrl = extractUrl(input);
        const cleaned = this.cleanInput(input);
        const lowerCleaned = cleaned.toLowerCase();
        
        logger.debug('IntentDetector', `Original: "${input.substring(0, 100)}"`);
        logger.debug('IntentDetector', `Cleaned: "${cleaned.substring(0, 100)}"`);
        
        // ==========================================
        // PRIORITAS 1: YOUTUBE MUSIC (tertinggi)
        // ==========================================
        // "putar lagu ...", "putar musik ...", "mainkan lagu ..."
        // "buka youtube music dan putar lagu ..." → ambil bagian "putar lagu"
        // "bisa kamu putar lagu ..."
        const musicKeywords = ['putar lagu', 'putar musik', 'mainkan lagu', 'mainkan musik', 
                               'play music', 'play song', 'putarkan lagu', 'putarkan musik'];
        const hasMusicIntent = musicKeywords.some(k => lowerCleaned.includes(k)) ||
                               (lowerCleaned.includes('youtube music') && 
                                (lowerCleaned.includes('putar') || lowerCleaned.includes('mainkan') || lowerCleaned.includes('play')));
        
        if (hasMusicIntent && !lowerCleaned.includes('video')) {
            // Ekstrak query setelah keyword musik
            let query = cleaned;
            for (const kw of musicKeywords) {
                const idx = query.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    query = query.substring(idx + kw.length).trim();
                    break;
                }
            }
            // Hapus "di youtube music" di akhir
            query = query.replace(/\s+di\s+(youtube\s+)?music/i, '').trim();
            // Hapus "dan buka ..." di akhir
            query = query.replace(/\s+dan\s+(buka|open).*/i, '').trim();
            
            if (query) {
                logger.logIntent(input, 'play_music', query);
                return { tool: 'play_music', query };
            }
        }
        
        // ==========================================
        // PRIORITAS 2: YOUTUBE VIDEO
        // ==========================================
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
            query = query.replace(/\s+dan\s+(buka|open).*/i, '').trim();
            
            if (query) {
                logger.logIntent(input, 'play_video', query);
                return { tool: 'play_video', query };
            }
        }
        
        // ==========================================
        // PRIORITAS 3: WEB NAVIGATION
        // ==========================================
        // "buka youtube", "buka google.com", "buka lms telkom"
        // "bisa kamu buka youtube", "masuk ke lms", "buka lagi"
        const openKeywords = ['buka ', 'open ', 'browse ', 'masuk ke ', 'masuk ', 'kunjungi '];
        const hasOpenIntent = openKeywords.some(k => lowerCleaned.startsWith(k) || lowerCleaned.includes(` ${k}`));
        
        if (hasOpenIntent) {
            // Handle "buka lagi" → buka URL terakhir
            if (lowerCleaned.includes('buka lagi') || lowerCleaned === 'buka') {
                if (this.lastOpenedUrl) {
                    logger.logIntent(input, 'open_web', this.lastOpenedUrl);
                    return { tool: 'open_web', query: this.lastOpenedUrl };
                }
                // Fallback ke search
                logger.logIntent(input, 'search_web', 'buka lagi');
                return { tool: 'search_web', query: 'buka lagi' };
            }
            
            // Ekstrak nama situs/URL
            let siteName = cleaned;
            for (const kw of openKeywords) {
                const idx = siteName.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    siteName = siteName.substring(idx + kw.length).trim();
                    break;
                }
            }
            // Hapus "di browser" di akhir
            siteName = siteName.replace(/\s+di\s+(browser|web)/i, '').trim();
            // Hapus "dan ..." di akhir (multi-intent)
            siteName = siteName.replace(/\s+dan\s+.*/i, '').trim();
            
            if (siteName) {
                // Cek KNOWN_SITES
                if (KNOWN_SITES[siteName.toLowerCase()]) {
                    logger.logIntent(input, 'open_web', siteName.toLowerCase());
                    return { tool: 'open_web', query: siteName.toLowerCase() };
                }
                // Cek URL
                if (hasUrl) {
                    logger.logIntent(input, 'open_web', hasUrl);
                    return { tool: 'open_web', query: hasUrl };
                }
                logger.logIntent(input, 'open_web', siteName);
                return { tool: 'open_web', query: siteName };
            }
        }
        
        // ==========================================
        // PRIORITAS 4: SEARCH INTERNET
        // ==========================================
        // "cari ...", "search ...", "cari alamat web ...", "bisa kamu cari ..."
        const searchKeywords = ['cari ', 'search ', 'googling ', 'carikan '];
        const hasSearchIntent = searchKeywords.some(k => lowerCleaned.startsWith(k) || lowerCleaned.includes(` ${k}`)) ||
                                lowerCleaned.includes('cari di internet') || lowerCleaned.includes('cari informasi') ||
                                lowerCleaned.includes('cari di google') || lowerCleaned.includes('search web');
        
        if (hasSearchIntent) {
            let query = cleaned;
            for (const kw of searchKeywords) {
                const idx = query.toLowerCase().indexOf(kw);
                if (idx !== -1) {
                    query = query.substring(idx + kw.length).trim();
                    break;
                }
            }
            query = query.replace(/\s+(di internet|di web|di google|di google search)/i, '').trim();
            // Hapus "dan buka ..." di akhir
            query = query.replace(/\s+dan\s+(buka|open).*/i, '').trim();
            
            // Don't search if query starts with question words
            const questionWords = ['apa', 'bagaimana', 'mengapa', 'kenapa', 'siapa', 'kapan', 'dimana', 'apakah', 'maksud', 'definisi', 'pengertian'];
            const isQuestion = questionWords.some(q => query.toLowerCase().startsWith(q));
            
            if (query && !isQuestion) {
                logger.logIntent(input, 'search_web', query);
                return { tool: 'search_web', query };
            }
        }
        
        // ==========================================
        // PRIORITAS 5: SCRAPE / BACA HALAMAN
        // ==========================================
        if ((lower.includes('baca') || lower.includes('scrape') || lower.includes('ambil konten')) && hasUrl) {
            logger.logIntent(input, 'scrape_web', hasUrl);
            return { tool: 'scrape_web', query: hasUrl };
        }
        
        // ==========================================
        // PRIORITAS 6: YOUTUBE SEARCH
        // ==========================================
        if (lower.includes('cari youtube') || lower.includes('search youtube') || 
            lower.includes('cari di youtube') || lower.includes('cari video')) {
            let query = input.replace(/^(cari|search)\s+(di\s+)?(youtube|video)\s+/i, '')
                            .replace(/\s+(di youtube|di yt)/i, '')
                            .trim();
            logger.logIntent(input, 'search_youtube', query);
            return { tool: 'search_youtube', query: query || input };
        }
        
        // ==========================================
        // PRIORITAS 7: URL LANGSUNG
        // ==========================================
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
        
        // ==========================================
        // DEFAULT: AI CHAT
        // ==========================================
        logger.logIntent(input, 'chat', input);
        return { tool: 'chat', query: input };
    }

    /**
     * Eksekusi tool berdasarkan intent detection
     */
    async executeTool(tool, query) {
        const startTime = Date.now();
        logger.tool('Agent.executeTool', `Executing: ${tool}`, { query: query.substring(0, 100) });
        
        let result;
        
        try {
            switch (tool) {
                case 'open_web':
                    result = await open_web_tool(query);
                    // Simpan URL yang berhasil dibuka
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
     * Proses input tanpa streaming
     */
    async processInput(userInput) {
        logger.user(userInput);
        const startTime = Date.now();
        
        try {
            const intent = this.detectIntent(userInput);
            const toolResult = await this.executeTool(intent.tool, intent.query);
            
            if (toolResult && intent.tool !== 'chat') {
                this.history.push(`User: ${userInput}`);
                if (this.history.length > this.maxHistory) this.history.shift();
                this.history.push(`Jarvis: ${toolResult}`);
                logger.jarvis(toolResult.substring(0, 200));
                return toolResult;
            }

            // Chat biasa → AI dengan JSON output
            this.history.push(`User: ${userInput}`);
            if (this.history.length > this.maxHistory) this.history.shift();

            const conversationHistory = this.history.join("\n");
            const systemInstruction = _prompt.getDynamicPrompt(this.currentState);
            const fullPrompt = `${systemInstruction}\n\nRiwayat Percakapan:\n${conversationHistory}\n\nJarvis:`;

            const response = await this.model.invoke(fullPrompt);
            const aiOutput = response.content.trim();

            // Validate JSON output
            const validation = parseAndValidateAIOutput(aiOutput);
            
            if (validation.success) {
                // Valid JSON - execute tool
                const { tool, query } = validation.data;
                logger.debug('Agent', `AI output validated: tool=${tool}, query=${query.substring(0, 50)}`);
                
                // For chat tool, return the query text directly (not JSON wrapper)
                if (tool === 'chat') {
                    this.history.push(`Jarvis: ${query}`);
                    const duration = Date.now() - startTime;
                    logger.jarvis(`${query.substring(0, 200)} (${duration}ms)`);
                    return query;
                }
                
                const toolResult = await this.executeTool(tool, query);
                
                if (toolResult) {
                    this.history.push(`Jarvis: ${toolResult}`);
                    logger.jarvis(toolResult.substring(0, 200));
                    return toolResult;
                }
                
                // If tool returned null, fallback to AI response
                this.history.push(`Jarvis: ${aiOutput}`);
                const duration = Date.now() - startTime;
                logger.jarvis(`${aiOutput.substring(0, 200)} (${duration}ms)`);
                return aiOutput;
            } else {
                // Invalid JSON - fallback to chat
                logger.warn('Agent', `Invalid JSON output from AI: ${validation.error}`);
                this.history.push(`Jarvis: ${aiOutput}`);
                const duration = Date.now() - startTime;
                logger.jarvis(`${aiOutput.substring(0, 200)} (${duration}ms)`);
                return aiOutput;
            }
        } catch (error) {
            logger.logError('Agent.processInput', error);
            return "❌ Maaf, terjadi kesalahan. Silakan coba lagi.";
        }
    }

    /**
     * Proses input dengan streaming
     */
    async processInputStream(userInput, onTokenCallback) {
        logger.user(userInput);
        const startTime = Date.now();
        
        try {
            const intent = this.detectIntent(userInput);
            const toolResult = await this.executeTool(intent.tool, intent.query);
            
            if (toolResult && intent.tool !== 'chat') {
                if (onTokenCallback) onTokenCallback(toolResult);
                this.history.push(`User: ${userInput}`);
                if (this.history.length > this.maxHistory) this.history.shift();
                this.history.push(`Jarvis: ${toolResult}`);
                logger.jarvis(`${toolResult.substring(0, 200)} (${Date.now() - startTime}ms)`);
                return toolResult;
            }

            // Chat biasa → AI streaming
            this.history.push(`User: ${userInput}`);
            if (this.history.length > this.maxHistory) this.history.shift();

            const conversationHistory = this.history.join("\n");
            const systemInstruction = _prompt.getDynamicPrompt(this.currentState);
            const fullPrompt = `${systemInstruction}\n\nRiwayat Percakapan:\n${conversationHistory}\n\nJarvis:`;

            const stream = await this.model.stream(fullPrompt);
            let fullAnswer = "";

            for await (const chunk of stream) {
                const token = chunk.content;
                fullAnswer += token;
                if (onTokenCallback) onTokenCallback(token); 
            }

            this.history.push(`Jarvis: ${fullAnswer.trim()}`);
            const duration = Date.now() - startTime;
            logger.jarvis(`${fullAnswer.trim().substring(0, 200)} (${duration}ms)`);
            
            return fullAnswer.trim();
        } catch (error) {
            logger.logError('Agent.processInputStream', error);
            if (onTokenCallback) onTokenCallback("❌ Maaf, terjadi kesalahan.");
            return "❌ Maaf, terjadi kesalahan.";
        }
    }   
}

module.exports = new JarvisAgent();