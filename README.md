# 🤖 JARVIS AI Agent

**Proyek Eksperimental AI Pribadi (Desktop Assistant)**

Asisten AI pribadi yang berjalan **100% lokal** di komputer Anda menggunakan Ollama. Dibangun dengan arsitektur **Electron (Frontend)** dan **Node.js + Python FastAPI (Backend)**. JARVIS tidak sekadar bisa melakukan *chat*, melainkan ia memiliki memori seumur hidup, dapat meriset web, memutar video YouTube, hingga menganalisis gambar (multimodal) secara mandiri.

---

## ✨ Fitur & Kapabilitas Terkini (Sudah Berfungsi)

| Kategori | Fitur | Deskripsi |
|----------|-------|-----------|
| 🧠 **Inti AI** | **Chat Lokal** | Model Ollama (`qwen2.5:7b`) berjalan offline di komputer Anda. |
| 👁️ **Multimodal** | **Vision Analysis** | Lampirkan gambar (`.jpg`/`.png`), dan JARVIS akan mendeskripsikannya menggunakan model `llava:7b`. |
| 🛠️ **Agentic Tools**| **Dynamic Tool Routing** | JARVIS dapat menentukan kapan harus memakai tool, mencari informasi, atau hanya menjawab chat. Mendukung eksekusi tool secara paralel. |
| 🗂️ **Memori** | **Long-Term Facts** | JARVIS mengekstrak fakta personal Anda secara diam-diam dan mengingatnya selamanya (`facts.json`). |
| 📚 **RAG System** | **Vector Memory** | Memori berbasis FAISS (Python) + *Sentence Transformers* (`all-MiniLM-L6-v2`) untuk pencarian semantik dokumen. |
| 📉 **Efisiensi** | **Auto-Compaction** | Otomatis meringkas obrolan panjang di *background* agar konteks token tidak kepenuhan. |
| 🌐 **Internet** | **Browsing & Scraping**| Mencari dari Google/DuckDuckGo, membuka web, dan membaca isi laman web. |
| 🎬 **Multimedia** | **YouTube Control** | "Putar musik jazz", "tonton video tutorial" (Langsung memutar konten di jendela baru). |
| 🖥️ **Antarmuka** | **Cyberpunk UI** | Tampilan futuristik animasi kanvas dengan indikator status waktu nyata. |

---

## ⚠️ Limitasi Saat Ini

Walaupun berfitur lengkap, JARVIS merupakan proyek lokal dengan beberapa keterbatasan:
1. **Kebutuhan Hardware Berat**: Membutuhkan minimal RAM 16GB. Menjalankan model utama (`qwen2.5:7b`) ditambah model vision (`llava:7b`) akan sangat menguras daya komputasi jika tidak memiliki GPU diskrit.
2. **Ketergantungan Ekosistem Ganda**: JARVIS mengandalkan Node.js untuk logika *Agentic* dan Python (`.venv`) untuk *Vector Database* (FAISS). Keduanya harus berjalan paralel (`npm run dev`).
3. **Speech-to-Text Bermasalah**: Fitur perintah suara bawaan UI (*Web Speech API*) belum beroperasi maksimal di dalam *environment* Electron dan cenderung fluktuatif.
4. **Isolasi OS**: JARVIS saat ini difokuskan pada aktivitas Web dan RAG. Ia belum bisa mengontrol sistem operasi Anda (seperti membuka Microsoft Word, mengatur volume, atau membaca file di sembarang direktori komputer).

---

## 🔮 Rencana Pengembangan Mendatang (Roadmap)

- [ ] **Voice Output (Text-to-Speech):** Mengintegrasikan model TTS lokal (seperti XTTS atau Edge-TTS) agar JARVIS dapat membalas dengan suara asisten.
- [ ] **Native Document RAG (PDF/Docx):** Menambahkan fitur *drag-and-drop* dokumen PDF di UI agar JARVIS langsung membaca isi dokumen panjang tersebut.
- [ ] **OS Automation:** Menambahkan *tools* baru agar JARVIS mampu mengeksekusi aplikasi desktop lokal dan mengelola file komputer.
- [ ] **Penyempurnaan Modul Suara (STT):** Mengganti Web Speech API dengan model *Whisper* lokal murni agar pendengaran JARVIS jauh lebih akurat.

---

## 🚀 Instalasi & Persyaratan

- **Node.js** v18+ & **Python** 3.10+
- **Ollama** (https://ollama.ai)
- Model wajib ditarik (pull) terlebih dahulu:
  - `ollama pull qwen2.5:7b` (Otak utama)
  - `ollama pull llava:7b` (Mata vision)

**Langkah Eksekusi:**
```bash
# 1. Clone repository
git clone https://github.com/Noapllabib06/Project-AI.git
cd Project-AI

# 2. Setup Node dependencies
npm install

# 3. Setup Python dependencies (Opsional jika ingin fitur Vector RAG)
python -m venv .venv
.venv\Scripts\activate
pip install fastapi uvicorn sentence-transformers faiss-cpu

# 4. Jalankan Server Python & UI Electron secara bersamaan!
npm run dev
```

Baca **[GUIDE.md](GUIDE.md)** untuk panduan lebih terperinci mengenai keamanan dan arsitektur *prompt*.

---
Dibuat oleh **Noapllabib**  
📧 naufallabibasyidiq@student.telkomuniversity.ac.id
