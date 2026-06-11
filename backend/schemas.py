from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, EmailStr


# --- Auth ---
class SignupRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Jobs ---
class JobOut(BaseModel):
    id: int
    source: str
    company: str
    title: str
    location: str
    url: str
    jd_text: Optional[str] = None
    match: Optional[int]
    tier: Optional[str]
    eligibility: Optional[str]
    verdict: Optional[str]
    strengths: Optional[str]
    gaps: Optional[str]
    status: str
    approved: bool
    added_at: datetime

    class Config:
        from_attributes = True


class JobApprove(BaseModel):
    approved: bool


class JobBatchApprove(BaseModel):
    ids: list[int]
    approved: bool


class JobStatusUpdate(BaseModel):
    status: str


# --- Sources ---
class SourceOut(BaseModel):
    id: int
    type: str
    query: str
    enabled: bool

    class Config:
        from_attributes = True


class SourceCreate(BaseModel):
    type: str
    query: str = ""
    enabled: bool = True


class SourceUpdate(BaseModel):
    type: Optional[str] = None
    query: Optional[str] = None
    enabled: Optional[bool] = None


# --- Config ---
class ConfigUpdate(BaseModel):
    updates: dict[str, str]


# --- Master CV ---
class MasterCVOut(BaseModel):
    id: int
    name: str
    content: str
    is_default: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class MasterCVCreate(BaseModel):
    name: str = "My CV"
    content: str = ""


class MasterCVUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None


# --- Tailoring profiles ---
class TailoringProfileOut(BaseModel):
    id: int
    name: str
    options: dict[str, Any]
    is_default: bool

    class Config:
        from_attributes = True


class TailoringProfileCreate(BaseModel):
    name: str = "Default"
    options: dict[str, Any] = {}


class TailoringProfileUpdate(BaseModel):
    name: Optional[str] = None
    options: Optional[dict[str, Any]] = None


# --- Applications ---
class ApplicationOut(BaseModel):
    id: int
    job_id: int
    cv_text: str
    email_draft: str
    applied_at: datetime
    notes: str

    class Config:
        from_attributes = True


class ApplicationUpdate(BaseModel):
    cv_text: Optional[str] = None
    email_draft: Optional[str] = None
    notes: Optional[str] = None


# --- Applicant profile + auto-apply ---
class ApplicantProfileOut(BaseModel):
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    linkedin: str = ""
    github: str = ""
    portfolio: str = ""
    work_authorization: str = ""
    requires_sponsorship: bool = True
    extra_answers: dict[str, Any] = {}

    class Config:
        from_attributes = True


class ApplicantProfileUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    location: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    portfolio: Optional[str] = None
    work_authorization: Optional[str] = None
    requires_sponsorship: Optional[bool] = None
    extra_answers: Optional[dict[str, Any]] = None


class ApplyResult(BaseModel):
    job_id: int
    method: str            # greenhouse_form | lever_form | ashby_form | generic_form | email | manual
    state: str             # submitted | failed | skipped
    detail: str = ""
    trace: list[str] = []  # step-by-step log of what the bot did


class ApplyBatchResult(BaseModel):
    submitted: int = 0
    failed: int = 0
    skipped: int = 0
    results: list[ApplyResult] = []


# --- Automation runs ---
class RunOut(BaseModel):
    id: int
    kind: str
    phase: str
    found: int
    assessed: int
    expired: int
    digest_sent: int
    error: str
    started_at: datetime
    finished_at: Optional[datetime]

    class Config:
        from_attributes = True


# --- Pipeline / browser-driven AI ---
class PipelineResult(BaseModel):
    success: bool
    message: str
    count: int = 0


class PreparedTask(BaseModel):
    job_id: int
    prompt: str


class ResultsBatch(BaseModel):
    results: list[dict[str, Any]]


# --- Input requests (magic-link human-in-the-loop) ---
class InputRequestOut(BaseModel):
    id: int
    job_id: Optional[int]
    type: str
    prompt: str
    status: str
    token: str
    created_at: datetime

    class Config:
        from_attributes = True


class PublicRequestOut(BaseModel):
    type: str
    prompt: str
    status: str
    job_title: Optional[str] = None
    job_company: Optional[str] = None


class RespondRequest(BaseModel):
    response: str
