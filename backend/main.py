from pathlib import Path

from fastapi import FastAPI

from backend.api import health, meta

app = FastAPI(title="BIAI CRM")

app.include_router(meta.router)
app.include_router(health.router)

# Built frontend (cd frontend && npm run build). Low priority: /api routes match first.
app.frontend("/", directory=Path(__file__).parent / "static")
