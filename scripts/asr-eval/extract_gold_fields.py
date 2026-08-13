"""
Pulling every expected field value out of the two test packs.

The packs state their answers as a two-column table flattened into lines: a
field name, then what it should contain. Only rows whose left cell is a field
the product actually extracts are kept — the packs also carry commentary rows
("Recording condition", "Primary evaluation") that are instructions to whoever
ran the role-play, not expectations of the record.
"""
import json, re, sys
from pathlib import Path

# The atomic fields, taken from src/modules/interaction-record/fields.ts.
FIELDS = {
 "arrival_intent_state","initial_request","purchase_use_cases","target_budget",
 "maximum_budget","purchase_timing","brand_preferences","specification_requirements",
 "portability_requirement","battery_requirement","decision_drivers","products_considered",
 "products_recommended","recommendation_reasons","competitor_named","competitor_product",
 "competitor_price_claim","objections","objection_response","decision_state",
 "purchase_category","requirement_origin","additional_requirements","other_constraints",
 "customer_questions","finance_requested","demo_performed","alternative_offered",
 "cross_sell","upsell","red_flags","next_action","clarity_start","clarity_end",
 "stock_availability","accessories_discussed","promotion_discussed","warranty_discussed",
 "exchange_discussed","delivery_discussed","follow_up_commitment","customer_sentiment",
 "purchase_urgency",
}

def parse(text):
    out = {}
    for block in re.split(r"(?=Script \d+ —)", text):
        m = re.match(r"Script (\d+) —", block)
        if not m or "Expected gold truth" not in block:
            continue
        lines = [l.strip() for l in block.split("Expected gold truth",1)[1].split("\n") if l.strip()]
        fields = {}
        for i, line in enumerate(lines):
            key = line.lower().replace(" ", "_")
            # First occurrence only. Pack one ends with a cross-script summary
            # table that repeats every field name against a list of script
            # numbers, and letting later rows win filled Script 10's answers with
            # "1, 2, 3, 4, 5, 6, 7, 8, 9, 10".
            if key in FIELDS and i + 1 < len(lines) and key not in fields:
                value = lines[i+1]
                # A value that is only a list of script numbers is that summary
                # leaking through, not an expectation.
                if re.fullmatch(r"[\d,\s]+", value):
                    continue
                fields[key] = value
        if fields:
            out[f"Script {m.group(1)}"] = fields
    return out

gold = {}
for p in ("docx/script.txt", "docx2/script2.txt"):
    gold.update(parse(Path(p).read_text(encoding="utf-8")))

Path(sys.argv[1]).write_text(json.dumps(gold, indent=1, ensure_ascii=False))
print(f"{len(gold)} scripts")
for s in sorted(gold, key=lambda x: int(x.split()[1])):
    print(f"  {s:<11} {len(gold[s])} fields")
