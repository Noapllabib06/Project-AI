/**
 * src/engine/agent.js
 * Mesin utama dengan fitur Memori (History) dan State Management.
 */

const { ChatOllama } = require("@langchain/ollama");
const _prompt = require("./prompt");

class JarvisAgent {
    constructor() {
        this.model = new ChatOllama({
            model: "qwen2.5:7b",
            temperature: 0,
        });
        
        // Memori jangka pendek (Array lokal)
        this.history = []; 
        // Batasi memori (misal: ingat 6 pasang percakapan terakhir)
        this.maxHistory = 12; 
        
        // Status awal sistem
        this.currentState = "Menunggu perintah pengguna (Idle)"; 
    }

    /**
     * Memperbarui status/state Jarvis dari luar (misal dari main.js atau file tools)
     * @param {string} newState - Status terbaru
     */
    updateState(newState) {
        this.currentState = newState;
    }

    async processInput(userInput) {
        try {
            // 1. Simpan input user ke memori
            this.history.push(`User: ${userInput}`);

            // 2. Cegah memori terlalu panjang (buang yang paling lama jika melebihi batas)
            if (this.history.length > this.maxHistory) {
                this.history.shift(); 
            }

            // 3. Susun konteks dari history array
            const conversationHistory = this.history.join("\n");

            // 4. Ambil instruksi dinamis dengan state terbaru
            const systemInstruction = _prompt.getDynamicPrompt(this.currentState);

            // 5. Gabungkan instruksi, riwayat, dan pemicu jawaban
            const fullPrompt = `${systemInstruction}\n\nRiwayat Percakapan:\n${conversationHistory}\n\nJarvis:`;

            // 6. Panggil LLM
            const response = await this.model.invoke(fullPrompt);
            const answer = response.content.trim();

            // 7. Simpan jawaban AI ke memori untuk konteks selanjutnya
            this.history.push(`Jarvis: ${answer}`);

            return answer;
        } catch (error) {
            console.error("Error di JarvisAgent:", error);
            return "Maaf, saya mengalami kendala teknis dalam memproses memori.";
        }
    }
}

module.exports = new JarvisAgent();