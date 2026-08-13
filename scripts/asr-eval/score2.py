"""
Scoring every model against the full test pack.

Same principle as before — a transcript is judged by whether the facts survived
it, not by word error rate — but now over all fourteen scripts and 103 entities
drawn automatically from the pack's own gold-truth tables.

The matching tolerances are the ones a downstream reader would apply, and each
was added because a real transcript demanded it rather than in anticipation:
prices said as "65" for sixty-five thousand, memory said as "solah GB", "16GB"
written closed up. Graphics chips stay exact, because RTX 4050 accepted for RTX
4060 is the error that costs a sale.
"""

import glob
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).parent
# Only facts actually uttered in the script. The answer key also names things
# the extraction should infer — "Lenovo LOQ" where the dialogue says just
# "LOQ" — and no transcriber can be marked down for those.
GOLD = json.loads((HERE / "gold_spoken.json").read_text())

LANGUAGE = {
    1: "English", 2: "Hinglish", 3: "Hindi", 4: "English", 5: "Hinglish",
    6: "Hindi", 7: "English", 8: "Hinglish", 9: "Hindi", 10: "Hinglish",
    11: "English", 12: "Hinglish", 13: "Hindi-Roman", 14: "Hinglish",
}

# Numbers as Hindi actually says them, romanised. A transcript writing "solah GB"
# has kept the fact; only the notation differs, and a language model reads it
# without difficulty. Scoring digits alone measured which models translate, not
# which preserved the information.
HINDI_NUMERALS = {
    "16": ["solah", "sixteen"], "32": ["battis", "batees", "thirty two"],
    "8": ["aath", "eight"], "512": ["paanch sau barah", "five hundred twelve"],
    "55": ["pachapan", "pachpan", "fifty five"], "60": ["saath", "sixty"],
    "65": ["painsath", "sixty five"], "70": ["sattar", "seventy"],
    "75": ["pachhattar", "seventy five"], "80": ["assi", "eighty"],
    "85": ["pachasi", "eighty five"], "90": ["nabbe", "ninety"],
    "95": ["panchanave", "ninety five"], "45": ["paintalis", "forty five"],
    "50": ["pachas", "fifty"], "40": ["chalis", "forty"],
    "1": ["ek", "one"], "2": ["do", "two"],
}


def normalise(text: str) -> str:
    text = text.lower()
    text = re.sub(r"(?<=\d),(?=\d)", "", text)  # 80,000 -> 80000
    text = re.sub(r"[₹]", "", text)
    # Spelled-out numbers are hyphenated as often as not — "eighty-five",
    # "twenty-four" — and a hyphen is not a difference in what was said.
    text = re.sub(r"(?<=[a-z])-(?=[a-z])", " ", text)
    return re.sub(r"\s+", " ", text)


def forms(value: str) -> list[str]:
    return [value, *HINDI_NUMERALS.get(value, [])]


def found(entity: str, kind: str, haystack: str) -> bool:
    needle = normalise(entity)

    if kind == "money":
        short = needle[:-3] if needle.endswith("000") and len(needle) > 3 else None
        candidates = [needle] + (forms(short) if short else [])
        # Above a lakh, nobody in India says the digits. "Around one lakh, I can
        # go up to one lakh ten" is how ₹1,00,000 and ₹1,10,000 are actually
        # spoken, and a transcript writing it that way has kept the number.
        value = int(needle)
        if value >= 100000:
            lakhs = value / 100000
            whole = int(lakhs)
            words = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five"}
            candidates += [f"{whole} lakh", f"{words.get(whole, whole)} lakh"]
            remainder = (value % 100000) // 10000
            if remainder:
                for lead in (str(whole), words.get(whole, str(whole))):
                    candidates += [
                        f"{lead} lakh {remainder}",
                        f"{lead} lakh {words.get(remainder, remainder)}",
                        f"{lead}.{remainder} lakh",
                    ]
        return any(re.search(rf"\b{re.escape(c)}\b", haystack) for c in candidates)

    if kind in {"memory", "storage"}:
        value, unit = needle.split()
        alt = f"{unit}|gigs?|gb" if unit == "gb" else f"{unit}|tera\\s?bytes?|tb"
        return any(
            re.search(rf"\b{re.escape(v)}\s?(?:{alt})\b", haystack) for v in forms(value)
        )

    if kind == "graphics":
        family, number = needle.split()
        # The chip number alone counts. People say "the 4050 or 4060 model of
        # LOQ" without the RTX, and the number is what carries the meaning —
        # 4050 and 4060 remain as distinguishable bare as they are prefixed,
        # which is the only distinction that matters here.
        return (
            re.search(rf"\b{family}\s?{number}\b", haystack) is not None
            or re.search(rf"\b{number}\b", haystack) is not None
        )

    if kind == "cpu":
        return re.search(rf"\b{re.escape(needle)}\b", haystack) is not None

    return needle in haystack


def score(tag: str, root: Path) -> dict:
    rows = []
    for path in sorted(glob.glob(str(root / tag / "*.json"))):
        d = json.load(open(path))
        gold = GOLD.get(d["title"])
        if not gold:
            continue
        haystack = normalise(d["text"])
        number = int(d["title"].split()[1])
        for kind, entities in gold.items():
            for entity in entities:
                rows.append({
                    "script": number, "kind": kind, "entity": entity,
                    "language": LANGUAGE.get(number, "?"),
                    "found": found(entity, kind, haystack),
                })
    factors = [
        json.load(open(f)).get("realtimeFactor", 0)
        for f in glob.glob(str(root / tag / "*.json"))
    ]
    return {
        "tag": tag, "rows": rows,
        "hit": sum(1 for r in rows if r["found"]), "total": len(rows),
        "speed": sum(factors) / len(factors) if factors else 0,
    }


def main() -> None:
    root = HERE / "out2"
    tags = sys.argv[1:] or [p.name for p in sorted(root.iterdir()) if p.is_dir()]
    results = sorted(
        (score(t, root) for t in tags),
        key=lambda r: -r["hit"] / max(r["total"], 1),
    )

    langs = ["English", "Hinglish", "Hindi", "Hindi-Roman"]
    print(f"{'model':<20} {'overall':>12}  " + " ".join(f"{l:>12}" for l in langs) + "   speed")
    print("-" * 104)
    for r in results:
        cells = []
        for lang in langs:
            sub = [row for row in r["rows"] if row["language"] == lang]
            if not sub:
                cells.append("—".rjust(12))
                continue
            hit = sum(1 for s in sub if s["found"])
            cells.append(f"{hit}/{len(sub)} {hit/len(sub):.0%}".rjust(12))
        overall = f"{r['hit']}/{r['total']} {r['hit']/max(r['total'],1):.0%}"
        print(f"{r['tag']:<20} {overall:>12}  " + " ".join(cells) + f"   {r['speed']:>5.1f}x")

    print()
    print("by entity kind:")
    kinds = sorted({row["kind"] for r in results for row in r["rows"]})
    print(f"{'model':<20} " + " ".join(f"{k:>10}" for k in kinds))
    for r in results:
        cells = []
        for k in kinds:
            sub = [row for row in r["rows"] if row["kind"] == k]
            if not sub:
                cells.append("—".rjust(10))
                continue
            hit = sum(1 for s in sub if s["found"])
            cells.append(f"{hit}/{len(sub)}".rjust(10))
        print(f"{r['tag']:<20} " + " ".join(cells))

    best = results[0]
    misses = [f"S{m['script']}:{m['entity']}" for m in best["rows"] if not m["found"]]
    print(f"\n{best['tag']} missed: " + (", ".join(misses) if misses else "nothing"))


if __name__ == "__main__":
    main()
