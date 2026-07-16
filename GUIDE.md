# 📘 Buku Panduan Jarvis AI Agent
## Asisten AI Lokal dengan Kemampuan Web & YouTube

---

## 📋 Daftar Isi
1. [Apa itu Jarvis?](#1-apa-itu-jarvis)
2. [Persyaratan Sistem](#2-persyaratan-sistem)
3. [Instalasi Ollama & Model AI](#3-instalasi-ollama--model-ai)
4. [Instalasi Proyek](#4-instalasi-proyek)
5. [Menjalankan Jarvis](#5-menjalankan-jarvis)
6. [Panduan Penggunaan](#6-panduan-penggunaan)
7. [Fitur Lengkap](#7-fitur-lengkap)
8. [Pemecahan Masalah](#8-pemecahan-masalah)
9. [Log System](#9-log-system)
10. [Keamanan & Privasi](#10-keamanan--privasi)

---

## 1. Apa itu Jarvis?

**JARVIS** (Just A Rather Very Intelligent System) adalah asisten AI pribadi yang berjalan **100% lokal** di komputer Anda. Tidak perlu koneksi internet untuk kecerdasannya — semua proses AI menggunakan model dari Ollama yang berjalan di mesin Anda sendiri.

### Yang Bisa Dilakukan Jarvis:
- 💬 **Chat & Tanya Jawab** — Dengan memori percakapan
- 🌐 **Buka Website** — Cukup dengan perintah "buka youtube"
- 🔍 **Cari di Internet** — "cari berita terbaru"
- 📄 **Baca Halaman Web** — "baca artikel ini"
- 🎵 **Putar Musik YouTube** — "putar lagu bohemian rhapsody"
- 🎬 **Putar Video YouTube** — "putar video tutorial"
- 🔐 **Manajemen Kredensial** — Simpan & kelola password (terenkripsi)

---

## 2. Persyaratan Sistem

### Minimal:
| Komponen | Spesifikasi |
|----------|-------------|
| **OS** | Windows 10/11, macOS, atau Linux |
| **RAM** | 8 GB (minimal), 16 GB (direkomendasikan) |
| **Storage** | 10 GB free space (untuk model AI) |
| **CPU** | 4 core atau lebih |
| **Internet** | Hanya untuk download model & dependencies |

### Software yang Diperlukan:
| Software | Fungsi |
|----------|--------|
| [Node.js](https://nodejs.org/) v18+ | Runtime JavaScript |
| [Ollama](https://ollama.ai/) | Mesin AI lokal |
| [Git](https://git-scm.com/) (opsional) | Version control |

---

## 3. Instalasi Ollama & Model AI

### Langkah 1: Install Ollama

**Windows:**
1. Download Ollama dari https://ollama.ai/download
2. Jalankan installer `OllamaSetup.exe`
3. Ikuti petunjuk instalasi (default saja)
4. Setelah selesai, Ollama akan berjalan di background (system tray)

**macOS:**
```bash
# Via Homebrew
brew install ollama

# Atau download dari https://ollama.ai/download
```

**Linux:**
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

### Langkah 2: Download Model AI

Jarvis menggunakan **Qwen 2.5 (7B)** sebagai default. Buka **Command Prompt / Terminal** dan jalankan:

```bash
# Download model default (Qwen 2.5 7B - ~4.5 GB)
ollama pull qwen2.5:7b
```

**Model alternatif yang bisa digunakan:**
```bash
# Lebih ringan (3.8B - ~2.5 GB) - cocok untuk RAM 8GB
ollama pull phi3

# Model terbaik (8B - ~5 GB) - butuh RAM 16GB+
ollama pull llama3.1

# Model cepat (7B - ~4.5 GB)
ollama pull mistral

# Model lokal Indonesia (7B)
ollama pull llama3-ina
```

### Langkah 3: Verifikasi Ollama Berjalan

```bash
# Cek status Ollama
ollama list
# Harusnya muncul daftar model yang sudah di-download

# Test model
ollama run qwen2.5:7b "Halo, siapa kamu?"
# Jika berhasil, AI akan merespon
# Ketik /bye untuk keluar
```

---

## 4. Instalasi Proyek

### Langkah 1: Clone atau Download Proyek

```bash
# Clone dari GitHub (jika ada)
git clone https://github.com/username/project-root.git
cd project-root

# Atau jika sudah punya foldernya, buka terminal di folder project
cd C:\Users\Noapllabib\Documents\project-root
```

### Langkah 2: Install Dependencies

```bash
npm install
```

Ini akan menginstall semua package yang diperlukan:
| Package | Fungsi |
|---------|--------|
| `@langchain/ollama` | Koneksi ke Ollama |
| `langchain` | Framework AI |
| `electron` | Desktop window |
| `play-dl` | Streaming YouTube |
| `axios` | HTTP requests |
| `cheerio` | Scraping web |

### Langkah 3: Verifikasi Struktur Folder

Pastikan struktur folder seperti ini:
```
project-root/
├── src/
│   ├── main.js              # Entry point Electron
│   ├── preload.js            # Jembatan frontend-backend
│   ├── engine/
│   │   ├── agent.js          # Mesin AI utama
│   │   └── prompt.js         # Template instruksi
│   ├── tools/
│   │   ├── web_tools.js      # Tools browsing
│   │   └── yt_tools.js       # Tools YouTube
│   ├── gui/
│   │   ├── index.html        # UI utama
│   │   ├── style.css         # Desain futuristik
│   │   └── ui_handler.js     # Logika frontend
│   └── utils/ "POSTPONED"
│       ├── logger.js         
│       ├── credentials.js   
│       └── audio_utils.js    
├── logs/                     # File log (otomatis dibuat)
├── package.json
└── GUIDE.md                  # Buku panduan ini
```

---

## 5. Menjalankan Jarvis

### Mode 1: Dengan UI (Electron - Direkomendasikan)

```bash
# Pastikan Ollama berjalan (cek system tray)
# Lalu jalankan:
npx electron src/main.js
```

Ini akan membuka window Jarvis dengan:
- 🎨 Tampilan cyberpunk futuristik
- 💬 Chat dengan streaming real-time
- 🎤 Voice input (browser dengan Web Speech API)
- 🔵 AI Orb animasi

### Mode 2: Tanpa UI (Test/CLI)

```bash
node test_brain.js
```

### Mode 3: Mode Development

```bash
# Untuk development dengan reload otomatis
npm install --save-dev electron-reload

# Atau jalankan dengan debug
npx electron src/main.js --inspect
```

---

## 6. Panduan Penggunaan

### 🎯 Perintah Dasar

| Perintah | Contoh | Yang Terjadi |
|----------|--------|--------------|
| **Buka Website** | "buka youtube" | Membuka https://www.youtube.com |
| | "buka lms telkom" | Membuka LMS Telkom University |
| | "buka web whatsapp" | Membuka WhatsApp Web |
| | "buka google.com" | Membuka Google |
| **Cari di Internet** | "cari berita teknologi" | Menampilkan hasil pencarian Google |
| | "search resep nasi goreng" | Mencari di Google |
| **Baca Artikel** | "baca https://..." | Mengambil konten halaman |
| **Putar Musik** | "putar lagu bohemian rhapsody" | Cari & buka YouTube Music |
| | "putar musik jazz" | Cari lagu jazz |
| | "putar lagu misery dari nsb" | Parse artis & judul |
| **Putar Video** | "putar video tutorial" | Cari & buka YouTube |
| | "tonton trailer film" | Cari video |
| **Cari YouTube** | "cari youtube podcast" | Tampilkan 5 hasil |
| | "search youtube AI" | Cari di YouTube |

### 💬 Chat Biasa

Jarvis juga bisa diajak ngobrol biasa:
- "Halo, apa kabar?"
- "Siapa kamu?"
- "Ceritakan tentang dirimu"
- "Apa yang bisa kamu lakukan?"

### 🔐 Manajemen Kredensial (Password) DITUNDA !

> ⚠️ **PENTING:** Semua password disimpan TERENKRIPSI di komputer Anda sendiri!

**Menyimpan password:**
```
"simpan password github: username=namaanda, password=xxx"
"save credential lms telkom: email=saya@email.com, pass=xxx"
```

**Login otomatis:**
```
"buka github dan login"
"masuk ke lms telkom"
```

**Lihat daftar akun:**
```
"lihat daftar kredensial"
"akun apa saja yang tersimpan"
```

**Hapus kredensial:**
```
"hapus kredensial github"
```

> Password disimpan di file `.jarvis-credentials.json` (terenkripsi AES-256)

---

## 7. Fitur Lengkap

### 🌐 Web Tools
- **open_web_tool** — Buka URL/situs di browser default
- **scrape_web_tool** — Baca konten halaman web
- **search_web_tool** — Cari di Google/DuckDuckGo

### 🎵 YouTube Tools
- **play_youtube_music** — Cari & putar lagu di YouTube Music
- **play_youtube_video** — Cari & putar video YouTube
- **yt_search_tool** — Cari konten YouTube
- **getVideoInfo** — Dapatkan info video

### 🧠 AI Engine
- **ChatOllama** — Model AI lokal via Ollama
- **Memori Konteks** — Ingat 6 percakapan terakhir
- **State Management** — Status sistem dinamis
- **Smart Intent Detection** — Deteksi perintah otomatis

### 🔐 Credential Manager DITUNDA !!
- **Enkripsi AES-256** — Password aman
- **Local Only** — Tidak pernah ke internet
- **Auto Key Generation** — Key unik per komputer

### 📝 Logging System
- **File Log** — Tersimpan di folder `logs/`
- **Color Console** — Output berwarna untuk debugging
- **Auto-rotate** — Rotasi setiap 1000 log

---

## 8. Pemecahan Masalah

### ❌ Error: "play.videoInfo is not a function"
**Penyebab:** Versi play-dl tidak kompatibel
**Solusi:**
```bash
npm install play-dl@latest
```

### ❌ Error: "Ollama is not running"
**Penyebab:** Service Ollama tidak berjalan
**Solusi:**
```bash
# Windows: Cek system tray, klik Ollama
# Atau restart:
ollama serve

# Cek status:
ollama list
```

### ❌ Error: "Model not found"
**Penyebab:** Model AI belum di-download
**Solusi:**
```bash
ollama pull qwen2.5:7b
```

### ❌ Error: Electron blank/white screen
**Penyebab:** File tidak ditemukan
**Solusi:**
```bash
# Pastikan struktur folder benar
dir src\gui\index.html  # Windows
ls src/gui/index.html    # Mac/Linux
```

### ❌ UI tidak responsif / Input tenggelam
**Solusi:** Update CSS sudah diperbaiki di versi terbaru. Jalankan ulang.

### ❌ "buka lms telkom" hanya search
**Penyebab:** Domain tidak dikenal
**Solusi:** Sudah diperbaiki — sekarang langsung buka `lms.telkomuniversity.ac.id`

### ❌ "buka web whatsapp" cuma search
**Penyebab:** Prefix "web" tidak dikenali
**Solusi:** Sudah diperbaiki — sekarang langsung buka `web.whatsapp.com`

---

## 9. Log System

Log disimpan di folder `logs/jarvis-YYYY-MM-DD.log`

### Format Log:
```
[23:55:08.126] [ℹ️ INFO] [Logger] Logging system initialized
[23:55:08.419] [ℹ️ INFO] [JarvisAgent] Agent initialized
[23:56:08.681] [👤 USER] [User] bisa kamu buka youtube
[23:56:08.682] [🐛 DEBUG] [IntentDetector] Cleaned: "buka youtube"
[23:56:08.683] [🔧 TOOL] [Agent.executeTool] Executing: open_web
[23:56:22.459] [🤖 JARVIS] [Jarvis] ✅ Membuka https://youtube.com di browser.
```

### Level Log:
| Level | Warna | Kegunaan |
|-------|-------|----------|
| `🐛 DEBUG` | Cyan | Detail internal untuk debugging |
| `ℹ️ INFO` | Hijau | Informasi umum |
| `🔧 TOOL` | Kuning | Eksekusi tools |
| `⚠️ WARN` | Kuning | Peringatan |
| `❌ ERROR` | Merah | Error |
| `👤 USER` | Cyan | Input pengguna |
| `🤖 JARVIS` | Magenta | Response AI |

### Melihat Log:
```bash
# Buka file log terbaru
notepad logs\jarvis-2026-07-17.log

# Atau lihat real-time di terminal
node -e "const fs = require('fs'); fs.watchFile('./logs/jarvis-2026-07-17.log', (curr) => console.log(curr.mtime));"
```

---

## 10. Keamanan & Privasi

### 🔒 100% Lokal
| Komponen | Lokasi |
|----------|--------|
| **AI Model** | Komputer Anda (Ollama) |
| **Percakapan** | RAM lokal (hilang saat ditutup) |
| **Password** | File `.jarvis-credentials.json` (terenkripsi) |
| **Log** | Folder `logs/` lokal |
| **History** | RAM lokal (max 6 percakapan) |

### 🌐 Yang Butuh Internet
- Membuka website (browser Anda)
- Streaming YouTube (koneksi internet)
- Google Search (scraping hasil)

### 🔐 Enkripsi Password
- **Algoritma:** AES-256-CBC
- **Key:** Digenerate dari hostname + username + path proyek
- **Penyimpanan:** File `.jarvis-credentials.json` (terenkripsi penuh)
- **Akses:** Hanya bisa dibaca di komputer yang sama

### 💡 Tips Keamanan
1. Jangan bagikan file `.jarvis-credentials.json` ke siapapun
2. Hapus log jika berisi informasi sensitif: `del logs\*.log`
3. Untuk keamanan maksimal, hapus file kredensial: `del .jarvis-credentials.json`
4. Jarvis tidak menyimpan password di cloud atau mengirim ke internet

---

## 📞 Dukungan

Jika ada masalah atau pertanyaan:
1. Cek [Pemecahan Masalah](#8-pemecahan-masalah) di atas
2. Buka file log di `logs/` untuk debug
3. Jalankan dengan terminal untuk melihat output langsung

---

*Selamat menggunakan Jarvis! 🚀*
*Dibuat dengan ❤️ dan berjalan 100% lokal di komputer Anda*
