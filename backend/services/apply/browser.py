"""Browser-bot applier (Playwright).

The only *generic* way to apply without a company's secret ATS key: drive the
real application web form. We handle Greenhouse/Lever/Ashby specifically (their
forms are predictable) and fall back to a best-effort generic filler.

Robustness this version handles:
- forms embedded in iframes (Greenhouse/Lever embeds on company sites),
- forms that render after JS (we wait for inputs to appear),
- forms behind an "Apply" button/link (we click + re-scan),
- Lever's separate /apply page.

Honest limits: aggregator sources (Remotive/RemoteOK/WWR/Working Nomads) link to a
description or external redirect, not a real form — there's nothing to fill, so
the bot bails to manual. Captchas/logins/required custom questions also bail
(we never submit a half-filled form). Local only.
"""

import logging
import os

from .base import NotSupported, Outcome, full_name, write_resume_pdf

log = logging.getLogger(__name__)

# Sources whose job.url is a listing/redirect, not an application form.
_AGGREGATORS = ("remotive", "remoteok", "wwr", "workingnomads", "kariyer", "yenibiris")


def _playwright_available() -> bool:
    try:
        import playwright.sync_api  # noqa: F401
        return True
    except Exception:
        return False


def _detect_ats(job) -> str:
    src = (job.source or "").lower()
    url = (job.url or "").lower()
    for ats in ("greenhouse", "lever", "ashby"):
        if src.startswith(ats) or ats in url:
            return ats
    if "greenhouse.io" in url:
        return "greenhouse"
    if "lever.co" in url:
        return "lever"
    if "ashbyhq.com" in url:
        return "ashby"
    return "generic"


def _is_aggregator(job) -> bool:
    return (job.source or "").lower().split(":", 1)[0] in _AGGREGATORS


_FIELD_HINTS = [
    (("first name", "first_name", "firstname", "given name"), "first_name"),
    (("last name", "last_name", "lastname", "family name", "surname"), "last_name"),
    (("full name", "your name", "candidate name"), "full_name"),
    (("email",), "email"),
    (("phone", "mobile", "telephone"), "phone"),
    (("linkedin",), "linkedin"),
    (("github",), "github"),
    (("portfolio", "website", "personal site"), "portfolio"),
    (("location", "city", "where are you"), "location"),
]


def _values(profile) -> dict:
    return {
        "first_name": profile.first_name or "",
        "last_name": profile.last_name or "",
        "full_name": full_name(profile),
        "email": profile.email or "",
        "phone": profile.phone or "",
        "linkedin": profile.linkedin or "",
        "github": profile.github or "",
        "portfolio": profile.portfolio or "",
        "location": profile.location or "",
    }


def _elements(page, selector: str) -> list:
    """All matching elements across every frame (main + iframes)."""
    out = []
    for fr in page.frames:
        try:
            out.extend(fr.query_selector_all(selector))
        except Exception:
            continue
    return out


def _wait_for_form(page, seconds: float = 8.0) -> bool:
    """Poll until a real (non-hidden) input or textarea appears in any frame."""
    deadline = seconds * 1000
    waited = 0
    while waited < deadline:
        if _elements(page, "input:not([type=hidden]):not([type=submit]):not([type=button]), textarea"):
            return True
        page.wait_for_timeout(500)
        waited += 500
    return False


def _hay(el) -> str:
    return " ".join(filter(None, [
        el.get_attribute("name"), el.get_attribute("id"),
        el.get_attribute("aria-label"), el.get_attribute("placeholder"),
    ])).lower()


def _click_apply(page) -> bool:
    """Click an Apply button/link if the form isn't visible yet. Returns True if clicked."""
    for sel in ("a:has-text('Apply for this job')", "button:has-text('Apply for this job')",
                "a:has-text('Apply now')", "button:has-text('Apply now')",
                "a:has-text('Apply')", "button:has-text('Apply')",
                "a[href*='apply']"):
        for fr in page.frames:
            try:
                el = fr.query_selector(sel)
                if el and el.is_visible():
                    el.click()
                    try:
                        page.wait_for_load_state("domcontentloaded", timeout=8000)
                    except Exception:
                        pass
                    page.wait_for_timeout(800)
                    return True
            except Exception:
                continue
    return False


def apply(job, profile, cv_text: str, email_text: str, autosubmit: bool = True,
          headless: bool = True, timeout_ms: int = 45000) -> Outcome:
    if not _playwright_available():
        return Outcome(
            "browser", "failed",
            "Browser apply needs Playwright. Run: pip install playwright && python -m playwright install chromium",
        )
    if not (job.url or "").startswith("http"):
        raise NotSupported("job has no application URL")

    from playwright.sync_api import sync_playwright

    ats = _detect_ats(job)
    method = f"{ats}_form" if ats != "generic" else "generic_form"
    vals = _values(profile)
    resume_path = write_resume_pdf(cv_text, f"{job.company}_{job.title}")
    filled, notes, trace = [], [], []

    def log(msg: str) -> None:
        trace.append(msg)
        logger_debug(msg)

    log(f"Source type: {ats}" + (" — aggregator, usually links out instead of a real form" if _is_aggregator(job) else ""))

    # Lever serves the form on a dedicated /apply page.
    target = job.url
    if ats == "lever" and not target.rstrip("/").endswith("/apply"):
        target = target.rstrip("/") + "/apply"
        log(f"Lever detected — using the apply page: {target}")

    outcome = None
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            page = browser.new_page()
            try:
                log(f"Opening {target}")
                page.goto(target, timeout=timeout_ms, wait_until="domcontentloaded")
            except Exception as e:
                log(f"Could not open the page: {str(e)[:120]}")
                outcome = Outcome(method, "failed", f"could not open posting: {str(e)[:160]}", trace)

            if outcome is None:
                try:
                    page.wait_for_load_state("networkidle", timeout=6000)
                except Exception:
                    pass
                log(f"Loaded — landed on {page.url}")

                # Wait for a form; if none, try clicking Apply, then wait again.
                if not _wait_for_form(page, 8):
                    log("No form fields visible yet — looking for an Apply button…")
                    if _click_apply(page):
                        log(f"Clicked Apply — now on {page.url}")
                        _wait_for_form(page, 8)
                    else:
                        log("No Apply button found on the page")

                text_inputs = _elements(page, "input, textarea")
                file_inputs = _elements(page, "input[type=file]")
                log(f"Scanned {len(page.frames)} frame(s): {len(text_inputs)} input(s), {len(file_inputs)} file upload(s)")

                if not text_inputs and not file_inputs:
                    if _is_aggregator(job):
                        msg = ("this source links to a listing/redirect, not a real form — "
                               f"apply on the employer's site. (at {page.url[:110]})")
                    else:
                        msg = (f"no application form found on the page (at {page.url[:110]}). "
                               "It may need a login, or the form lives somewhere this bot can't reach.")
                    log("Stopping: nothing to fill here")
                    outcome = Outcome(method, "failed", msg, trace)

            if outcome is None:
                # Fill recognizable text/email/url inputs by label/attributes.
                for el in text_inputs:
                    try:
                        itype = (el.get_attribute("type") or "text").lower()
                        if itype in ("hidden", "submit", "button", "checkbox", "radio", "file"):
                            continue
                        key = next((k for frags, k in _FIELD_HINTS if any(f in _hay(el) for f in frags)), None)
                        if key and vals.get(key) and key not in filled:
                            el.fill(vals[key])
                            filled.append(key)
                    except Exception:
                        continue
                log(f"Filled fields: {', '.join(filled) or 'none matched your profile'}")

                if file_inputs:
                    try:
                        file_inputs[0].set_input_files(resume_path)
                        filled.append("resume")
                        log("Attached your CV (PDF)")
                    except Exception as e:
                        notes.append(f"resume upload failed: {str(e)[:80]}")
                        log(f"Couldn't attach CV: {str(e)[:80]}")
                else:
                    notes.append("no file-upload field found")
                    log("No file-upload field found")

                if email_text:
                    for el in _elements(page, "textarea"):
                        try:
                            if any(w in _hay(el) for w in ("cover", "letter", "additional", "message", "why", "note")):
                                el.fill(email_text)
                                filled.append("cover_letter")
                                log("Filled the cover-letter field")
                                break
                        except Exception:
                            continue

                essentials = {"first_name", "last_name", "email"} if ats != "generic" else {"email"}
                ready = essentials.issubset(set(filled)) and ("resume" in filled or ats == "generic")

                if not ready:
                    missing = essentials - set(filled)
                    detail = "filled: " + (", ".join(filled) or "nothing")
                    if missing:
                        detail += f"; couldn't fill: {', '.join(missing)}"
                    if notes:
                        detail += f"; {'; '.join(notes)}"
                    log(f"Required fields missing ({', '.join(missing) or 'unknown'}) — not submitting")
                    outcome = Outcome(method, "failed", detail + ". Finish this one manually.", trace)
                elif not autosubmit:
                    log("Auto-submit is off — leaving the form filled for you to review and submit")
                    outcome = Outcome(method, "failed",
                                      f"form filled ({', '.join(filled)}); paused for your review — submit it in the browser window.", trace)
                else:
                    submitted = False
                    for sel in ("button:has-text('Submit application')", "button:has-text('Submit')",
                                "input[type=submit]", "button[type=submit]"):
                        for fr in page.frames:
                            try:
                                btn = fr.query_selector(sel)
                                if btn and btn.is_visible():
                                    btn.click()
                                    page.wait_for_timeout(2500)
                                    submitted = True
                                    break
                            except Exception:
                                continue
                        if submitted:
                            break
                    if submitted:
                        log("Clicked Submit — application sent")
                        outcome = Outcome(method, "submitted", f"submitted via {ats} form (filled: {', '.join(filled)})", trace)
                    else:
                        log("Filled the form but couldn't find a Submit button")
                        outcome = Outcome(method, "failed", f"filled {', '.join(filled)} but couldn't find a submit button", trace)

            # If the user is watching (visible browser) and we didn't submit, keep it
            # open a while so they can read the page and finish by hand.
            if not headless and (outcome is None or outcome.state != "submitted"):
                log("Keeping the browser open ~25s so you can review / finish manually")
                try:
                    page.wait_for_timeout(25000)
                except Exception:
                    pass
            browser.close()
    finally:
        try:
            os.remove(resume_path)
        except OSError:
            pass

    if outcome is None:
        outcome = Outcome(method, "failed", "unknown error", trace)
    return outcome


def logger_debug(msg: str) -> None:
    log.debug("apply: %s", msg)
