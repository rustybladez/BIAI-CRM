from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import DATA_DIR

router = APIRouter(prefix="/api", tags=["health"])

BOOT_FILE = DATA_DIR / "boot_count.txt"
STARTED_AT = datetime.now(UTC)


def record_boot() -> int:
    """Count app starts in a file next to the SQLite DB: if it keeps growing across
    redeploys, the filesystem (and so the DB) survives them."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    count = int(BOOT_FILE.read_text()) + 1 if BOOT_FILE.exists() else 1
    BOOT_FILE.write_text(str(count))
    return count


BOOT_COUNT = record_boot()


class Health(BaseModel):
    ok: bool
    started_at: datetime
    boot_count: int
    data_dir: str


@router.get("/health")
def get_health() -> Health:
    return Health(ok=True, started_at=STARTED_AT, boot_count=BOOT_COUNT, data_dir=str(DATA_DIR))
