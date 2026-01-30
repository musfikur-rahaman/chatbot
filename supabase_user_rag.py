from __future__ import annotations
from dataclasses import dataclass
from typing import List, Dict, Any
from io import BytesIO

from pypdf import PdfReader
from sentence_transformers import SentenceTransformer


@dataclass
class Chunk:
  source: str
  page: int
  chunk_index: int
  content: str


class SupabaseUserPDFRAG:
  def __init__(self, supabase_client, embed_model_name="sentence-transformers/all-MiniLM-L6-v2"):
    self.sb = supabase_client
    self.embedder = SentenceTransformer(embed_model_name)

  def _extract_chunks(self, pdf_bytes: bytes, filename: str) -> List[Chunk]:
    reader = PdfReader(BytesIO(pdf_bytes))

    chunks: List[Chunk] = []
    chunk_size = 900
    overlap = 150

    for pi, page in enumerate(reader.pages):
      text = (page.extract_text() or "").strip()
      if not text:
        continue

      start = 0
      chunk_index = 0
      while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk_text = text[start:end].strip()
        if chunk_text:
          chunks.append(
            Chunk(source=filename, page=pi + 1, chunk_index=chunk_index, content=chunk_text)
          )
          chunk_index += 1
        start = end - overlap
        if start < 0:
          start = 0

    return chunks

  def index_pdfs_for_user(self, user_id: str, pdf_files) -> Dict[str, Any]:
    total_chunks = 0
    total_pages = 0
    doc_ids = []
    filenames = []

    for pdf in pdf_files:
      filename = getattr(pdf, "filename", "uploaded.pdf")
      filenames.append(filename)

      pdf_bytes = pdf.read()
      reader = PdfReader(BytesIO(pdf_bytes))
      total_pages += len(reader.pages)

      doc_resp = self.sb.table("pdf_documents").insert(
        {"user_id": user_id, "filename": filename}
      ).execute()
      document_id = doc_resp.data[0]["id"]
      doc_ids.append(document_id)

      chunks = self._extract_chunks(pdf_bytes, filename)
      if not chunks:
        continue

      # Slight retrieval boost
      texts = [f"{c.source} p.{c.page}\n{c.content}" for c in chunks]
      embeddings = self.embedder.encode(texts, show_progress_bar=False).tolist()

      rows = []
      for c, emb in zip(chunks, embeddings):
        rows.append({
          "user_id": user_id,
          "document_id": document_id,
          "source": c.source,
          "page": c.page,
          "chunk_index": c.chunk_index,
          "content": c.content,
          "embedding": emb
        })

      self.sb.table("pdf_chunks").insert(rows).execute()
      total_chunks += len(rows)

    if total_chunks == 0:
      return {"ok": False, "error": "No text extracted from PDFs (scanned PDFs need OCR)."}

    return {
      "ok": True,
      "pdf_count": len(doc_ids),
      "pages": total_pages,
      "chunks": total_chunks,
      "pdf_names": filenames
    }

  def retrieve_for_user(self, user_id: str, query: str, k: int = 8) -> Dict[str, Any]:
    q_emb = self.embedder.encode([query], show_progress_bar=False).tolist()[0]

    resp = self.sb.rpc(
      "match_pdf_chunks_user",
      {
        "p_user_id": user_id,
        "p_query_embedding": q_emb,
        "p_match_count": max(1, int(k)),
      },
    ).execute()

    hits = resp.data or []
    context_blocks = []
    sources = []

    for h in hits:
      context_blocks.append(f"[Source: {h['source']} | Page: {h['page']}]\n{h['content']}")
      sources.append({"source": h["source"], "page": h["page"], "document_id": h["document_id"]})

    return {"context": "\n\n---\n\n".join(context_blocks), "sources": sources}
