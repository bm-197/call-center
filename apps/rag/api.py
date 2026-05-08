"""
Call Center RAG service.

Responsibilities:
  POST /ingest        accept pre-chunked text + source metadata, embed, upsert into pgvector
  POST /query         embed a user query and return top-K matching chunks scoped to an org
  DELETE /source/{id} remove all chunks for a given knowledge source

Embeddings: intfloat/multilingual-e5-large (1024-D). Equally good for Amharic
and English. Chunking is done upstream in the API/web; this service only
embeds and stores.

Important model conventions:
  - Passages are prefixed with "passage: "
  - Queries are prefixed with "query: "
  - All embeddings are L2-normalised (so cosine and inner-product agree)
"""

from __future__ import annotations

import json
import os
import secrets
from contextlib import contextmanager
from typing import Iterator

import numpy as np
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from pgvector.psycopg2 import register_vector
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()

EMBEDDING_DIM = 1024
MODEL_NAME = "intfloat/multilingual-e5-large"
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required")


app = FastAPI(title="Call Center RAG Service", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)
    return _model


def embed_passages(texts: list[str]) -> np.ndarray:
    prefixed = [f"passage: {t}" for t in texts]
    return get_model().encode(
        prefixed,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )


def embed_query(text: str) -> np.ndarray:
    out = get_model().encode(
        [f"query: {text}"],
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )
    return out[0]


_pool: ThreadedConnectionPool | None = None


def get_pool() -> ThreadedConnectionPool:
    global _pool
    if _pool is None:
        _pool = ThreadedConnectionPool(1, 10, dsn=DATABASE_URL)
    return _pool


@contextmanager
def get_conn() -> Iterator[psycopg2.extensions.connection]:
    pool = get_pool()
    conn = pool.getconn()
    try:
        register_vector(conn)
        yield conn
    finally:
        pool.putconn(conn)


def new_id() -> str:
    """Generate a string id compatible with our String @id columns."""
    return secrets.token_urlsafe(16)



class ChunkData(BaseModel):
    text: str
    metadata: dict | None = None


class IngestRequest(BaseModel):
    source_id: str
    chunks: list[ChunkData] = Field(..., min_length=1)


class IngestResponse(BaseModel):
    status: str
    source_id: str
    chunks: int


class QueryRequest(BaseModel):
    query: str = Field(..., min_length=1)
    organization_id: str
    agent_id: str | None = None
    top_k: int = Field(default=5, ge=1, le=50)


class QueryResult(BaseModel):
    chunk_id: str
    source_id: str
    source_name: str
    content: str
    metadata: dict | None
    similarity: float



@app.get("/health")
async def health():
    return {"status": "ok", "model": MODEL_NAME, "dim": EMBEDDING_DIM}


@app.post("/ingest", response_model=IngestResponse)
async def ingest(req: IngestRequest):
    """
    Re-ingest a source: deletes any existing chunks for the source, embeds
    the new chunks, and inserts them. Idempotent.
    """
    texts = [c.text for c in req.chunks]
    embeddings = embed_passages(texts)
    if embeddings.shape[1] != EMBEDDING_DIM:
        raise HTTPException(500, f"Embedding dim mismatch: {embeddings.shape[1]}")

    with get_conn() as conn:
        with conn.cursor() as cur:
            # Verify source exists (avoid orphan inserts on bad source_id)
            cur.execute(
                'SELECT id FROM knowledge_source WHERE id = %s',
                (req.source_id,),
            )
            if cur.fetchone() is None:
                raise HTTPException(404, "Knowledge source not found")

            cur.execute(
                'DELETE FROM knowledge_chunk WHERE "sourceId" = %s',
                (req.source_id,),
            )

            for chunk, emb in zip(req.chunks, embeddings):
                cur.execute(
                    '''
                    INSERT INTO knowledge_chunk (id, "sourceId", content, metadata, embedding, "createdAt")
                    VALUES (%s, %s, %s, %s::jsonb, %s::halfvec, NOW())
                    ''',
                    (
                        new_id(),
                        req.source_id,
                        chunk.text,
                        json.dumps(chunk.metadata or {}),
                        emb.tolist(),
                    ),
                )

            cur.execute(
                '''
                UPDATE knowledge_source
                SET status = 'completed', "chunkCount" = %s, "updatedAt" = NOW()
                WHERE id = %s
                ''',
                (len(req.chunks), req.source_id),
            )
        conn.commit()

    return IngestResponse(
        status="completed",
        source_id=req.source_id,
        chunks=len(req.chunks),
    )


@app.post("/query", response_model=list[QueryResult])
async def query(req: QueryRequest):
    """
    Embed the query, return the top-K most similar chunks for the org.
    If agent_id is provided, restrict to chunks from sources that are either
    assigned to that agent OR org-wide (agentId IS NULL).
    """
    emb = embed_query(req.query)

    sql = '''
        SELECT kc.id,
               ks.id   AS source_id,
               ks.name AS source_name,
               kc.content,
               kc.metadata,
               1 - (kc.embedding <=> %s::halfvec) AS similarity
        FROM knowledge_chunk kc
        JOIN knowledge_source ks ON ks.id = kc."sourceId"
        WHERE ks."organizationId" = %s
          AND ks.status = 'completed'
          AND kc.embedding IS NOT NULL
    '''
    params: list = [emb.tolist(), req.organization_id]

    if req.agent_id is not None:
        sql += ' AND (ks."agentId" = %s OR ks."agentId" IS NULL)'
        params.append(req.agent_id)

    sql += ' ORDER BY kc.embedding <=> %s::halfvec LIMIT %s'
    params.extend([emb.tolist(), req.top_k])

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()

    return [
        QueryResult(
            chunk_id=r[0],
            source_id=r[1],
            source_name=r[2],
            content=r[3],
            metadata=r[4],
            similarity=float(r[5]),
        )
        for r in rows
    ]


@app.delete("/source/{source_id}")
async def delete_source(source_id: str):
    """Remove all chunks for a knowledge source. Idempotent."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                'DELETE FROM knowledge_chunk WHERE "sourceId" = %s',
                (source_id,),
            )
            deleted = cur.rowcount
        conn.commit()
    return {"status": "deleted", "source_id": source_id, "chunks_removed": deleted}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("api:app", host="0.0.0.0", port=4003, reload=True)
