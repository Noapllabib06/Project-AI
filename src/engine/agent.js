/**
 * src/engine/agent.js
 * Mesin utama yang menghubungkan AI (Ollama) dengan input pengguna.
 */

// 1. Import library versi terbaru untuk Ollama
const { ChatOllama } = require("@langchain/ollama");

// 2. Import file prompt yang sudah kita buat sebelumnya
const _prompt = require("./prompt");

class JarvisAgent {
    constructor() {
        // Inisialisasi Model menggunakan Ollama secara lokal
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
            // Menggabungkan instruksi dasar (systemPrompt) dengan pertanyaan pengguna
            const fullPrompt = `${_prompt.systemPrompt}\n\nUser: ${userInput}`;
            
            // Memanggil model AI untuk menghasilkan jawaban
            const response = await this.model.invoke(fullPrompt);
            
            return response.content;
        } catch (error) {
            console.error("Error di JarvisAgent:", error);
            return "Maaf, saya mengalami kendala teknis.";
        }
    }
}

// 3. Mengekspor class JarvisAgent agar bisa dijalankan oleh test_brain.js dan main.js
module.exports = new JarvisAgent();