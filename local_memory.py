import numpy as np
from sentence_transformers import SentenceTransformer
from turbovec import TurboQuantIndex
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import pickle
import os
import re

# Konfigurasi
MODEL_NAME = "all-MiniLM-L6-v2" # Dimensi: 384
INDEX_FILE = "vector_index.pkl"
METADATA_FILE = "text_metadata.pkl"

# Ekstensi file kode yang didukung untuk ingest directory
CODE_EXTENSIONS = {'.py', '.java', '.php', '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml', '.yml', '.md', '.txt', '.sh', '.bat', '.sql', '.rb', '.go', '.rs', '.cpp', '.c', '.h', '.hpp'}


class LocalMemory:
    def __init__(self):
        print(f"Memuat model embedding {MODEL_NAME}...")
        self.model = SentenceTransformer(MODEL_NAME)
        self.dim = self.model.get_sentence_embedding_dimension()
        
        # Inisialisasi TurboQuantIndex dengan kompresi 2-bit
        print(f"Inisialisasi TurboQuantIndex (dim={self.dim}, bit_width=2)...")
        self.index = TurboQuantIndex(dim=self.dim, bit_width=2)
        
        # Metadata untuk menyimpan teks asli
        self.documents = []
        self.load_state()

    def add_documents(self, texts: List[str]):
        if not texts:
            return 0
        
        # 1. Ubah teks menjadi embedding (float32)
        embeddings = np.array(self.model.encode(texts)).astype(np.float32)
        
        # 2. Masukkan ke TurboQuantIndex
        self.index.add(embeddings)
        
        # 3. Simpan teks asli ke metadata
        self.documents.extend(texts)
        self.save_state()
        return len(texts)

    def search(self, query: str, k: int = 3, threshold: float = 0.5):
        if not self.documents:
            return []

        query_vec = np.array(self.model.encode([query])).astype(np.float32)
        scores, indices = self.index.search(query_vec, k=k)
        
        results = []
        for score, idx in zip(scores[0], indices[0]):
            # Hanya ambil dokumen jika skor kemiripannya di atas threshold
            if score >= threshold and 0 <= idx < len(self.documents):
                results.append(self.documents[idx])
        
        return results

    def save_state(self):
        # Simpan dokumen ke metadata file
        with open(METADATA_FILE, "wb") as f:
            pickle.dump(self.documents, f)
        print("State memori disimpan.")

    def load_state(self):
        if os.path.exists(METADATA_FILE):
            with open(METADATA_FILE, "rb") as f:
                loaded_docs = pickle.load(f)
            
            if loaded_docs:
                print(f"Memulihkan {len(loaded_docs)} dokumen ke dalam indeks...")
                # Re-indeks tanpa menambahkan ke self.documents secara redundan
                embeddings = np.array(self.model.encode(loaded_docs)).astype(np.float32)
                self.index.add(embeddings)
                self.documents = loaded_docs

    def _process_single_file(self, file_path: str):
        """
        Baca satu file dan lakukan semantic chunking.
        Mengembalikan list chunk (string) atau list kosong jika gagal.
        """
        ext = os.path.splitext(file_path)[1].lower()
        
        # Lewati file dengan ekstensi yang tidak didukung
        if ext not in CODE_EXTENSIONS:
            return None, "skipped_extension"
        
        try:
            # Baca file, force encoding UTF-8 dan abaikan karakter error
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception as e:
            print(f"  ⚠️ Skipping {file_path} karena error: {e}")
            return None, "read_error"
        
        # Lewati file kosong
        if not content.strip():
            return None, "empty"
        
        # Lakukan semantic chunking
        chunks = self._chunk_code(content, file_path)
        return chunks, "ok"

    def _chunk_code(self, content: str, file_path: str) -> List[str]:
        """
        Improved Semantic Chunking untuk kode sumber.
        Mengelompokkan baris ke dalam blok berukuran ~50-100 baris / ~500-1000 karakter,
        dengan tetap menghormati baris kosong ganda sebagai pemisah natural.
        Setiap chunk diawali dengan header 'File: ...' untuk konteks.
        """
        header = f"File: {file_path}\n\n"
        lines = content.split('\n')
        chunks = []
        
        # Kelompokkan baris menjadi blok-blok yang dipisahkan oleh baris kosong ganda
        blocks = []
        current_block = []
        
        for line in lines:
            # Jika menemukan baris kosong dan current_block sudah cukup panjang
            if line.strip() == '' and current_block:
                # Cek apakah kita sudah mengumpulkan cukup baris untuk dipotong
                block_text = '\n'.join(current_block)
                if len(block_text) >= 500 or len(current_block) >= 50:
                    blocks.append('\n'.join(current_block))
                    current_block = []
                else:
                    # Belum cukup, simpan baris kosong sebagai pemisah ringan
                    current_block.append('')
            else:
                current_block.append(line)
        
        # Jangan lupa sisa block terakhir
        if current_block:
            blocks.append('\n'.join(current_block))
        
        # Jika tidak ada pemisah alami, buat blok berdasarkan ukuran
        if len(blocks) <= 1 and len(blocks[0]) > 1000 if blocks else False:
            blocks = []
            for i in range(0, len(lines), 50):
                block = '\n'.join(lines[i:i+50])
                blocks.append(block)
        
        # Proses setiap blok menjadi chunk final
        for block in blocks:
            block = block.strip()
            if not block or len(block) < 30:
                continue
            
            # Jika blok masih terlalu panjang, potong lagi
            if len(block) > 2000:
                # Cari baris kosong di dalam blok untuk dipotong
                sub_lines = block.split('\n')
                sub_blocks = []
                sub_current = []
                for sl in sub_lines:
                    if sl.strip() == '' and sub_current:
                        sub_text = '\n'.join(sub_current)
                        if len(sub_text) >= 500:
                            sub_blocks.append('\n'.join(sub_current))
                            sub_current = []
                        else:
                            sub_current.append('')
                    else:
                        sub_current.append(sl)
                if sub_current:
                    sub_blocks.append('\n'.join(sub_current))
                
                for sb in sub_blocks:
                    sb = sb.strip()
                    if len(sb) >= 30:
                        chunks.append(header + sb[:2000])
            else:
                chunks.append(header + block)
        
        # Fallback: jika tidak ada chunk sama sekali, simpan seluruh file sebagai 1 chunk
        if not chunks:
            chunks.append(header + content[:2000])
        
        return chunks

    def ingest_path(self, path: str) -> dict:
        """
        Menerima path file ATAU direktori.
        - Jika path adalah file: proses file tunggal.
        - Jika path adalah direktori: proses secara rekursif.
        Mengembalikan statistik proses ingest.
        """
        if not os.path.exists(path):
            raise FileNotFoundError(f"Path '{path}' tidak ditemukan.")
        
        all_chunks = []
        file_count = 0
        skipped_files = 0
        error_files = 0
        
        # Kumpulkan semua file yang akan diproses
        files_to_process = []
        
        if os.path.isfile(path):
            # Path adalah file tunggal
            files_to_process.append(path)
            print(f"\nMemproses file tunggal: {path}")
        else:
            # Path adalah direktori
            print(f"\nMemindai direktori: {path}")
            for root, dirs, files in os.walk(path):
                # Lewati folder tersembunyi dan node_modules, vendor, .venv, __pycache__
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in (
                    'node_modules', 'vendor', '.venv', '__pycache__', 'venv', 'env', 
                    'dist', 'build', '.git'
                )]
                
                for file_name in files:
                    files_to_process.append(os.path.join(root, file_name))
        
        # Proses semua file
        for file_path in files_to_process:
            result, status = self._process_single_file(file_path)
            
            if status == "ok" and result:
                all_chunks.extend(result)
                file_count += 1
            elif status == "skipped_extension":
                skipped_files += 1
            elif status == "empty":
                skipped_files += 1
            elif status == "read_error":
                error_files += 1
            
            if file_count > 0 and file_count % 10 == 0:
                print(f"  Diproses: {file_count} file, {len(all_chunks)} chunks...")
        
        if not all_chunks:
            return {
                "status": "warning",
                "message": f"Tidak ada konten yang dapat diindeks. File diproses: {file_count}, dilewati: {skipped_files}, error: {error_files}.",
                "files_processed": file_count,
                "files_skipped": skipped_files,
                "files_error": error_files,
                "chunks_indexed": 0
            }
        
        # Indeks semua chunk ke TurboQuantIndex
        added_count = self.add_documents(all_chunks)
        
        print(f"\n✅ Selesai: {file_count} file diproses, {added_count} chunks diindeks.")
        
        return {
            "status": "success",
            "message": f"Berhasil mengindeks {added_count} chunks dari {file_count} file.",
            "files_processed": file_count,
            "files_skipped": skipped_files,
            "files_error": error_files,
            "chunks_indexed": added_count
        }


# --- API Setup ---
app = FastAPI(title="Jarvis Local Memory Service")
memory = LocalMemory()


class DocumentRequest(BaseModel):
    texts: List[str]


class SearchRequest(BaseModel):
    query: str
    k: Optional[int] = 3


class DirectoryRequest(BaseModel):
    directory_path: str


@app.post("/index")
async def index_docs(req: DocumentRequest):
    try:
        count = memory.add_documents(req.texts)
        return {"status": "success", "added": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search")
async def search_docs(req: SearchRequest):
    try:
        search_k = req.k if req.k is not None else 3
        results = memory.search(req.query, k=search_k)
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest_directory")
async def ingest_directory_endpoint(req: DirectoryRequest):
    try:
        result = memory.ingest_path(req.directory_path)
        return result
    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    print("\nLocal Memory Service berjalan di http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)