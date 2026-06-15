"""
Job discovery: fetches listings from all configured sources.
Each fetcher returns a list of dicts with keys:
  source, id, title, company, location, url, description
"""

import html as _html
import logging
import re
import time
from typing import Optional
import feedparser
import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

HEADERS = {"User-Agent": "Jobpls/1.0 job-pipeline"}
TIMEOUT = 12

# COUNTRY_BLOCKLIST support. Boards often emit city-only locations ("Pune",
# "Bengaluru East, Karnataka") so each banned country also matches the city and
# state names that commonly appear in postings from there.
COUNTRY_ALIASES: dict[str, list[str]] = {
    "india": [
        "mumbai", "bengaluru", "bangalore", "delhi", "new delhi", "hyderabad",
        "chennai", "pune", "noida", "gurgaon", "gurugram", "kolkata",
        "ahmedabad", "jaipur", "indore", "kochi", "chandigarh", "lucknow",
        "coimbatore", "nagpur", "karnataka", "maharashtra", "tamil nadu",
        "telangana", "kerala", "gujarat", "rajasthan", "west bengal",
        "uttar pradesh", "haryana",
    ],
    "pakistan": ["karachi", "lahore", "islamabad", "rawalpindi", "faisalabad"],
    "bangladesh": ["dhaka", "chittagong"],
    "philippines": ["manila", "cebu", "makati", "taguig", "quezon city"],
    "china": ["beijing", "shanghai", "shenzhen", "guangzhou", "hangzhou", "chengdu"],
    "brazil": [
        "sao paulo", "são paulo", "rio de janeiro", "belo horizonte",
        "curitiba", "porto alegre", "brasilia", "brasília",
    ],
    "nigeria": ["lagos", "abuja"],
    "egypt": ["cairo", "giza", "alexandria"],
    "indonesia": ["jakarta", "bandung", "surabaya"],
    "vietnam": ["hanoi", "ho chi minh", "saigon", "da nang"],
    "turkey": ["istanbul", "ankara", "izmir", "türkiye", "turkiye"],
    "united states": ["usa", "u.s.", "united states of america"],
    "usa": ["united states", "u.s.", "united states of america"],
    "united kingdom": ["uk", "england", "scotland", "wales", "london"],
    "uk": ["united kingdom", "england", "scotland", "wales", "london"],
}


def banned_location_matcher(blocklist_csv: str):
    """Compile COUNTRY_BLOCKLIST into a predicate over location strings, or None
    if the list is empty. Whole-word matching ("india" doesn't hit "Indiana")
    plus COUNTRY_ALIASES expansion."""
    terms = [t.strip().lower() for t in (blocklist_csv or "").split(",") if t.strip()]
    if not terms:
        return None
    expanded: set[str] = set()
    for t in terms:
        expanded.add(t)
        expanded.update(COUNTRY_ALIASES.get(t, []))
    pattern = re.compile(
        r"(?<!\w)(?:" + "|".join(re.escape(t) for t in sorted(expanded)) + r")(?!\w)"
    )
    return lambda location: bool(pattern.search((location or "").lower()))


# Closing block tags / <br> become newlines so paragraphs survive stripping.
_BLOCK_TAG = re.compile(r"</(?:p|div|li|ul|ol|h[1-6]|tr|table|section|article)>|<br\s*/?>", re.IGNORECASE)
_LI_OPEN = re.compile(r"<li[^>]*>", re.IGNORECASE)


def strip_html(s: str) -> str:
    """HTML → readable plain text. Some boards (Greenhouse) return the body
    HTML-escaped (&lt;div&gt;), so unescape BEFORE stripping tags — and again
    after, for entities that lived inside the markup (&amp;nbsp;). List items
    keep a "• " marker so the UI can render them as real bullets."""
    s = _html.unescape(str(s))
    s = _LI_OPEN.sub("\n• ", s)
    s = _BLOCK_TAG.sub("\n", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = _html.unescape(s).replace("\xa0", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r" ?\n ?", "\n", s)
    s = re.sub(r"\n+(?=• )", "\n", s)  # keep bullet runs tight
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def fetch_remotive(query: str = "") -> list[dict]:
    url = "https://remotive.com/api/remote-jobs"
    if query:
        url += f"?search={requests.utils.quote(query)}"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
        return [
            {
                "source": "remotive",
                "id": str(j["id"]),
                "title": j.get("title", ""),
                "company": j.get("company_name", ""),
                "location": j.get("candidate_required_location", "Remote"),
                "url": j.get("url", ""),
                "description": strip_html(j.get("description", "")),
            }
            for j in jobs
        ]
    except Exception as e:
        log.warning("remotive fetch failed: %s", e)
        return []


def fetch_remoteok() -> list[dict]:
    try:
        r = requests.get("https://remoteok.com/api", timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        arr = r.json()
        return [
            {
                "source": "remoteok",
                "id": str(j.get("id") or j.get("slug", "")),
                "title": j.get("position", ""),
                "company": j.get("company", ""),
                "location": j.get("location", "Remote"),
                "url": j.get("url", ""),
                "description": strip_html(j.get("description", "")),
            }
            for j in arr
            if isinstance(j, dict) and j.get("position")
        ]
    except Exception as e:
        log.warning("remoteok fetch failed: %s", e)
        return []


def fetch_greenhouse(slug: str) -> list[dict]:
    if not slug:
        return []
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
        return [
            {
                "source": f"greenhouse:{slug}",
                "id": str(j["id"]),
                "title": j.get("title", ""),
                "company": slug,
                "location": (j.get("location") or {}).get("name", ""),
                "url": j.get("absolute_url", ""),
                "description": strip_html(j.get("content", "")),
            }
            for j in jobs
        ]
    except Exception as e:
        log.warning("greenhouse:%s fetch failed: %s", slug, e)
        return []


def fetch_lever(slug: str) -> list[dict]:
    if not slug:
        return []
    url = f"https://api.lever.co/v0/postings/{slug}?mode=json"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        arr = r.json()
        return [
            {
                "source": f"lever:{slug}",
                "id": str(j["id"]),
                "title": j.get("text", ""),
                "company": slug,
                "location": (j.get("categories") or {}).get("location", ""),
                "url": j.get("hostedUrl", ""),
                "description": strip_html(j.get("descriptionPlain") or j.get("description", "")),
            }
            for j in (arr or [])
        ]
    except Exception as e:
        log.warning("lever:%s fetch failed: %s", slug, e)
        return []


def fetch_ashby(slug: str) -> list[dict]:
    if not slug:
        return []
    url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}?includeCompensation=false"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        jobs = r.json().get("jobs", [])
        return [
            {
                "source": f"ashby:{slug}",
                "id": str(j["id"]),
                "title": j.get("title", ""),
                "company": slug,
                "location": j.get("locationName") or j.get("location", ""),
                "url": j.get("jobUrl") or j.get("applyUrl", ""),
                "description": strip_html(j.get("descriptionHtml") or j.get("descriptionPlain", "")),
            }
            for j in jobs
        ]
    except Exception as e:
        log.warning("ashby:%s fetch failed: %s", slug, e)
        return []


def fetch_weworkremotely(query: str = "") -> list[dict]:
    """We Work Remotely RSS feed."""
    url = "https://weworkremotely.com/remote-jobs.rss"
    try:
        feed = feedparser.parse(url)
        results = []
        for entry in feed.entries:
            title = entry.get("title", "")
            # WWR titles format: "Company: Role Title"
            company = ""
            if ": " in title:
                company, title = title.split(": ", 1)
            results.append(
                {
                    "source": "wwr",
                    "id": entry.get("id") or entry.get("link", ""),
                    "title": title.strip(),
                    "company": company.strip(),
                    "location": "Remote",
                    "url": entry.get("link", ""),
                    "description": strip_html(entry.get("summary", "")),
                }
            )
        return results
    except Exception as e:
        log.warning("wwr fetch failed: %s", e)
        return []


def fetch_workingnomads() -> list[dict]:
    """Working Nomads public JSON API."""
    url = "https://www.workingnomads.com/api/exposed_jobs/"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        jobs = r.json()
        return [
            {
                "source": "workingnomads",
                "id": str(j.get("id", "")),
                "title": j.get("title", ""),
                "company": j.get("company_name", ""),
                "location": j.get("region", "Remote"),
                "url": j.get("url", ""),
                "description": strip_html(j.get("description", "")),
            }
            for j in (jobs if isinstance(jobs, list) else [])
        ]
    except Exception as e:
        log.warning("workingnomads fetch failed: %s", e)
        return []


def fetch_kariyer(query: str = "") -> list[dict]:
    """Kariyer.net — scrape remote/hybrid listings from Turkey's biggest job board."""
    search = query or "remote uzaktan"
    url = f"https://www.kariyer.net/is-ilanlari?q={requests.utils.quote(search)}&workingtype=remote"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={**HEADERS, "Accept-Language": "tr-TR,tr;q=0.9"})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        results = []
        for card in soup.select("div.list-items-container article, .job-list-wrapper .job-advert"):
            title_el = card.select_one("h2 a, .job-title a")
            company_el = card.select_one(".company-name, .firm-name")
            loc_el = card.select_one(".city, .location")
            link_el = card.select_one("a[href]")
            if not title_el:
                continue
            href = link_el["href"] if link_el else ""
            full_url = href if href.startswith("http") else f"https://www.kariyer.net{href}"
            results.append(
                {
                    "source": "kariyer",
                    "id": href.strip("/").split("/")[-1] or href,
                    "title": title_el.get_text(strip=True),
                    "company": company_el.get_text(strip=True) if company_el else "",
                    "location": loc_el.get_text(strip=True) if loc_el else "Türkiye",
                    "url": full_url,
                    "description": "",
                }
            )
        return results
    except Exception as e:
        log.warning("kariyer fetch failed: %s", e)
        return []


def fetch_linkedin(query: str = "", location: str = "") -> list[dict]:
    """LinkedIn's public guest job-search endpoint (no login). Best-effort: LinkedIn
    rate-limits/blocks this, so it may return nothing — that's expected, not a crash.
    Query may be 'keywords' or 'keywords | location' to override the default location."""
    keywords, loc = query, location
    if "|" in query:
        keywords, loc = [p.strip() for p in query.split("|", 1)]
    if not keywords:
        return []
    url = (
        "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search"
        f"?keywords={requests.utils.quote(keywords)}&location={requests.utils.quote(loc or 'Worldwide')}&start=0"
    )
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={**HEADERS, "Accept": "text/html"})
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "lxml")
        results = []
        for card in soup.select("li"):
            title_el = card.select_one("h3.base-search-card__title")
            company_el = card.select_one("h4.base-search-card__subtitle")
            loc_el = card.select_one("span.job-search-card__location")
            link_el = card.select_one("a.base-card__full-link") or card.select_one("a[href]")
            if not title_el or not link_el:
                continue
            href = (link_el.get("href") or "").split("?")[0]
            jid = href.rstrip("/").split("-")[-1] if href else href
            results.append({
                "source": "linkedin",
                "id": jid or href,
                "title": title_el.get_text(strip=True),
                "company": company_el.get_text(strip=True) if company_el else "",
                "location": loc_el.get_text(strip=True) if loc_el else (loc or "Remote"),
                "url": href,
                "description": "",
            })
        return results
    except Exception as e:
        log.warning("linkedin fetch failed (expected if rate-limited): %s", e)
        return []


def fetch_arbeitnow(query: str = "") -> list[dict]:
    """Arbeitnow public job board API (no key, remote-friendly)."""
    try:
        r = requests.get("https://www.arbeitnow.com/api/job-board-api", timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        jobs = r.json().get("data", [])
        return [
            {
                "source": "arbeitnow",
                "id": str(j.get("slug", "")),
                "title": j.get("title", ""),
                "company": j.get("company_name", ""),
                "location": j.get("location", "Remote"),
                "url": j.get("url", ""),
                "description": strip_html(j.get("description", "")),
            }
            for j in jobs
        ]
    except Exception as e:
        log.warning("arbeitnow fetch failed: %s", e)
        return []


def fetch_themuse(query: str = "") -> list[dict]:
    """The Muse public jobs API (no key)."""
    url = "https://www.themuse.com/api/public/jobs?page=1"
    if query:
        url += f"&category={requests.utils.quote(query)}"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        results = []
        for j in r.json().get("results", []):
            locs = ", ".join(loc.get("name", "") for loc in (j.get("locations") or []))
            results.append({
                "source": "themuse",
                "id": str(j.get("id", "")),
                "title": j.get("name", ""),
                "company": (j.get("company") or {}).get("name", ""),
                "location": locs or "Remote",
                "url": (j.get("refs") or {}).get("landing_page", ""),
                "description": strip_html(j.get("contents", "")),
            })
        return results
    except Exception as e:
        log.warning("themuse fetch failed: %s", e)
        return []


def fetch_adzuna(query: str = "", secrets: dict | None = None) -> list[dict]:
    """Adzuna aggregator (free key: app_id + app_key). Surfaces many boards incl.
    employer sites. Country defaults to 'gb'; set ADZUNA_COUNTRY to change."""
    secrets = secrets or {}
    app_id, app_key = secrets.get("adzuna_app_id", ""), secrets.get("adzuna_app_key", "")
    if not (app_id and app_key):
        return []
    country = (secrets.get("adzuna_country") or "gb").lower()
    what = query or secrets.get("location_keywords", "")
    url = (
        f"https://api.adzuna.com/v1/api/jobs/{country}/search/1"
        f"?app_id={app_id}&app_key={app_key}&results_per_page=50&content-type=application/json"
    )
    if what:
        url += f"&what={requests.utils.quote(what)}"
    if secrets.get("location"):
        url += f"&where={requests.utils.quote(secrets['location'])}"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        r.raise_for_status()
        return [
            {
                "source": "adzuna",
                "id": str(j.get("id", "")),
                "title": j.get("title", ""),
                "company": (j.get("company") or {}).get("display_name", ""),
                "location": (j.get("location") or {}).get("display_name", ""),
                "url": j.get("redirect_url", ""),
                "description": strip_html(j.get("description", "")),
            }
            for j in r.json().get("results", [])
        ]
    except Exception as e:
        log.warning("adzuna fetch failed: %s", e)
        return []


def fetch_jsearch(query: str = "", secrets: dict | None = None) -> list[dict]:
    """JSearch via RapidAPI — aggregates Google for Jobs, so results come from
    LinkedIn, Indeed, Glassdoor, ZipRecruiter, etc. Needs a RapidAPI key. This is
    the reliable, ToS-clean way to reach those big boards."""
    secrets = secrets or {}
    key = secrets.get("jsearch_key", "")
    if not (key and query):
        return []
    where = secrets.get("location", "")
    q = f"{query} in {where}" if where else query
    url = f"https://jsearch.p.rapidapi.com/search?query={requests.utils.quote(q)}&page=1&num_pages=1"
    try:
        r = requests.get(url, timeout=TIMEOUT, headers={
            "X-RapidAPI-Key": key, "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
        })
        r.raise_for_status()
        results = []
        for j in r.json().get("data", []):
            city = ", ".join(filter(None, [j.get("job_city"), j.get("job_country")]))
            publisher = j.get("job_publisher", "")
            results.append({
                "source": f"jsearch:{publisher.lower()}" if publisher else "jsearch",
                "id": str(j.get("job_id", "")),
                "title": j.get("job_title", ""),
                "company": j.get("employer_name", ""),
                "location": city or ("Remote" if j.get("job_is_remote") else ""),
                "url": j.get("job_apply_link", ""),
                "description": strip_html(j.get("job_description", "")),
            })
        return results
    except Exception as e:
        log.warning("jsearch fetch failed: %s", e)
        return []


def fetch_yenibiris(query: str = "") -> list[dict]:
    """Yenibiris.com RSS feed."""
    q = query or "remote"
    url = f"https://www.yenibiris.com/job-search/rss?q={requests.utils.quote(q)}"
    try:
        feed = feedparser.parse(url)
        return [
            {
                "source": "yenibiris",
                "id": entry.get("id") or entry.get("link", ""),
                "title": entry.get("title", ""),
                "company": entry.get("author", ""),
                "location": "Türkiye",
                "url": entry.get("link", ""),
                "description": strip_html(entry.get("summary", "")),
            }
            for entry in feed.entries
        ]
    except Exception as e:
        log.warning("yenibiris fetch failed: %s", e)
        return []


# Every fetcher takes (query, secrets) so keyed/located sources get what they need.
FETCHER_MAP = {
    "remotive": lambda q, s: fetch_remotive(q),
    "remoteok": lambda q, s: fetch_remoteok(),
    "greenhouse": lambda q, s: fetch_greenhouse(q),
    "lever": lambda q, s: fetch_lever(q),
    "ashby": lambda q, s: fetch_ashby(q),
    "wwr": lambda q, s: fetch_weworkremotely(q),
    "workingnomads": lambda q, s: fetch_workingnomads(),
    "kariyer": lambda q, s: fetch_kariyer(q),
    "yenibiris": lambda q, s: fetch_yenibiris(q),
    "linkedin": lambda q, s: fetch_linkedin(q, (s or {}).get("location", "")),
    "arbeitnow": lambda q, s: fetch_arbeitnow(q),
    "themuse": lambda q, s: fetch_themuse(q),
    "adzuna": lambda q, s: fetch_adzuna(q, s),
    "jsearch": lambda q, s: fetch_jsearch(q, s),
}


def run_discovery(
    sources: list[dict],
    keywords: list[str],
    seen_keys: set[str],
    secrets: dict | None = None,
) -> tuple[list[dict], list[str]]:
    """
    Runs all enabled sources, deduplicates against seen_keys, and filters by title
    keywords. `secrets` carries API keys + a default location for keyed sources.
    Returns (new_jobs, new_seen_keys).
    """
    secrets = secrets or {}
    new_jobs = []
    new_keys = []

    for src in sources:
        if not src.get("enabled"):
            continue
        src_type = src.get("type", "")
        query = src.get("query", "")
        fetcher = FETCHER_MAP.get(src_type)
        if not fetcher:
            log.warning("Unknown source type: %s", src_type)
            continue
        try:
            jobs = fetcher(query, secrets)
        except Exception as e:
            log.error("Fetcher %s/%s crashed: %s", src_type, query, e)
            continue

        for j in jobs:
            key = f"{j['source']}|{j['id']}"
            if key in seen_keys:
                continue
            if not _title_matches(j.get("title", ""), keywords):
                continue
            seen_keys.add(key)
            new_keys.append(key)
            new_jobs.append(j)

        time.sleep(0.2)

    return new_jobs, new_keys


def _title_matches(title: str, keywords: list[str]) -> bool:
    if not keywords:
        return True
    t = title.lower()
    return any(kw in t for kw in keywords)
