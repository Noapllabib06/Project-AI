# 🤖 Jarvis AI - User Manual
**Sistem Asisten AI Lokal dengan Memori Jangka Panjang (RAG)**

Jarvis adalah asisten kecerdasan buatan pribadi yang berjalan sepenuhnya secara lokal. Jarvis menggabungkan fleksibilitas **Node.js/Electron** untuk antarmuka dan manajemen alat, dengan kekuatan **Python FastAPI** untuk sistem memori berbasis vektor (RAG).

---

## 🏗️ Arsitektur Sistem

Jarvis menggunakan **Arsitektur Hybrid**:
- **Frontend & Agent Engine (Node.js/Electron):** Menangani antarmuka pengguna, manajemen jendela, dan routing logika AI menggunakan model LLM lokal via Ollama.
- **Memory Server (Python FastAPI):** Bertindak sebagai "Otak Memori" yang menggunakan teknik *Retrieval-Augmented Generation* (RAG) untuk menyimpan dan mengambil dokumen teks secara efisien.

### 📂 Struktur Proyek
```text
project-root/
├── src/
│   ├── engine/        # Logika utama Agent, Prompt, dan Context Manager
│   ├── gui/           # Antarmuka pengguna (HTML/CSS/JS)
│   ├── tools/         # Kumpulan tools (Web, YouTube, File System)
│   ├── utils/         # Utility seperti Logger dan Credential Manager
│   ├── main.js        # Entry point utama Electron (Main Process)
│   └── preload.js     # Jembatan keamanan antara Main dan Renderer process
├── local_memory.py    # Server FastAPI untuk Memori Vektor RAG
├── package.json       # Konfigurasi dependensi Node.js
├── text_metadata.pkl  # Database penyimpanan teks asli (Persistence)
└── test_rag.py        # Skrip pengujian integritas sistem memori
```

---

## 🛠️ Prasyarat & Instalasi

### 1. Perangkat Lunak Dasar
Pastikan Anda telah menginstal:
- **Node.js** (Versi terbaru LTS direkomendasikan)
- **Python 3.10+**
- **Ollama** (Untuk menjalankan LLM secara lokal)

### 2. Instalasi Model AI
Jarvis menggunakan model **Qwen 2.5 (7B)**. Buka terminal Anda dan jalankan:
```bash
ollama run qwen2.5:7b
```

### 3. Instalasi Dependensi

#### **Node.js (Frontend & Agent)**
Buka terminal di root proyek dan jalankan:
```bash
npm install
```

#### **Python (Memory Server)**
Disarankan menggunakan Virtual Environment agar tidak terjadi konflik library:
```powershell
# Membuat virtual environment
python -m venv .venv

# Mengaktifkan virtual environment (Windows)
.\.venv\Scripts\Activate.ps1

# Instalasi library RAG
pip install numpy sentence-transformers turbovec fastapi uvicorn pydantic
```

---

## 🚀 Cara Menjalankan Proyek

Sistem ini terdiri dari dua komponen yang harus berjalan bersamaan.

### Metode A: Otomatis (Recommended)
Jika proyek sudah dikonfigurasi dengan `concurrently` di `package.json`, Anda cukup menjalankan:
```bash
npm run dev
```

### Metode B: Manual (Jika ingin monitoring terpisah)
1. **Jalankan Server Memori (Terminal 1):**
   ```powershell
   .\Pvenv\Scripts\python.exe local_memory.py
   ```
   *Pastikan muncul pesan: `🚀 Local Memory Service berjalan di http://localhost:8000`*

2. **Jalankan Aplikasi Jarvis (Terminal 2):**
   ```bash
   npm start
   ```

---

## 🌟 Kapabilitas & Fitur

### 🌐 Web & Media Tools (`src/tools/`)
- **Pencarian Web**: Mencari informasi terbaru menggunakan Yahoo Search (anti-block).
- **Web Scraping**: Membaca dan merangkum konten dari URL tertentu.
- **Kontrol YouTube**: Memutar lagu, video, dan mencari konten YouTube secara otomatis.
- **Navigasi Cepat**: Membuka situs populer (Google, GitHub, dll) dengan perintah sederhana.

### 📄 Manajemen File
- **Create File**: Membuat catatan teks langsung ke komputer pengguna.
- **Read File**: Membaca isi file lokal untuk dianalisis oleh AI.

### 🧠 Memori Jangka Panjang (RAG)
Fitur unggulan yang memungkinkan Jarvis "mengingat" informasi secara permanen:
- **Embedding**: Menggunakan model `all-MiniLM-L6-v2` untuk mengubah teks menjadi vektor dimensi 384.
- **TurboQuant Index**: Implementasi kompresi vektor **2-bit** via `turbovec` untuk pencarian super cepat dengan penggunaan RAM yang sangat rendah.
- **Semantic Search**: Mencari informasi berdasarkan "makna", bukan sekadar kata kunci.

---

## ⚠️ Limitasi & Troubleshooting

| Masalah | Penyebab | Solusi |
| :--- | :--- | :--- |
| **Gagal Menjalankan `search_knowledge`** | Server Python `local_memory.py` belum berjalan. | Jalankan `python local_memory.py` di terminal terpisah. |
| **Respon AI Lambat** | Keterbatasan VRAM/RAM pada hardware lokal. | Gunakan model Ollama yang lebih kecil atau tingkatkan alokasi RAM. |
| **Teks Karakter Aneh (Emoji Crash)** | Terminal Windows tidak mendukung encoding UTF-8. | Gunakan terminal modern seperti **Windows Terminal** atau **VS Code Integrated Terminal**. |
| **AI Menolak Menyimpan Data** | Guardrails keamanan terhadap kata kunci sensitif. | Hindari menyimpan kata kunci seperti "password" atau "private key" secara gamblang. |

---
*Dibuat oleh Naufal untuk Project Jarvis AI.*