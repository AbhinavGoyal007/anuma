"""
Scoring a transcript by whether the facts survived it.

Word error rate is the wrong headline here. The product does not sell a
transcript — it extracts a Commercial Interaction Record, and what matters is
whether "RTX 4060", "₹80,000" and "Victus" are still in the text for the
extractor to find. A model can score a respectable WER and still be useless
because it wrote "ITX 40 50".

Each entity is taken from the pack's own gold-truth fields and matched with the
tolerance a downstream reader would apply: digits compared as digits, so 80,000
and 80000 agree; model names compared case-insensitively; graphics chips
required to be exact, because RTX 4050 and RTX 4060 are different machines and
accepting one for the other is the expensive error.
"""

import glob
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent

# Taken verbatim from the "Expected gold truth" tables in the test pack.
GOLD: dict[str, dict[str, list[str]]] = {
    "Script 1": {
        "graphics": ["RTX 4060"],
        "memory": ["16 GB"],
        "storage": ["1 TB"],
        "product": ["LOQ"],
        "brand": ["Lenovo"],
        "money": ["80000", "85000", "78999"],
    },
    "Script 2": {
        "memory": ["16 GB"],
        "product": ["IdeaPad", "Swift"],
        "brand": ["Lenovo", "Acer"],
        "money": ["65000", "70000", "75000"],
    },
    "Script 4": {
        "graphics": ["RTX 4050"],
        "memory": ["16 GB"],
        "product": ["Victus", "LOQ"],
        "brand": ["HP", "Lenovo"],
        "money": ["75000"],
    },
    "Script 5": {
        "cpu": ["i9"],
        "memory": ["16 GB", "32 GB"],
        "product": ["Swift"],
        "brand": ["Acer"],
        "money": ["90000", "95000"],
    },
}


def normalise(text: str) -> str:
    """
    Lowercased, with thousands separators removed.

    Only commas are collapsed, never spaces. Collapsing spaces between digits
    also welds neighbouring numbers together — "ITX 4050 16GB" became
    "405016gb" and the memory was scored as missing when it was plainly there.
    A space-separated "80 000" is rare in these transcripts; two numbers side by
    side is not.
    """
    text = text.lower()
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # 80,000 -> 80000
    text = re.sub(r"[₹]", "", text)
    return re.sub(r"\s+", " ", text)


def found(entity: str, kind: str, text: str) -> bool:
    """Whether this fact is still recoverable from the transcript."""
    haystack = normalise(text)
    needle = normalise(entity)

    if kind == "money":
        # A price is the digits, in either form the floor actually uses. Indian
        # conversational speech drops the thousands — "budget 65 hai", "I can
        # stretch to 85" — and every model transcribes it that way, so requiring
        # "65000" measured the scorer's assumptions rather than the model. Both
        # forms count, because the extractor resolves the shorthand from context.
        full = needle
        short = full[:-3] if full.endswith("000") else None
        if re.search(rf"\b{full}\b", haystack):
            return True
        return short is not None and re.search(rf"\b{short}\b", haystack) is not None

    if kind in {"memory", "storage"}:
        # "16 GB", "16GB" and "16 gigs" all carry the number the extractor needs.
        value, unit = needle.split()
        pattern = rf"\b{value}\s?(?:{unit}|{'gig' if unit == 'gb' else unit}s?|tera\s?byte)\b"
        return re.search(pattern, haystack) is not None

    if kind == "graphics":
        # Exact. RTX 4050 accepted for RTX 4060 is the error that costs a sale.
        family, number = needle.split()
        return re.search(rf"\b{family}\s?{number}\b", haystack) is not None

    return needle in haystack


def score(tag: str) -> dict:
    rows = []
    for path in sorted(glob.glob(str(HERE / "out" / tag / "*.json"))):
        d = json.load(open(path))
        title = d["title"]
        gold = GOLD.get(title)
        if not gold:
            continue
        text = d["text"]
        for kind, entities in gold.items():
            for entity in entities:
                rows.append(
                    {
                        "script": title,
                        "kind": kind,
                        "entity": entity,
                        "found": found(entity, kind, text),
                    }
                )
    hit = sum(1 for r in rows if r["found"])
    return {"tag": tag, "rows": rows, "hit": hit, "total": len(rows)}


def main() -> None:
    tags = sys.argv[1:] or [
        p.name for p in sorted((HERE / "out").iterdir()) if p.is_dir()
    ]
    results = [score(t) for t in tags]

    print(f"{'model':<20} {'entities':<10} {'recall':<8}  misses")
    print("-" * 96)
    for r in sorted(results, key=lambda x: -x["hit"] / max(x["total"], 1)):
        misses = [f"{m['script'].replace('Script ','S')}:{m['entity']}" for m in r["rows"] if not m["found"]]
        recall = r["hit"] / max(r["total"], 1)
        print(
            f"{r['tag']:<20} {r['hit']:>3}/{r['total']:<6} {recall:>6.0%}   "
            + (", ".join(misses)[:70] if misses else "—")
        )

    print()
    print("by category (recall):")
    kinds = sorted({row["kind"] for r in results for row in r["rows"]})
    print(f"{'model':<20} " + " ".join(f"{k:>9}" for k in kinds))
    for r in sorted(results, key=lambda x: -x["hit"] / max(x["total"], 1)):
        cells = []
        for k in kinds:
            sub = [row for row in r["rows"] if row["kind"] == k]
            cells.append(
                f"{sum(1 for s in sub if s['found'])}/{len(sub)}".rjust(9) if sub else "—".rjust(9)
            )
        print(f"{r['tag']:<20} " + " ".join(cells))

    print()
    print("speed (mean realtime factor, higher is cheaper):")
    for tag in tags:
        files = glob.glob(str(HERE / "out" / tag / "*.json"))
        if not files:
            continue
        factors = [json.load(open(f)).get("realtimeFactor", 0) for f in files]
        print(f"  {tag:<20} {sum(factors)/len(factors):>6.1f}x")


if __name__ == "__main__":
    main()
