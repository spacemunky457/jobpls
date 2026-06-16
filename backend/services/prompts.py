"""Prompt construction + response parsing, shared by every AI path:
server-side providers (Claude / self-hosted Ollama) AND the browser-driven Ollama
endpoints that hand the prompt to the user's local model and ingest the raw reply.
Keeping it here means the scoring/tailoring logic is defined exactly once."""

import json
import re
from typing import Any, Optional


def parse_json_loose(text: str) -> Optional[dict]:
    if not text:
        return None
    t = str(text).strip()
    t = re.sub(r"^```(json)?", "", t, flags=re.IGNORECASE).rstrip("`").strip()
    a, b = t.find("{"), t.rfind("}")
    if a < 0 or b < 0:
        return None
    try:
        return json.loads(t[a : b + 1])
    except Exception:
        return None


# --- Candidate match (prompt v3: target priorities + 'perfect' tier on top of the v2 rubric) ---
def build_match_prompt(
    profile: str, cv_text: str, preferences: str, eligible_types: str, job: dict,
    priorities: str = "",
) -> str:
    return (
        "You are an experienced technical recruiter assessing how strong a CANDIDATE is for a job, "
        "based on their CV and profile. Judge the candidate's competitiveness for THIS specific role — "
        "skills, experience, and seniority overlap with the requirements. Be calibrated, not generous: "
        "most jobs are NOT a strong match for any given candidate. Output ONLY valid JSON with these keys:\n"
        "  match (0-100 integer: how well the candidate's CV matches this role's requirements),\n"
        "  tier (one of: perfect, strong, possible, stretch, skip),\n"
        "  eligibility (one of: global, emea, contractor, us-only, needs-right-to-work, unclear),\n"
        "  verdict (one sentence on the candidate's fit for this role),\n"
        "  strengths (array of short phrases: what the candidate brings that fits this role),\n"
        "  gaps (array of short phrases: requirements the candidate is missing or weak on).\n\n"
        "TIER CALIBRATION RUBRIC:\n"
        "  perfect = everything 'strong' requires AND the role squarely hits the candidate's TARGET\n"
        "            PRIORITIES below (or, if none are given, a ~95% requirements fit). This is rare —\n"
        "            the job reads like it was written for this candidate.\n"
        "  strong  = meets ~80%+ of the must-have requirements at the right seniority; would likely\n"
        "            get an interview. Reserve this for genuinely competitive applications.\n"
        "  possible = meets most core requirements with 1-2 real gaps; a sensible application.\n"
        "  stretch = some relevant or transferable overlap but missing several key requirements, a\n"
        "            seniority mismatch, OR a career-adjacent pivot where the candidate's foundational\n"
        "            and transferable skills (technical background, industry exposure, adjacent function)\n"
        "            credibly apply even without direct title-matching experience. When genuinely torn\n"
        "            between stretch and skip, choose stretch.\n"
        "  skip    = a fundamentally unrelated field with essentially no transferable overlap (e.g. a\n"
        "            nursing or civil-engineering role for a software candidate), or under ~15%\n"
        "            requirement overlap. Do NOT skip a role merely because the candidate lacks the\n"
        "            exact job-title experience if their transferable skills make them a plausible pivot.\n\n"
        + (
            "CANDIDATE TARGET PRIORITIES — the niches this candidate is specifically hunting for. "
            "A role matching one or more of these AND the candidate's qualifications should be tiered "
            "perfect; never raise the tier of a role the candidate isn't competitive for:\n"
            + priorities + "\n\n"
            if priorities.strip() else ""
        )
        + "EVIDENCE RULE: every item in strengths must be backed by something concrete in the CV or "
        "profile (cite it briefly, e.g. \"5y test automation — QA lead role\"). Never invent or "
        "embellish experience. If the CV doesn't show it, it belongs in gaps, not strengths.\n\n"
        "ELIGIBILITY RULES — candidate is based in TURKEY with no EU/US work rights:\n"
        "  global = accepts anyone worldwide; emea = EMEA-wide remote; contractor = contractor/EOR/B2B ok;\n"
        "  us-only = US/North America only; needs-right-to-work = requires existing right to work;\n"
        "  unclear = not specified. Look for location restrictions anywhere in the posting (benefits,\n"
        "  legal boilerplate, timezone requirements), not just the location field.\n"
        f"For reference, the candidate's accepted work-eligibility types are: {eligible_types or 'global,emea,contractor'}\n"
        "Classify the eligibility type accurately so the candidate knows the work-rights situation, but "
        "do NOT lower the tier for eligibility — tier the candidate on skills/experience overlap ALONE. "
        "The candidate decides for themselves whether to pursue a role needing relocation or sponsorship.\n\n"
        "CANDIDATE PROFILE:\n" + (profile or "(none)") + "\n\n"
        + ("CANDIDATE CV:\n" + cv_text[:3000] + "\n\n" if cv_text else "")
        + ("CANDIDATE PREFERENCES / NUANCES:\n" + preferences + "\n\n" if preferences else "")
        + "JOB:\n"
        + f"Title: {job.get('title', '')}\n"
        + f"Company: {job.get('company', '')}\n"
        + f"Location: {job.get('location', '')}\n"
        + f"Description:\n{str(job.get('jd_text', ''))[:4000]}"
    )


def parse_match(text: str) -> dict:
    return parse_json_loose(text) or {}


# --- Tailoring ---
def _options_line(options: dict[str, Any]) -> str:
    options = options or {}
    parts = []
    if options.get("tone"):
        parts.append(f"Tone: {options['tone']}.")
    if options.get("length"):
        parts.append(f"Length: {options['length']}.")
    if options.get("emphasis"):
        parts.append(f"Emphasize: {options['emphasis']}.")
    if options.get("extra_instructions"):
        parts.append(str(options["extra_instructions"]))
    return " ".join(parts)


def build_tailor_prompt(
    profile: str,
    cv_text: str,
    job: dict,
    options: Optional[dict[str, Any]] = None,
    extra_info: str = "",
) -> str:
    base = cv_text if cv_text and len(cv_text) > 100 else profile
    opt_line = _options_line(options or {})
    return (
        "Tailor a concise ATS-friendly CV for the job below, using ONLY facts from the candidate material "
        "(never invent employers, tools, dates, or numbers — if the CV provides a metric, keep it; "
        "if it doesn't, don't fabricate one). Mirror the job description's key terms where truthful, "
        "and lead each role's bullets with the experience most relevant to THIS job. "
        "Then write a short cover email (max 130 words) that names one specific reason this candidate "
        "fits this role — no generic enthusiasm. "
        + (opt_line + " " if opt_line else "")
        + "\nATS FORMATTING RULES: plain text only — no tables, columns, emojis, or special symbols. "
        "Use standard section headers (Summary, Experience, Skills, Education). "
        "Separate sections with a real blank line. "
        "Keep each skill/tool list comma-separated on one line (not one item per line). "
        "Do NOT output literal backslash-n; use actual line breaks inside the JSON string values.\n"
        + "Return ONLY valid JSON: {\"cv\": \"plain text CV\", \"email\": \"plain text email\"}.\n\n"
        "CANDIDATE MATERIAL:\n" + (base or "(none)") + "\n\n"
        + ("ADDITIONAL INFO FROM CANDIDATE (use this, it was provided specifically for this role):\n" + extra_info + "\n\n" if extra_info else "")
        + "JOB:\n"
        + f"Title: {job.get('title', '')}\n"
        + f"Company: {job.get('company', '')}\n"
        + f"Description:\n{str(job.get('jd_text', ''))[:5000]}"
    )


def parse_tailor(text: str) -> dict:
    return parse_json_loose(text) or {}
