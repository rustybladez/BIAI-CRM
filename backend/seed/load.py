"""Read the provided sample enquiries CSV."""

import csv
from pathlib import Path

from pydantic import BaseModel

CSV_PATH = Path(__file__).parent / "enquiries.csv"


class SeedRow(BaseModel):
    id: int
    channel: str
    received_at: str  # 'YYYY-MM-DD HH:MM', Asia/Dhaka
    sender_name: str
    phone: str | None
    message: str


def read_enquiries(path: Path = CSV_PATH) -> list[SeedRow]:
    # utf-8-sig strips the byte-order mark at the start of the file; headers contain spaces.
    with path.open(encoding="utf-8-sig", newline="") as f:
        return [
            SeedRow(
                id=int(row["id"]),
                channel=row["channel"].strip(),
                received_at=row["received at"].strip(),
                sender_name=row["sender name"].strip(),
                phone=row["phone"].strip() or None,
                message=row["message"].strip(),
            )
            for row in csv.DictReader(f)
        ]
