from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Call Center RAG Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class QueryRequest(BaseModel):
    query: str
    org_id: str
    agent_id: str | None = None
    top_k: int = 5


class IngestRequest(BaseModel):
    source_id: str
    content: str
    language: str = "am"
    metadata: dict | None = None


class QueryResult(BaseModel):
    content: str
    similarity: float
    metadata: dict | None = None


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/query", response_model=list[QueryResult])
async def query_knowledge(req: QueryRequest):
    """Query the knowledge base using vector similarity search."""
    # TODO: embed query → pgvector similarity search → return results
    return []


@app.post("/ingest")
async def ingest_text(req: IngestRequest):
    """Ingest text content into the knowledge base."""
    # TODO: chunk text (Amharic-aware) → embed → store in pgvector
    return {"status": "processing", "source_id": req.source_id}


@app.post("/ingest/file")
async def ingest_file(
    source_id: str,
    language: str = "am",
    file: UploadFile = File(...),
):
    """Ingest a file (PDF, DOCX, TXT) into the knowledge base."""
    if file.content_type not in [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]:
        raise HTTPException(400, "Unsupported file type. Use PDF, DOCX, or TXT.")

    # TODO: parse file → chunk → embed → store
    return {"status": "processing", "source_id": source_id, "filename": file.filename}


@app.delete("/source/{source_id}")
async def delete_source(source_id: str):
    """Delete all chunks for a knowledge source."""
    # TODO: delete from pgvector where source_id matches
    return {"status": "deleted", "source_id": source_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api:app", host="0.0.0.0", port=4003, reload=True)
