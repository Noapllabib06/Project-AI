/**
 * src/engine/agent.js
 * Mesin utama — Tool Registry Pattern.
 * LLM (Qwen 2.5) memilih tool via native function-calling definitions
 * yang dikirim sebagai context dalam prompt.
 * 
 * Alur:
 * 1. Registry memuat semua tool dari src/tools/ secara otomatis
 * 2. Definis tool dikirim ke LLM sebagai bagian dari system prompt
 * 3. LLM output JSON { tool, query } — parsing standar
 * 4. Eksekusi tool via registry.execute()
 * 5. Jika gagal, Micro ReAct loop maksimal 1 retry
 */

const { ChatOllama } = require("@langchain/ollama");
const _prompt = require("./prompt");
const logger = require("../utils/logger");
const registry = require("../tools/registry");
const { generateErrorFeedback } = require("./feedback_loop");

// Muat semua tool dari registry sekali saat startup
registry.loadAll();

class JarvisAgent {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5:7b",
            temperature: 0.1,
            num_ctx: 32000,
        });
        
        this.chatHistory = [];
        this.maxChatHistory = 10;
        this.history = []; 
        this.maxHistory = 12;
        this.currentState = "Menunggu perintah pengguna (Idle)"; 
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
     * One-Shot Router with Tool Registry + Micro ReAct
     * 
     * Alur:
     * A. Panggil Ollama API 1x
     * B. Parse JSON balasan { tool, query }
     * C. Eksekusi tool via registry.execute()
     * D. Jika tool gagal & retryCount < 1, inject feedback ke chatHistory & rekursi
     * E. Jika tool gagal & retryCount >= 1, return graceful apology
     */
    async _executePipeline(userInput, { onTokenCallback = null, startTime = null, retryCount = 0 } = {}) {
        const t0 = startTime || Date.now();

        try {
            // A. Simpan pesan user ke chatHistory
            this.chatHistory.push({ role: 'user', content: userInput });
            if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();

            // B. Bangun payload messages: system (dengan tool definitions) + chatHistory
            const messages = [
                { role: 'system', content: _prompt.getDynamicPrompt(this.currentState) },
                ...this.chatHistory
            ];

            // C. Panggil Ollama API — tool definitions sudah ada di system prompt
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

            // F. Jika hanya chat, return langsung
            if (tool === 'chat') {
                if (onTokenCallback) onTokenCallback(query);
                logger.jarvis(`${query.substring(0, 200)} (${Date.now() - t0}ms)`);
                return query;
            }

            if (onTokenCallback) onTokenCallback(`Menjalankan: ${tool}...\n`);
            
            // G. Eksekusi tool via Registry Pattern
            let toolResult;
            let toolError = null;
            try {
                const execResult = await registry.execute(tool, { query: query });
                if (execResult.success) {
                    toolResult = execResult.data;
                } else {
                    toolError = execResult.error;
                    toolResult = null;
                }
            } catch (execError) {
                toolError = execError.message || String(execError);
                toolResult = null;
            }
            
            // H. Jika hasil tool adalah error
            const isError = !toolResult || (typeof toolResult === 'string' && toolResult.startsWith('❌'));
            
            if (isError) {
                const errorMsg = toolError || (typeof toolResult === 'string' ? toolResult.replace(/^❌\s*/, '') : 'Unknown error');
                
                if (retryCount < 1) {
                    // --- MICRO REACT TRIGGERED (1st retry) ---
                    logger.warn('MicroReAct', `Tool "${tool}" gagal. Injecting feedback & retrying (retryCount=${retryCount})...`);
                    
                    const feedbackPrompt = generateErrorFeedback(tool, errorMsg);
                    this.chatHistory.push({ role: 'user', content: feedbackPrompt });
                    
                    if (this.chatHistory.length > this.maxChatHistory) this.chatHistory.shift();
                    
                    return await this._executePipeline(userInput, {
                        onTokenCallback,
                        startTime: t0,
                        retryCount: retryCount + 1
                    });
                } else {
                    // --- FINAL FALLBACK (retryCount >= 1) ---
                    const fallbackMsg = `Maaf, saya tidak dapat menyelesaikan perintah Anda karena sistem internal mengalami masalah: ${errorMsg}. Silakan coba dengan perintah yang berbeda atau periksa kembali koneksi server.`;
                    logger.warn('MicroReAct', `Final fallback after ${retryCount} retries.`);
                    if (onTokenCallback) onTokenCallback(fallbackMsg);
                    return fallbackMsg;
                }
            }

            // I. Return hasil — tool berhasil dieksekusi
            if (onTokenCallback) onTokenCallback(toolResult);
            logger.jarvis(`${typeof toolResult === 'string' ? toolResult.substring(0, 200) : JSON.stringify(toolResult).substring(0, 200)} (${Date.now() - t0}ms)`);
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
     * Proses input tanpa streaming
     */
    async processInput(userInput) {
        logger.user(userInput);
        return await this._executePipeline(userInput, { onTokenCallback: null });
    }

    /**
     * Proses input dengan streaming
     */
    async processInputStream(userInput, onTokenCallback) {
        logger.user(userInput);
        return await this._executePipeline(userInput, { onTokenCallback });
    }
}

module.exports = new JarvisAgent();