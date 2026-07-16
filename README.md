# 🤖 JARVIS AI Agent

**Just For Fun Project**
Speech To Text is on Problem, So it can't be Used

Asisten AI pribadi yang berjalan **100% lokal** di komputer Anda menggunakan Ollama. Bisa chat, browsing web, putar musik/video YouTube, dan manajemen kredensial terenkripsi.

## ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 💬 **Chat AI Lokal** | Model Ollama (qwen2.5:7b) berjalan di komputer sendiri |
| 🌐 **Buka Website** | "buka youtube", "buka lms telkom", "buka web whatsapp" |
| 🔍 **Cari Internet** | "cari berita terbaru" → scraping Google/DuckDuckGo |
| 🎵 **Putar YouTube Music** | "putar lagu bohemian rhapsody", "putar musik jazz" |
| 🎬 **Putar Video YouTube** | "putar video tutorial", "tonton trailer film" |
| 📄 **Baca Halaman Web** | "baca artikel https://..." → scraping konten |
| 🎤 **Voice Input** | Dukungan speech-to-text (browser) |
| 📝 **Logging System** | Debug & maintain dengan log berwarna |
| 🖥️ **UI Futuristik** | Tampilan cyberpunk dengan animasi canvas |

## 📋 Persyaratan

- **Node.js** v18+
- **Ollama** (https://ollama.ai)
- **Model AI** (download via Ollama)
- RAM 8GB+ (16GB recommended)

## 🚀 Instalasi Cepat

```bash
# 1. Install Ollama dari https://ollama.ai/download

# 2. Download model AI
ollama pull qwen2.5:7b

# 3. Clone & install dependencies
git clone https://github.com/Noapllabib06/Project-AI.git
cd Project-AI
npm install

# 4. Jalankan Jarvis!
npx electron src/main.js
```

## 📖 Panduan Lengkap

Baca **[GUIDE.md](GUIDE.md)** untuk panduan instalasi detail, penggunaan, pemecahan masalah, dan tips keamanan.

## 🎯 Contoh Penggunaan

```text
👤 "buka youtube"
🤖 ✅ Membuka https://www.youtube.com di browser.

👤 "putar lagu misery dari nsb"
🤖 🎵 Memutar Musik: Misery - NSB
    🎧 Membuka YouTube Music...

👤 "cari berita teknologi terbaru"
🤖 🔍 Hasil pencarian untuk: "berita teknologi terbaru"
    📌 [judul artikel]
    [link artikel]

👤 "buka lms telkom"
🤖 ✅ Membuka https://lms.telkomuniversity.ac.id di browser.
```

## 🏗️ Struktur Proyek

```
src/
├── main.js              # Entry point Electron
├── preload.js           # Jembatan frontend-backend
├── engine/
│   ├── agent.js         # Mesin AI + intent detection
│   └── prompt.js        # Template instruksi AI
├── tools/
│   ├── web_tools.js     # Web browsing & search
│   └── yt_tools.js      # YouTube music & video
├── gui/
│   ├── index.html       # UI utama
│   ├── style.css        # Desain cyberpunk
│   └── ui_handler.js    # Logika frontend
└── utils/ "POSTPONED"
    
```

## 🔒 Keamanan

- ✅ **100% lokal** — Tidak ada data dikirim ke server manapun
- ✅ **AI Model** — Berjalan di komputer sendiri via Ollama
- ✅ **Tidak ada cloud** — Semua data tetap di mesin Anda

## 📦 Dependencies

- `@langchain/ollama` — Koneksi ke Ollama
- `electron` — Desktop window
- `play-dl` — YouTube search & streaming
- `axios` + `cheerio` — Web scraping
- `langchain` — AI framework

## 📞 Kontak

Dibuat oleh **Noapllabib**  
📧 naufallabibasyidiq@student.telkomuniversity.ac.id

---

*Selamat menggunakan Jarvis! 🚀*
