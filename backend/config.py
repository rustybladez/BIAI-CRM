"""App settings read from the environment (.env is loaded for local runs)."""

import os
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DHAKA = ZoneInfo("Asia/Dhaka")
DEFAULT_DEMO_NOW = "2026-10-28T12:00"


def parse_local(value: str) -> datetime:
    """Parse 'YYYY-MM-DDTHH:MM' (or 'YYYY-MM-DD HH:MM') as Asia/Dhaka time."""
    dt = datetime.fromisoformat(value.strip().replace(" ", "T"))
    return dt.replace(tzinfo=DHAKA) if dt.tzinfo is None else dt.astimezone(DHAKA)


_demo_now = parse_local(os.getenv("DEMO_NOW") or DEFAULT_DEMO_NOW)


def demo_now() -> datetime:
    """The 'current time' used by all overdue / 48h logic."""
    return _demo_now


def set_demo_now(value: datetime) -> None:
    global _demo_now
    _demo_now = value.astimezone(DHAKA)
