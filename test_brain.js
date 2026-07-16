// test_brain.js
const agent = require('./src/engine/agent');
const { open_web_tool } = require('./src/tools/web_tools');
const { yt_search_tool } = require('./src/tools/yt_tools');

async function runTest() {
    console.log("--- TEST FASE 1 (Otak Dasar) ---");
    
    const tests = [
        "Siapa namamu?",
        "Apa itu kecerdasan buatan?",
        "Bisa jelaskan apa itu quantum computing secara singkat?"
    ];

    for (let t of tests) {
        console.log(`\nUser: ${t}`);
        const response = await agent.processInput(t);
        console.log(`Jarvis: ${response}`);
    }

    console.log("\n--- TEST FASE 2 (Integrasi Tools) ---");

    const toolTests = [
        "Buka google.com",
        "Cari video musik santai di YouTube",
        "Buka youtube.com/watch?v=dQw4w9WgXcQ"
    ];

    for (let t of toolTests) {
        console.log(`\nUser: ${t}`);
        // Di sini kita memanggil fungsi yang sama seperti di main.js untuk testing
        
        if (t.toLowerCase().includes("buka") || t.toLowerCase().includes("open")) {
            const result = open_web_tool(t);
            console.log(`System Action: ${result}`);
        } else if (t.toLowerCase().includes("youtube") || t.toLowerCase().includes("cari video")) {
            const result = yt_search_tool(t);
            console.log(`System Action: ${result}`);
        }
    }

    console.log("\n--- TESTING SELESAI ---");
}

runTest().then(() => {
    process.exit(0);
}).catch(err => {
    console.error("Terjadi kesalahan saat testing:", err);
    process.exit(1);
});
