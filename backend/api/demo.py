from fastapi import APIRouter
from pydantic import BaseModel

from backend.db import SessionDep
from backend.seed.seed import reset

router = APIRouter(prefix="/api/demo", tags=["demo"])


class ResetResult(BaseModel):
    enquiries: int


@router.post("/reset")
def reset_demo(session: SessionDep) -> ResetResult:
    """Wipe the DB and reload the 20 sample enquiries with their pre-generated AI results."""
    return ResetResult(enquiries=reset(session))
