"""
Reducing the gold truth to facts that were actually said.

The pack's gold-truth tables are an evaluator's answer key, not a transcript.
They name "Lenovo LOQ RTX 4060" where the dialogue says only "LOQ", and
"512 GB SSD confirmed through recommendation" where nobody utters a number. Those
are correct expectations of the *extraction*, but they are not recoverable from
the audio, and scoring an ASR model against them measures nothing — every model
fails them identically.

So each candidate entity is kept only if it appears in the script's own dialogue.
What remains is the ceiling a perfect transcript could reach, which is the only
fair reference for a transcriber.

Hindi dialogues are written in Devanagari, so the check knows the handful of
number words and brand spellings this pack uses. Without that, every Hindi
entity would look unspoken and the Hindi scripts would score against an empty
reference.
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).parent

DEVANAGARI = {
    "16": ["सोलह"], "32": ["बत्तीस"], "8": ["आठ"], "512": ["पाँच सौ बारह", "पांच सौ बारह"],
    "55": ["पचपन"], "60": ["साठ"], "65": ["पैंसठ"], "70": ["सत्तर"], "75": ["पचहत्तर"],
    "80": ["अस्सी"], "85": ["पचासी"], "90": ["नब्बे"], "95": ["पंचानवे"],
    "45": ["पैंतालीस"], "50": ["पचास"], "40": ["चालीस"], "1": ["एक"], "2": ["दो"],
    "100000": ["एक लाख"], "110000": ["एक लाख दस"],
}
BRAND_DEVANAGARI = {
    "Lenovo": ["लेनोवो"], "HP": ["एचपी"], "Dell": ["डेल"], "Asus": ["आसुस", "असुस"],
    "Acer": ["एसर"], "Apple": ["एप्पल", "ऐपल"], "Samsung": ["सैमसंग"],
}
PRODUCT_DEVANAGARI = {
    "IdeaPad": ["आइडियापैड", "आइडिया पैड"], "LOQ": ["एलओक्यू"],
    "Swift": ["स्विफ्ट"], "Vivobook": ["विवोबुक"], "MacBook": ["मैकबुक"],
}


from score2 import found as scorer_found
from score2 import normalise


def spoken(entity: str, kind: str, dialogue: str) -> bool:
    """
    Whether a perfect transcript of this dialogue would contain the fact.

    Asked with exactly the scorer's own tolerance, by running the scorer against
    the script itself. Anything the scorer would not credit in a flawless
    transcript is not a fact an ASR model can be marked down for losing — and
    keeping the two rules in one place is what stops the reference and the
    measurement drifting apart.

    The scripts spell numbers out — "sixteen gigs of RAM", "eighty thousand" —
    which the scorer already accepts. Devanagari it does not, so the Hindi
    spellings this pack uses are checked separately.
    """
    if scorer_found(entity, kind, normalise(dialogue)):
        return True

    if kind in {"money", "memory", "storage"}:
        value = entity.split()[0] if " " in entity else entity
        short = value[:-3] if value.endswith("000") and len(value) > 3 else value
        return any(d in dialogue for d in DEVANAGARI.get(short, []) + DEVANAGARI.get(value, []))
    if kind == "brand":
        return any(d in dialogue for d in BRAND_DEVANAGARI.get(entity, []))
    if kind == "product":
        return any(d in dialogue for d in PRODUCT_DEVANAGARI.get(entity, []))
    return False


def main() -> None:
    both = (HERE / "docx/script.txt").read_text(encoding="utf-8") + (
        HERE / "docx2/script2.txt"
    ).read_text(encoding="utf-8")
    blocks = re.split(r"(?=Script \d+ —)", both)
    dialogues = {}
    for b in blocks:
        m = re.match(r"Script (\d+) —", b)
        if m:
            dialogues[f"Script {m.group(1)}"] = re.split(r"Expected gold truth", b)[0]

    gold = json.loads((HERE / "gold.json").read_text())
    kept, dropped = {}, []
    for script, kinds in gold.items():
        dialogue = dialogues.get(script, "")
        surviving = {}
        for kind, entities in kinds.items():
            live = [e for e in entities if spoken(e, kind, dialogue)]
            gone = [e for e in entities if e not in live]
            dropped += [f"{script.replace('Script ','S')}:{kind}:{e}" for e in gone]
            if live:
                surviving[kind] = live
        if surviving:
            kept[script] = surviving

    (HERE / "gold_spoken.json").write_text(json.dumps(kept, indent=1, ensure_ascii=False))
    before = sum(len(v) for s in gold.values() for v in s.values())
    after = sum(len(v) for s in kept.values() for v in s.values())
    print(f"{before} entities in the answer key -> {after} actually spoken")
    print(f"dropped {len(dropped)}:")
    for d in dropped:
        print(f"   {d}")


if __name__ == "__main__":
    main()
