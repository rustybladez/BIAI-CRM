from fastapi import APIRouter
from pydantic import BaseModel, field_validator

from backend.config import demo_now, initial_demo_now, parse_local, set_demo_now
from backend.db import SessionDep
from backend.seed.seed import reset

router = APIRouter(prefix="/api/demo", tags=["demo"])


class ResetResult(BaseModel):
    enquiries: int


@router.post("/reset")
def reset_demo(session: SessionDep) -> ResetResult:
    """Wipe the DB, reload the 20 sample enquiries with their pre-generated AI results,
    and put the demo clock back to DEMO_NOW."""
    set_demo_now(initial_demo_now())
    return ResetResult(enquiries=reset(session))


class DemoClock(BaseModel):
    demo_now: str  # Dhaka time 'YYYY-MM-DDTHH:MM'

    @field_validator("demo_now")
    @classmethod
    def _valid_time(cls, v: str) -> str:
        return parse_local(v).strftime("%Y-%m-%dT%H:%M")  # raises ValueError -> 422


@router.put("/clock")
def set_clock(clock: DemoClock) -> DemoClock:
    """Set the demo clock that drives overdue / 48h logic (in memory; resets to DEMO_NOW on restart)."""
    set_demo_now(parse_local(clock.demo_now))
    return DemoClock(demo_now=demo_now().strftime("%Y-%m-%dT%H:%M"))
