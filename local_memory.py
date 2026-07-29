import numpy as np
from sentence_transformers import SentenceTransformer
from turbovec import TurboQuantIndex
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import pickle
import os

# Konfigurasi
MODEL_NAME = "all-MiniLM-L6-v2" # Dimensi: 384
INDEX_FILE = "vector_index.pkl"
METADATA_FILE = "text_metadata.pkl"

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
        embeddings = self.model.encode(texts).astype(np.float32)
        
        # 2. Masukkan ke TurboQuantIndex
        self.index.add(embeddings)
        
        # 3. Simpan teks asli ke metadata
        self.documents.extend(texts)
        self.save_state()
        return len(texts)

    def search(self, query: str, k: int = 3):
        if not self.documents:
            return []

        # 1. Ubah query menjadi embedding
        query_vec = self.model.encode([query]).astype(np.float32)
        
        # 2. Cari index paling mirip
        scores, indices = self.index.search(query_vec, k=k)
        
        # 3. Ambil teks berdasarkan index yang ditemukan
        results = []
        for idx in indices[0]:
            if 0 <= idx < len(self.documents):
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
                embeddings = self.model.encode(loaded_docs).astype(np.float32)
                self.index.add(embeddings)
                self.documents = loaded_docs

# --- API Setup ---
app = FastAPI(title="Jarvis Local Memory Service")
memory = LocalMemory()

class DocumentRequest(BaseModel):
    texts: List[str]

class SearchRequest(BaseModel):
    query: str
    k: Optional[int] = 3

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
        # Fix: Ensure k is int
        search_k = req.k if req.k is not None else 3
        results = memory.search(req.query, k=search_k)
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print("\n🚀 Local Memory Service berjalan di http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)