import uuid
from datetime import datetime
from sqlalchemy import JSON, Boolean, Column, DateTime, Integer, String, Text
from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    # UUID string so it matches a Supabase Auth `sub` once we switch providers.
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String, nullable=True)  # null for Supabase-issued identities
    created_at = Column(DateTime, default=datetime.utcnow)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    source = Column(String, index=True)
    external_id = Column(String, index=True)
    company = Column(String, index=True)
    title = Column(String, index=True)
    location = Column(String)
    url = Column(String)
    jd_text = Column(Text)
    # Candidate-match assessment (how well the user's CV fits this role):
    match = Column(Integer, nullable=True)      # 0-100 match strength
    tier = Column(String, nullable=True)        # strong | possible | stretch | skip
    eligibility = Column(String, nullable=True)
    verdict = Column(Text, nullable=True)       # one-sentence fit summary
    strengths = Column(Text, nullable=True)     # comma-joined: what the candidate brings
    gaps = Column(Text, nullable=True)          # comma-joined: what's missing/weak
    status = Column(String, default="new", index=True)  # new|assessed|drafted|applied|error
    approved = Column(Boolean, default=False)
    added_at = Column(DateTime, default=datetime.utcnow)


class Source(Base):
    __tablename__ = "sources"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    type = Column(String)    # remotive|remoteok|greenhouse|lever|ashby|kariyer|yenibiris|wwr|workingnomads
    query = Column(String, default="")
    enabled = Column(Boolean, default=True)


class Config(Base):
    __tablename__ = "config"

    # Per-user key/value: composite primary key.
    user_id = Column(String, primary_key=True)
    key = Column(String, primary_key=True)
    value = Column(Text, default="")


class MasterCV(Base):
    __tablename__ = "master_cvs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    name = Column(String, default="My CV")
    content = Column(Text, default="")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TailoringProfile(Base):
    __tablename__ = "tailoring_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    name = Column(String, default="Default")
    # {tone, length, emphasis, extra_instructions}
    options = Column(JSON, default=dict)
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class Application(Base):
    __tablename__ = "applications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    job_id = Column(Integer, index=True)
    cv_text = Column(Text)
    email_draft = Column(Text)
    cv_file_path = Column(String, nullable=True)
    applied_at = Column(DateTime, default=datetime.utcnow)
    notes = Column(Text, default="")


class SeenJob(Base):
    __tablename__ = "seen_jobs"

    # Dedup is per-user: composite primary key.
    user_id = Column(String, primary_key=True)
    key = Column(String, primary_key=True)
    seen_at = Column(DateTime, default=datetime.utcnow)


class ApplicantProfile(Base):
    """The applicant's real details, required to actually submit applications
    (ATS forms + the browser bot all need these). One row per user."""
    __tablename__ = "applicant_profiles"

    user_id = Column(String, primary_key=True)
    first_name = Column(String, default="")
    last_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    location = Column(String, default="")          # "Istanbul, Turkey"
    linkedin = Column(String, default="")
    github = Column(String, default="")
    portfolio = Column(String, default="")
    work_authorization = Column(String, default="")  # free text shown to forms
    requires_sponsorship = Column(Boolean, default=True)
    # Default answers for common custom questions (key→answer), best-effort.
    extra_answers = Column(JSON, default=dict)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ApplyAttempt(Base):
    """Audit log of every auto-apply attempt (one job can have several tries)."""
    __tablename__ = "apply_attempts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    job_id = Column(Integer, index=True)
    method = Column(String, default="")   # greenhouse_api | lever_api | email | browser | manual
    state = Column(String, default="")    # submitted | failed | skipped
    detail = Column(Text, default="")     # confirmation id or error message
    created_at = Column(DateTime, default=datetime.utcnow)


class InputRequest(Base):
    __tablename__ = "input_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    job_id = Column(Integer, nullable=True, index=True)
    type = Column(String)            # add_info | tailor_cv | approve
    prompt = Column(Text, default="")
    status = Column(String, default="pending", index=True)  # pending | answered | expired
    token = Column(String, unique=True, index=True, default=_uuid)
    response = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    answered_at = Column(DateTime, nullable=True)
