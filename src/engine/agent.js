// src/engine/agent.js
const { ChatOllama } = require("@langchain/community/chat_models/ollama"); // Perbaikan import
const { PromptTemplate } = require("prompt_template"); 
const { SystemMessagePromptTemplate, HumanMessagePromptTemplate } = require("@langchain/core/prompts");
const {_prompt} = require("./prompt");

/**
 * Agent class handles the interaction between the LLM and the application.
 */
class JarvisAgent {
    constructor() {
        // Inisialisasi Model (Contoh menggunakan Ollama)
        this.model = new ChatOllama({
            model: "qwen2.5:7b",
            temperature: 0,
        });
    }

    /**
     * Fungsi utama untuk memproses input teks dari user.
     * @param {string} userInput - Teks yang diucapkan/diketik oleh pengguna.
     * @returns {Promise<string>} - Jawaban dari Jarvis.
     */
    async processInput(userInput) {
        try {
            const fullPrompt = `${_prompt.systemPrompt}\n\nUser: ${userInput}`;
            const response = await this.model.invoke(fullPrompt);
            return response.content;
        } catch (error) {
            console.error("Error di JarvisAgent:", error);
            return "Maaf, saya mengalami kendala teknis.";
        }
    }
}

module.exports = new JarvisAgent();