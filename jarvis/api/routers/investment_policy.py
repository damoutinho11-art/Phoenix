"""Owner-authenticated long-term allocation preferences; no trading."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
import sqlite3
import os
from jarvis.data.investment_policy import get_policy, save_policy
from jarvis.domains.finance.investment_policy import apply_policy, policy_digest
from jarvis.domains.finance import engine

router=APIRouter()

class PolicyPayload(BaseModel):
    model_config=ConfigDict(extra='forbid',strict=True)
    version:Literal['core-satellite-v1']
    crypto_max_weight:float=Field(gt=0,lt=.5,allow_inf_nan=False)

@router.get('/investment-policy')
def read_policy():
    try:
        policy=get_policy()
    except (sqlite3.Error, ValueError, TypeError) as exc:
        raise HTTPException(status_code=503,detail='Owner investment policy is unavailable.') from exc
    return {'policy':policy,'policy_sha256':policy_digest(policy) if policy else None}

@router.put('/investment-policy')
def write_policy(payload:PolicyPayload):
    if os.getenv('PHOENIX_FINANCE_SELECTION_MODE', 'legacy').strip().lower() != 'contribution_v2':
        raise HTTPException(status_code=409,detail='Owner investment policy requires contribution_v2 selection mode.')
    try:
        constitution = engine.load_json(engine.DEFAULT_CONSTITUTION_PATH)
        constitution['investment_policy'] = payload.model_dump()
        engine.validate_constitution(apply_policy(constitution))
        policy=save_policy(payload.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=422,detail=str(exc)) from exc
    except (sqlite3.Error, OSError) as exc:
        raise HTTPException(status_code=503,detail='Owner investment policy could not be saved.') from exc
    return {'policy':policy,'policy_sha256':policy_digest(policy),'trades_executed':False}
