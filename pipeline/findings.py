"""Pull measured values out of CDSCO's failure text, when it has them.
Most records only name the failed test; about 3% give numbers.
Rules are strict on purpose: when unsure, CDSCO's own words are quoted instead of interpreted."""
import re

UNIT = r"(%\s*w/v|%\s*v/v|%\s*w/w|%|mg|mcg|µg|g|ml|iu|cfu\s*/\s*(?:g|gm|ml))"
NUM = r"(\d+(?:\.\d+)?)"
TOXIC = ["diethylene glycol", "ethylene glycol", "methanol"]
OTHER_SUBSTANCE = re.compile(r"methanol|isopropyl|iso propyl|glycol|ethanol|ethyl alcohol", re.I)


def _clean(t: str) -> str:
    return re.sub(r"\s+", " ", t or "").strip()


def findings(text: str) -> list[str]:
    t = _clean(text)
    low = t.lower()
    out = []

    # 1. toxic substances found in the sample (diethylene glycol, ethylene glycol, methanol)
    for name, pat in [("Diethylene Glycol", r"diethylene glycol"), ("Ethylene Glycol", r"(?<!di)ethylene glycol"),
                      ("Methanol", r"methanol")]:
        m = re.search(rf"{NUM}\s*{UNIT}\s*(?:of\s*)?{pat}", low) or re.search(rf"{pat}[\s:()\-a-z]{{0,25}}?{NUM}\s*{UNIT}", low)
        if m:
            out.append(f"Toxic substance found: {name} {m.group(1)}{m.group(2).replace(' ', '')}")
        elif re.search(rf"(positive for|presence of|contains?|detected|peak of)[^.]{{0,30}}{pat}", low):
            out.append(f"Toxic substance found: {name}")

    # 2. dissolution: 'average release is 68.88% of labelled claim against Q value of NLT 80%'
    m = re.search(rf"release\D{{0,20}}{NUM}\s*%.{{0,60}}?(?:q\s*value|nlt|not less than)\D{{0,20}}{NUM}\s*%", low)
    if m:
        out.append(f"Only {m.group(1)}% of the medicine dissolved, at least {m.group(2)}% is required")
    else:
        # 3. found X against labelled claim of Y (same medicine, same unit)
        m = re.search(rf"found\s*(?:to be)?\s*:?\s*{NUM}\s*{UNIT}(.{{0,60}}?)(?:against|of)\s*(?:the\s*)?label(?:l?ed)?\s*claim\s*(?:of)?\s*:?\s*{NUM}\s*{UNIT}",
                      low)
        if m and not OTHER_SUBSTANCE.search(m.group(3)):
            a, ua, b, ub = float(m.group(1)), m.group(2).replace(" ", ""), float(m.group(4)), m.group(5).replace(" ", "")
            line = f"Found {m.group(1)} {ua}, label says {m.group(4)} {ub}"
            if ua == ub and b:
                line += f" ({a / b * 100:.0f}% of label)"
            out.append(line)
        else:
            # 4. 'X% of the labelled amount / of claim'
            m = re.search(rf"{NUM}\s*%\s*\)?\s*of\s*(?:the\s*)?(?:label(?:l?ed)?\s*)?(?:amount|claim)", low)
            if m and float(m.group(1)) <= 300:
                out.append(f"{m.group(1)}% of the amount stated on the label")

    # impurity: 'Limit: Not More than 0.1%, Present-0.4%'
    m = re.search(rf"limit\W*(?:not more than|nmt)\s*{NUM}\s*%\W*present\W*{NUM}\s*%", low)
    if m:
        out.append(f"Impurity {m.group(2)}%, allowed not more than {m.group(1)}%")

    # microbial count against a limit
    m = re.search(rf"{NUM}\s*cfu\s*/\s*(g|gm|ml).{{0,120}}?(?:limit|not more than|nmt)\D{{0,30}}?{NUM}\s*cfu", low)
    if m:
        out.append(f"Microbial count {int(float(m.group(1))):,} CFU/{m.group(2)}, allowed not more than {m.group(3)}")

    # otherwise quote the part of CDSCO's text that has the numbers
    if not out and re.search(rf"{NUM}\s*{UNIT}", t, re.I):
        sentence = next((s for s in re.split(r"(?<=[.;])\s+|\s(?=\d\))", t) if re.search(rf"{NUM}\s*{UNIT}", s, re.I)), t)
        out.append(f"CDSCO detail: {sentence[:180]}")
    return out
