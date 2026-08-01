const axios = require('axios');

async function runTest() {
    try {
        console.log("1. Menguji Penambahan Memori...");
        // Endpoint yang benar sesuai dengan local_memory.py kita adalah /index
        const indexRes = await axios.post('http://localhost:8000/index', {
            texts: [
                "Saya berencana membuat framework AI bernama Project-AI menggunakan Electron.",
                "Rahasia password server saya adalah 'kopi_hitam_123'."
            ]
        });
        console.log(`✅ Memori berhasil ditambahkan! (${indexRes.data.added} dokumen)`);

        console.log("\n2. Menguji Pencarian Hybrid RAG...");
        // Endpoint yang benar sesuai dengan local_memory.py kita adalah /search
        const searchRes = await axios.post('http://localhost:8000/search', {
            query: "Apa nama framework yang ingin saya buat?",
            k: 3
        });
        console.log("✅ Hasil Pencarian 1:", searchRes.data.results);

        const searchRes2 = await axios.post('http://localhost:8000/search', {
            query: "Apa password server saya yang kemarin saya beritahu?",
            k: 3
        });
        console.log("✅ Hasil Pencarian 2:", searchRes2.data.results);

    } catch (error) {
        console.error("❌ Terjadi Error:", error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

runTest();
