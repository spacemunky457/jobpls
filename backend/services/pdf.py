"""Render a plain-text tailored CV into a clean A4 PDF.

We keep it dependency-light (fpdf2, core fonts) and portable — no bundled TTF —
by transliterating common non-Latin-1 characters (Turkish letters, smart quotes,
dashes) to ASCII so core fonts never choke. Headings are inferred from the text:
the first line is the name, ALL-CAPS short lines become section headers."""

from fpdf import FPDF
from fpdf.enums import XPos, YPos

_TRANSLIT = {
    "ş": "s", "Ş": "S", "ğ": "g", "Ğ": "G", "ı": "i", "İ": "I",
    "ç": "c", "Ç": "C", "ö": "o", "Ö": "O", "ü": "u", "Ü": "U",
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "…": "...", "•": "-",
    " ": " ", "·": "-", "‐": "-", "‑": "-",
}


def _latin1(s: str) -> str:
    for k, v in _TRANSLIT.items():
        s = s.replace(k, v)
    return s.encode("latin-1", "replace").decode("latin-1")


def _is_heading(line: str) -> bool:
    stripped = line.strip()
    if not (3 <= len(stripped) <= 48):
        return False
    letters = [c for c in stripped if c.isalpha()]
    return bool(letters) and stripped.upper() == stripped


def cv_text_to_pdf(text: str) -> bytes:
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(18, 16, 18)
    pdf.add_page()

    # Always return the cursor to the left margin so a w=0 (full-width) cell
    # never computes zero available width.
    def cell(h: float, txt: str) -> None:
        pdf.multi_cell(0, h, txt, new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    lines = _latin1(text or "").split("\n")
    # Skip leading blank lines, treat the first real line as the name.
    i = 0
    while i < len(lines) and not lines[i].strip():
        i += 1
    if i < len(lines):
        pdf.set_font("Helvetica", "B", 15)
        cell(7, lines[i].strip())
        i += 1
        # A following non-blank line is usually a title/tagline.
        if i < len(lines) and lines[i].strip():
            pdf.set_font("Helvetica", "", 10.5)
            pdf.set_text_color(90, 90, 90)
            cell(5, lines[i].strip())
            pdf.set_text_color(0, 0, 0)
            i += 1
        pdf.ln(2)

    for line in lines[i:]:
        stripped = line.rstrip()
        if not stripped:
            pdf.ln(2.5)
            continue
        if _is_heading(stripped):
            pdf.ln(1.5)
            pdf.set_font("Helvetica", "B", 11)
            cell(5.5, stripped)
        else:
            pdf.set_font("Helvetica", "", 10.5)
            cell(5, stripped)

    return bytes(pdf.output())
