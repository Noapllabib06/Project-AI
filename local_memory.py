import numpy as np
from sentence_transformers import SentenceTransformer
from turbovec import IdMapIndex
from rank_bm25 import BM25Okapi
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import pickle
import os
import re

# Konfigurasi
MODEL_NAME = "all-MiniLM-L6-v2" # Dimensi: 384
INDEX_FILE = "vector_index.bin"
METADATA_FILE = "text_metadata.pkl"

# Ekstensi file kode yang didukung untuk ingest directory
CODE_EXTENSIONS = {'.py', '.java', '.php', '.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml', '.yml', '.md', '.txt', '.sh', '.bat', '.sql', '.rb', '.go', '.rs', '.cpp', '.c', '.h', '.hpp'}

class LocalMemory:
    def __init__(self):
        print(f"Memuat model embedding {MODEL_NAME}...")
        self.model = SentenceTransformer(MODEL_NAME)
        # Menggunakan get_embedding_dimension agar tidak muncul warning future deprecation
        self.dim = self.model.get_embedding_dimension() 
        
        # Inisialisasi IdMapIndex (sesuai instruksi untuk memori persisten)
        print(f"Inisialisasi IdMapIndex (dim={self.dim})...")
        self.index = IdMapIndex(dim=self.dim)
        
        # Metadata untuk menyimpan teks asli
        self.documents = []
        self.bm25 = None
        self.load_state()

    def _tokenize(self, text: str) -> List[str]:
        # Simple word tokenization untuk BM25
        return re.findall(r'\w+', text.lower())

    def _update_bm25(self):
        if self.documents:
            tokenized_corpus = [self._tokenize(doc) for doc in self.documents]
            self.bm25 = BM25Okapi(tokenized_corpus)
        else:
            self.bm25 = None

    def add_documents(self, texts: List[str]):
        if not texts:
            return 0
        
        start_id = len(self.documents)
        
        # 1. Ubah teks menjadi embedding (float32)
        embeddings = np.array(self.model.encode(texts)).astype(np.float32)
        
        # 2. Masukkan ke IdMapIndex dengan ID terurut
        # (Beberapa library index mengharuskan add_with_ids jika tipenya IdMap)
        try:
            ids = np.arange(start_id, start_id + len(texts), dtype=np.uint64)
            self.index.add_with_ids(embeddings, ids)
        except AttributeError:
            # Fallback jika library hanya support add()
            self.index.add(embeddings)
        
        # 3. Simpan teks asli ke metadata dan update BM25
        self.documents.extend(texts)
        self._update_bm25()
        
        self.save_state()
        return len(texts)

    def search(self, query: str, k: int = 3, threshold: float = 0.5):
        if not self.documents:
            return []

        # ==========================================
        # HYBRID SEARCH (Vector Search + Keyword BM25)
        # ==========================================
        
        # 1. Vector Search
        query_vec = np.array(self.model.encode([query])).astype(np.float32)
        vec_scores, vec_indices = self.index.search(query_vec, k=k*2)
        
        # 2. BM25 Search
        bm25_scores = []
        if self.bm25:
            tokenized_query = self._tokenize(query)
            bm25_scores = self.bm25.get_scores(tokenized_query)

        # 3. Reciprocal Rank Fusion (RRF)
        rrf_scores = {}
        K_RRF = 60 # Konstanta penghalus RRF
        
        # Ranking dari Vector
        for rank, (score, idx) in enumerate(zip(vec_scores[0], vec_indices[0])):
            if idx != -1: # Hapus threshold check agar lebih robust
                rrf_scores[idx] = rrf_scores.get(idx, 0) + (1.0 / (K_RRF + rank + 1))
                
        # Ranking dari BM25 (ambil top k*2 index yang score-nya > 0)
        if self.bm25:
            bm25_sorted_idx = np.argsort(bm25_scores)[::-1][:k*2]
            for rank, idx in enumerate(bm25_sorted_idx):
                if bm25_scores[idx] > 0:
                    rrf_scores[idx] = rrf_scores.get(idx, 0) + (1.0 / (K_RRF + rank + 1))
                    
        # Sortir hasil RRF
        sorted_rrf = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)
        
        # Kumpulkan Top K Documents
        results = []
        for idx, score in sorted_rrf[:k]:
            if 0 <= idx < len(self.documents):
                results.append(self.documents[idx])
        
        return results

    def save_state(self):
        try:
            # Menyimpan index vektor ke binary file
            self.index.save(INDEX_FILE)
            # Menyimpan dokumen metadata ke pickle
            with open(METADATA_FILE, "wb") as f:
                pickle.dump(self.documents, f)
            print("State memori (Index & Metadata) disimpan.")
        except Exception as e:
            print(f"Gagal menyimpan state: {e}")

    def load_state(self):
        # HANYA MEMUAT DARI DISK, TANPA RE-EMBEDDING. Sangat penting untuk efisiensi!
        if os.path.exists(INDEX_FILE) and os.path.exists(METADATA_FILE):
            print("Memuat index dan metadata dari disk (tanpa re-embedding)...")
            try:
                self.index.load(INDEX_FILE)
                with open(METADATA_FILE, "rb") as f:
                    self.documents = pickle.load(f)
                
                # Update BM25 corpus
                self._update_bm25()
                print(f"Berhasil memuat {len(self.documents)} dokumen ke memori.")
            except Exception as e:
                print(f"Gagal memuat state: {e}")
        else:
            print("Tidak ada memori lama ditemukan, membuat yang baru.")

    def _process_single_file(self, file_path: str):
        ext = os.path.splitext(file_path)[1].lower()
        if ext not in CODE_EXTENSIONS:
            return None, "skipped_extension"
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception as e:
            print(f"  ⚠️ Skipping {file_path} karena error: {e}")
            return None, "read_error"
        
        if not content.strip():
            return None, "empty"
        
        chunks = self._chunk_code(content, file_path)
        return chunks, "ok"

    def _chunk_code(self, content: str, file_path: str) -> List[str]:
        header = f"File: {file_path}\n\n"
        lines = content.split('\n')
        chunks = []
        blocks = []
        current_block = []
        
        for line in lines:
            if line.strip() == '' and current_block:
                block_text = '\n'.join(current_block)
                if len(block_text) >= 500 or len(current_block) >= 50:
                    blocks.append('\n'.join(current_block))
                    current_block = []
                else:
                    current_block.append('')
            else:
                current_block.append(line)
        
        if current_block:
            blocks.append('\n'.join(current_block))
        
        if len(blocks) <= 1 and len(blocks[0]) > 1000 if blocks else False:
            blocks = []
            for i in range(0, len(lines), 50):
                block = '\n'.join(lines[i:i+50])
                blocks.append(block)
        
        for block in blocks:
            block = block.strip()
            if not block or len(block) < 30:
                continue
            
            if len(block) > 2000:
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
        
        if not chunks:
            chunks.append(header + content[:2000])
        
        return chunks

    def ingest_path(self, path: str) -> dict:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Path '{path}' tidak ditemukan.")
        
        all_chunks = []
        file_count = 0
        skipped_files = 0
        error_files = 0
        files_to_process = []
        
        if os.path.isfile(path):
            files_to_process.append(path)
            print(f"\nMemproses file tunggal: {path}")
        else:
            print(f"\nMemindai direktori: {path}")
            for root, dirs, files in os.walk(path):
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in (
                    'node_modules', 'vendor', '.venv', '__pycache__', 'venv', 'env', 
                    'dist', 'build', '.git'
                )]
                for file_name in files:
                    files_to_process.append(os.path.join(root, file_name))
        
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