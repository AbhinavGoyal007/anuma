"""
Turning the test pack's gold-truth tables into entities a scorer can check.

The pack states expected values in prose — "RTX 4060; 16 GB RAM; 1 TB",
"Initially ~₹65,000" — because it was written for a person marking by hand. What
a scorer needs is the individual facts, typed, so each can be looked for with the
tolerance that fact deserves.

Extraction is deliberately conservative: only patterns that are unambiguous
become entities. A field saying "dedicated GPU not confirmed as necessary" is a
judgement about the conversation, not a string that should appear in it, and
inventing an entity from it would measure the wrong thing.
"""

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent

FIELDS = (
    "target_budget",
    "maximum_budget",
    "specification_requirements",
    "products_considered",
    "products_recommended",
    "brand_preferences",
    "competitor_price_claim",
    "accessories_discussed",
)

# Product families this retailer carries, as a person would name them.
PRODUCTS = [
    "LOQ", "IdeaPad", "Victus", "Swift", "Vivobook", "Zenbook", "Nitro",
    "MacBook", "Pavilion", "Inspiron", "Latitude", "ThinkPad", "Aspire",
    "Predator", "Omen", "TUF", "ROG", "Yoga", "Legion", "Envy", "Spectre",
    "Galaxy Book", "Surface", "Chromebook", "ProArt", "XPS", "Air",
]
BRANDS = ["Lenovo", "HP", "Dell", "Asus", "ASUS", "Acer", "Apple", "MSI", "Samsung", "Microsoft"]


def entities_from(text: str) -> dict[str, list[str]]:
    """The facts in one gold-truth block, by kind."""
    found: dict[str, list[str]] = {}

    def add(kind: str, value: str) -> None:
        found.setdefault(kind, [])
        if value not in found[kind]:
            found[kind].append(value)

    # Money: ₹80,000 or ₹1,05,000. Stored without separators.
    for raw in re.findall(r"₹\s?([\d,]{4,9})", text):
        digits = raw.replace(",", "")
        if len(digits) >= 4:
            add("money", digits)

    # Graphics: RTX 4060, GTX 1650.
    for family, number in re.findall(r"\b(RTX|GTX)\s?(\d{3,4})\b", text, re.I):
        add("graphics", f"{family.upper()} {number}")

    # Memory and storage, told apart by size: 16 GB is memory, 512 GB is a drive.
    for value, unit in re.findall(r"\b(\d{1,4})\s?(GB|TB)\b", text, re.I):
        unit = unit.upper()
        if unit == "TB":
            add("storage", f"{value} TB")
        elif int(value) >= 128:
            add("storage", f"{value} GB")
        else:
            add("memory", f"{value} GB")

    # Processors.
    for cpu in re.findall(r"\b(i[3579]|Ryzen\s?[3579]|M[1234])\b", text):
        add("cpu", re.sub(r"\s+", " ", cpu))

    for product in PRODUCTS:
        if re.search(rf"\b{re.escape(product)}\b", text, re.I):
            add("product", product)
    for brand in BRANDS:
        if re.search(rf"\b{re.escape(brand)}\b", text):
            add("brand", brand.capitalize() if brand.isupper() else brand)

    return found


def parse(path: Path) -> dict[str, dict[str, list[str]]]:
    text = path.read_text(encoding="utf-8")
    gold: dict[str, dict[str, list[str]]] = {}
    for block in re.split(r"(?=^Script \d+ —)", text, flags=re.M):
        match = re.match(r"^Script (\d+) —", block)
        if not match:
            continue
        marker = "Expected gold truth"
        if marker not in block:
            continue
        table = block.split(marker, 1)[1]
        lines = [l.strip() for l in table.split("\n") if l.strip()]

        # The table alternates field name then value, one per line.
        relevant = []
        for i, line in enumerate(lines):
            if line.lower() in FIELDS and i + 1 < len(lines):
                relevant.append(lines[i + 1])

        merged: dict[str, list[str]] = {}
        for value in relevant:
            for kind, items in entities_from(value).items():
                merged.setdefault(kind, [])
                for item in items:
                    if item not in merged[kind]:
                        merged[kind].append(item)
        if merged:
            gold[f"Script {match.group(1)}"] = merged
    return gold


def main() -> None:
    gold: dict[str, dict[str, list[str]]] = {}
    for name in ("docx/script.txt", "docx2/script2.txt"):
        gold.update(parse(HERE / name))

    total = sum(len(v) for s in gold.values() for v in s.values())
    (HERE / "gold.json").write_text(json.dumps(gold, indent=1, ensure_ascii=False))
    print(f"{len(gold)} scripts, {total} entities")
    for script, kinds in sorted(gold.items(), key=lambda kv: int(kv[0].split()[1])):
        summary = " ".join(f"{k}={len(v)}" for k, v in kinds.items())
        print(f"  {script:<10} {summary}")


if __name__ == "__main__":
    main()
