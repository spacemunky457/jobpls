"""Auto-apply: actually submit applications on the user's behalf.

Reality check that shapes this package: there is NO keyless ATS submission API —
Greenhouse/Lever/Ashby all require the *company's* secret API key to POST an
application, which an applicant doesn't have. So the only generic way to apply
is to drive the real web form in a browser (Playwright), plus email-apply when a
posting lists an address. Browser automation is inherently local (a hosted
backend can't drive the user's browser and would be IP-blocked), so auto-apply
runs on the user's machine — same shape as browser-Ollama.
"""
