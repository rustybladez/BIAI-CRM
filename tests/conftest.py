import os

# Use a throwaway in-memory DB for every test run (set before backend.db is imported).
os.environ["DATABASE_URL"] = "sqlite://"

import pytest  # noqa: E402
from sqlmodel import Session, SQLModel  # noqa: E402

from backend.db import engine  # noqa: E402
from backend.seed.seed import seed  # noqa: E402


@pytest.fixture
def session():
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        yield s


@pytest.fixture
def seeded(session):
    seed(session)
    return session
