"""Danger level of a single failed batch. Plain rules, easy to check."""
import re

HIGH = {"Spurious", "Sterility", "Particulate matter", "Microbial"}
MEDIUM = {"Assay / content", "Dissolution", "Related substances", "pH / physical", "Other"}
LOW = {"Labelling", "Description"}

NOTES = {
    "Spurious": "Fake or wrongly labelled product. It may not contain the stated medicine.",
    "Sterility": "Product meant to be sterile failed the sterility test. Risk of infection.",
    "Particulate matter": "Visible or sub-visible particles found. Dangerous in injections and eye drops.",
    "Microbial": "Bacteria or toxins found above the limit.",
    "Assay / content": "Wrong amount of medicine. The patient may get too little or too much.",
    "Dissolution": "Tablet or capsule does not dissolve properly, so the medicine may not work.",
    "Related substances": "Impurities above the allowed limit.",
    "pH / physical": "Physical test failed (pH, volume, hardness and similar).",
    "Labelling": "Label is wrong or missing details. Medicine itself may be fine.",
    "Description": "Looks different from the standard (colour, shape, smell).",
    "Other": "Failure type not recognised. Check the original record.",
}

# medicines that go into the blood or eye are judged more strictly
STRICT = re.compile(r"inject|infusion|\bi\.?v\.?\b|eye|ophthalmic|vial|ampoule|parenteral", re.I)


def danger_level(category: str, drug_name: str) -> tuple[str, str]:
    note = NOTES.get(category, NOTES["Other"])
    if category in HIGH:
        return "HIGH", note
    if category in MEDIUM:
        if STRICT.search(drug_name or "") and category in {"Assay / content", "Related substances", "pH / physical"}:
            return "HIGH", note + " Raised to HIGH because it is an injection or eye product."
        return "MEDIUM", note
    return "LOW", note
