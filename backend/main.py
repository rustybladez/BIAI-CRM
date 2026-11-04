from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from sqlmodel import Session

from backend.api import contacts, demo, followups, health, intake, meta, replies, summary
from backend.db import create_tables, engine
from backend.seed.seed import seed_if_empty


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # The filesystem is wiped on every redeploy (see NOTE.md), so reseed whenever the DB is empty.
    create_tables()
    with Session(engine) as session:
        seed_if_empty(session)
    yield


app = FastAPI(title="BIAI CRM", lifespan=lifespan)

app.include_router(meta.router)
app.include_router(health.router)
app.include_router(demo.router)
app.include_router(contacts.router)
app.include_router(intake.router)
app.include_router(followups.router)
app.include_router(replies.router)
app.include_router(summary.router)

# Built frontend (cd frontend && npm run build). Low priority: /api routes match first.
app.frontend("/", directory=Path(__file__).parent / "static")
