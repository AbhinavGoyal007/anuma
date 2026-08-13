"""Shows what a model's transcripts say, and which specification tokens survived."""

import glob
import json
import os
import re
import sys

TAG = sys.argv[1]
CHARS = int(sys.argv[2]) if len(sys.argv) > 2 else 320

SPEC = re.compile(
    r"(RTX\s?\d{3,4}|GTX\s?\d{3,4}|\bi[3579]\b|Ryzen\s?[3579]|Ultra\s?[3579]"
    r"|\d+\s?(?:GB|TB|gigs?|gig)\b|Victus|LOQ|IdeaPad|Swift|Vivobook|Nitro|MacBook"
    r"|\b\d{2},\d{3}\b|\b\d{5,6}\b)",
    re.I,
)

for path in sorted(glob.glob(f"/workspace/eval/out/{TAG}/*.json")):
    d = json.load(open(path))
    text = d["text"]
    print(f"=== {d['title']} ({d.get('detectedLanguage')}) ===")
    print(text[:CHARS].strip())
    hits = list(dict.fromkeys(m.group(0) for m in SPEC.finditer(text)))
    print("  SPECS:", " | ".join(hits)[:260] if hits else "(none found)")
    print()
