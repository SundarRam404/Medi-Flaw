"""Read medicines and batch numbers out of a purchase invoice (PDF text or photo text).

The photo is read in the browser (Tesseract OCR); the PDF text is read here.
Then the language model turns the text into rows. If it is not available,
a simple pattern match is used instead. The user always checks the rows before adding.
"""
import io, json, re
import httpx
from .config import GROQ_API_KEY, GROQ_MODEL

PROMPT = (
    "Below is text from a pharmacy purchase invoice. List every medicine line. "
    'Reply with JSON only: {"items": [{"drug_name": "", "batch_no": "", "manufacturer": "", "quantity": 0, '
    '"expiry": ""}]}. Use empty strings or 0 when a value is missing. Do not invent batch numbers.\n\nInvoice text:\n'
)


def pdf_text(data: bytes) -> str:
    from pypdf import PdfReader
    return "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(data)).pages)


def _llm(text: str) -> list[dict] | None:
    if not GROQ_API_KEY:
        return None
    for model in [m.strip() for m in GROQ_MODEL.split(",") if m.strip()]:
        body = {"model": model, "temperature": 0, "max_tokens": 3000,
                "messages": [{"role": "user", "content": PROMPT + text[:8000]}]}
        if model.startswith("openai/gpt-oss"):
            body["reasoning_effort"] = "low"
        try:
            r = httpx.post("https://api.groq.com/openai/v1/chat/completions",
                           headers={"Authorization": f"Bearer {GROQ_API_KEY}"}, json=body, timeout=60)
            if r.status_code in (403, 404):
                continue
            r.raise_for_status()
            out = r.json()["choices"][0]["message"]["content"]
            m = re.search(r"\{.*\}", out, re.S)
            items = json.loads(m.group(0)).get("items", []) if m else []
            return [i for i in items if (i.get("batch_no") or "").strip()]
        except Exception:
            continue
    return None


BATCH = re.compile(r"\b(?=[A-Z0-9\-/]*\d)(?=[A-Z0-9\-/]*[A-Z])[A-Z0-9][A-Z0-9\-/]{3,18}\b")


SKIP = re.compile(r"invoice|d\.?l\.?\s*no|gst|date|bill to|phone|total|amount|rate", re.I)


def _patterns(text: str) -> list[dict]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    items = []
    for i, l in enumerate(lines):
        if SKIP.search(l):
            continue
        m = re.search(r"(?:batch|b\.?\s*no\.?|lot)\s*[:#]?\s*([A-Za-z0-9\-/]{3,20})", l, re.I)
        cands = [m.group(1)] if m else [c for c in BATCH.findall(l.upper()) if not re.fullmatch(r"\d+(MG|ML|G|IU)?", c)
                                        and not re.fullmatch(r"\d{1,2}/\d{2,4}", c)]
        if not cands:
            continue
        b = cands[0]
        if re.fullmatch(r"[A-Za-z0-9\-/]+", l):
            # table PDFs put each cell on its own line: product above, maker below
            drug = lines[i - 1] if i > 0 else ""
            maker = lines[i + 1] if i + 1 < len(lines) else ""
            qty = next((int(x) for x in lines[i + 2:i + 5] if x.isdigit()), 0)
        else:
            drug = re.split(r"(?i)batch|b\.?\s*no|lot", l)[0]
            maker = ""
            q = re.search(r"(?i)qty\s*[:]?\s*(\d{1,4})|\b(\d{1,4})\s*(?:nos|strips?|units?|pcs)\b", l)
            qty = int(q.group(1) or q.group(2)) if q else 0
        drug = re.sub(r"^\s*\d+[.)]?\s+", "", drug).strip(" -|:,")
        if not drug or drug.upper() == b:
            continue
        items.append({"drug_name": drug[:120], "batch_no": b, "manufacturer": maker[:120],
                      "quantity": qty, "expiry": ""})
    return items


def parse_items(text: str) -> tuple[list[dict], str]:
    text = (text or "").strip()
    if not text:
        return [], "none"
    items = _llm(text)
    if items:
        return items, "language model"
    return _patterns(text), "pattern match"
