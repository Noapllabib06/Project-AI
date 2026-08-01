const axios = require('axios');

// Fungsi internal untuk mengubah teks menjadi vektor menggunakan Ollama lokal
async function getEmbedding(text) {
    try {
        const response = await axios.post('http://localhost:11434/api/embeddings', {
            model: 'nomic-embed-text', // Pastikan model ini sudah di-pull di Ollama
            prompt: text
        });
        return response.data.embedding;
    } catch (error) {
        console.error("[Error Embedding]: Gagal menghubungi Ollama.", error.message);
        // Mengembalikan array kosong jika gagal agar aplikasi tidak crash
        return Array.from({ length: 768 }, () => 0.0);
    }
}

const memorySearchTool = {
    name: "search_memory",
    description: "Gunakan tool ini JIKA pengguna bertanya tentang masa lalu, fakta yang pernah mereka sebutkan, profil mereka, atau jika kamu butuh mengingat konteks sebelumnya.",
    parameters: {
        type: "object",
        properties: {
            query: {
                type: "string",
                description: "Kata kunci, inti pertanyaan, atau topik yang ingin dicari di dalam ingatan."
            }
        },
        required: ["query"]
    },
    execute: async ({ query }) => {
        try {
            console.log(`\n🧠 [Agent] Mencoba mengingat tentang: "${query}"...`);

            // 1. Ubah query dari Qwen menjadi bentuk Vektor (Angka)
            const queryVector = await getEmbedding(query);

            // 2. Kirim permintaan pencarian ke Server Python RAG kita
            const response = await axios.post('http://localhost:8000/search', {
                query_text: query,
                query_vector: queryVector,
                top_k: 3
            });

            const results = response.data.results;

            // 3. Evaluasi hasil pencarian
            if (!results || results.length === 0 || results[0].includes("Belum ada memori")) {
                console.log("🧠 [Agent] Ingatan tidak ditemukan.");
                return "Sistem: Tidak ada informasi terkait di dalam ingatan masa lalu.";
            }

            // 4. Susun konteks untuk disuapkan kembali ke Qwen
            console.log("🧠 [Agent] Berhasil menemukan ingatan yang relevan!");
            const konteks = results.join("\n- ");

            return `Sistem menemukan informasi dari ingatan masa lalu:\n- ${konteks}\n\nGunakan informasi di atas untuk menjawab pertanyaan pengguna dengan natural.`;

        } catch (error) {
            console.error("\n❌ [Tool Error] Gagal mencari memori:", error.message);
            return `Sistem Error: Gagal mengakses database memori (${error.message})`;
        }
    }
};

module.exports = memorySearchTool;