"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-06-15
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("external_id", sa.String(), nullable=True),
        sa.Column("company", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("location", sa.String(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column("jd_text", sa.Text(), nullable=True),
        sa.Column("match", sa.Integer(), nullable=True),
        sa.Column("tier", sa.String(), nullable=True),
        sa.Column("eligibility", sa.String(), nullable=True),
        sa.Column("verdict", sa.Text(), nullable=True),
        sa.Column("strengths", sa.Text(), nullable=True),
        sa.Column("gaps", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=True, server_default="new"),
        sa.Column("approved", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("added_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_jobs_id", "jobs", ["id"])
    op.create_index("ix_jobs_user_id", "jobs", ["user_id"])
    op.create_index("ix_jobs_source", "jobs", ["source"])
    op.create_index("ix_jobs_external_id", "jobs", ["external_id"])
    op.create_index("ix_jobs_company", "jobs", ["company"])
    op.create_index("ix_jobs_title", "jobs", ["title"])
    op.create_index("ix_jobs_status", "jobs", ["status"])

    op.create_table(
        "sources",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("query", sa.String(), nullable=True, server_default=""),
        sa.Column("enabled", sa.Boolean(), nullable=True, server_default="true"),
    )
    op.create_index("ix_sources_id", "sources", ["id"])
    op.create_index("ix_sources_user_id", "sources", ["user_id"])

    op.create_table(
        "config",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", sa.Text(), nullable=True, server_default=""),
    )

    op.create_table(
        "master_cvs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True, server_default="My CV"),
        sa.Column("content", sa.Text(), nullable=True, server_default=""),
        sa.Column("is_default", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_master_cvs_id", "master_cvs", ["id"])
    op.create_index("ix_master_cvs_user_id", "master_cvs", ["user_id"])

    op.create_table(
        "tailoring_profiles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True, server_default="Default"),
        sa.Column("options", sa.JSON(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=True, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_tailoring_profiles_id", "tailoring_profiles", ["id"])
    op.create_index("ix_tailoring_profiles_user_id", "tailoring_profiles", ["user_id"])

    op.create_table(
        "applications",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("cv_text", sa.Text(), nullable=True),
        sa.Column("email_draft", sa.Text(), nullable=True),
        sa.Column("cv_file_path", sa.String(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True, server_default=""),
    )
    op.create_index("ix_applications_id", "applications", ["id"])
    op.create_index("ix_applications_user_id", "applications", ["user_id"])
    op.create_index("ix_applications_job_id", "applications", ["job_id"])

    op.create_table(
        "seen_jobs",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("seen_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "applicant_profiles",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("first_name", sa.String(), nullable=True, server_default=""),
        sa.Column("last_name", sa.String(), nullable=True, server_default=""),
        sa.Column("email", sa.String(), nullable=True, server_default=""),
        sa.Column("phone", sa.String(), nullable=True, server_default=""),
        sa.Column("location", sa.String(), nullable=True, server_default=""),
        sa.Column("linkedin", sa.String(), nullable=True, server_default=""),
        sa.Column("github", sa.String(), nullable=True, server_default=""),
        sa.Column("portfolio", sa.String(), nullable=True, server_default=""),
        sa.Column("work_authorization", sa.String(), nullable=True, server_default=""),
        sa.Column("requires_sponsorship", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("extra_answers", sa.JSON(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )

    op.create_table(
        "apply_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("method", sa.String(), nullable=True, server_default=""),
        sa.Column("state", sa.String(), nullable=True, server_default=""),
        sa.Column("detail", sa.Text(), nullable=True, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_apply_attempts_id", "apply_attempts", ["id"])
    op.create_index("ix_apply_attempts_user_id", "apply_attempts", ["user_id"])
    op.create_index("ix_apply_attempts_job_id", "apply_attempts", ["job_id"])

    op.create_table(
        "runs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=True, server_default="manual"),
        sa.Column("phase", sa.String(), nullable=True, server_default="queued"),
        sa.Column("found", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("assessed", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("expired", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("digest_sent", sa.Integer(), nullable=True, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True, server_default=""),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_runs_id", "runs", ["id"])
    op.create_index("ix_runs_user_id", "runs", ["user_id"])
    op.create_index("ix_runs_started_at", "runs", ["started_at"])

    op.create_table(
        "input_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("job_id", sa.Integer(), nullable=True),
        sa.Column("type", sa.String(), nullable=True),
        sa.Column("prompt", sa.Text(), nullable=True, server_default=""),
        sa.Column("status", sa.String(), nullable=True, server_default="pending"),
        sa.Column("token", sa.String(), nullable=True, unique=True),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("answered_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_input_requests_id", "input_requests", ["id"])
    op.create_index("ix_input_requests_user_id", "input_requests", ["user_id"])
    op.create_index("ix_input_requests_job_id", "input_requests", ["job_id"])
    op.create_index("ix_input_requests_status", "input_requests", ["status"])
    op.create_index("ix_input_requests_token", "input_requests", ["token"], unique=True)


def downgrade() -> None:
    op.drop_table("input_requests")
    op.drop_table("runs")
    op.drop_table("apply_attempts")
    op.drop_table("applicant_profiles")
    op.drop_table("seen_jobs")
    op.drop_table("applications")
    op.drop_table("tailoring_profiles")
    op.drop_table("master_cvs")
    op.drop_table("config")
    op.drop_table("sources")
    op.drop_table("jobs")
    op.drop_table("users")
