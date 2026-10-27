"""Is a shop's batch really the failed batch? Batch codes are only unique within one company,
so the company (or at least the medicine) must agree too."""
import re
from rapidfuzz import fuzz
from .clean import name_key

WORD = re.compile(r"[a-z]{5,}")
SKIP = {"tablets", "tablet", "capsules", "capsule", "injection", "syrup", "suspension", "solution", "sodium",
        "hydrochloride", "potassium", "release", "coated", "sustained", "extended", "powder", "cream"}


def _words(s):
    return {w for w in WORD.findall((s or "").lower()) if w not in SKIP}


def same_batch(w_maker, w_drug, rec) -> tuple[bool, str]:
    """Returns (is_match, how)."""
    if w_maker:
        score = fuzz.token_set_ratio(name_key(w_maker), name_key(rec.manufacturer))
        if score >= 70:
            return True, "batch and company match"
        return False, f"same batch number, but CDSCO lists it for {rec.manufacturer}"
    if w_drug:
        if _words(w_drug) & _words(rec.drug_name):
            return True, "batch and medicine match"
        return False, f"same batch number, but CDSCO lists it for {rec.drug_name}"
    return True, "batch number only (add the company to be sure)"
