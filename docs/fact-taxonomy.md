# Semantic Fact Taxonomy

## Taxonomy model

A fact definition has a stable key and immutable versions. Each version declares category, description, value type, cardinality, subject types, allowed speaker roles, canonical units, entity dictionary, sensitivity, aggregation rule, and applicable domain packs.

Fact instances are assertions, not mutable conversation fields. They retain the analysis run, occurrence time, speaker, normalized value, original evidence, transcript segment references, confidence, and review state. Facts with specialized commercial value—questions, responses, objections, commitments, next actions, and outcomes—also have first-class records.

## Shared core taxonomy

### Opening

| Key | Value type | Meaning |
|---|---|---|
| `opening.greeting` | boolean/event | representative greeted customer |
| `opening.representative_introduction` | boolean/event | name or role introduction occurred |
| `opening.purpose_stated` | text/entity | purpose of interaction was stated |

### Discovery

| Key | Value type | Meaning |
|---|---|---|
| `discovery.customer_need` | taxonomy entity + text | underlying need/customer job |
| `discovery.use_case` | taxonomy entity + text | context in which product will be used |
| `discovery.requirement` | entity/text | stated product or service requirement |
| `discovery.budget` | money/range | stated affordable spend; retain precision type |
| `discovery.timeline` | date/duration/text | intended decision or purchase timing |
| `discovery.constraint` | taxonomy entity + text | limitation such as affordability, size, stock, or timing |
| `discovery.decision_criterion` | taxonomy entity + text | factor used to compare options |
| `discovery.preference` | entity/text | positive preference not yet a hard requirement |

### Commercial

| Key | Value type | Meaning |
|---|---|---|
| `commercial.price_mentioned` | money | price discussed, with subject/product relation |
| `commercial.quoted_price` | money | price explicitly offered by representative/dealer/store |
| `commercial.discount_requested` | money/boolean | customer requested a discount |
| `commercial.discount_offered` | money/percentage | representative offered discount |
| `commercial.financing_discussed` | boolean/event | financing was discussed |
| `commercial.emi_requirement` | money/range | desired installment amount |
| `commercial.down_payment` | money/range | proposed/required down payment |
| `commercial.payment_method` | entity | cash/card/finance or approved values |
| `commercial.promotion` | entity/text | promotion or offer mentioned |

Money facts include amount minor units, currency, amount qualifier (`exact`, `approximate`, `minimum`, `maximum`, `range`), and price subject.

### Product and service

| Key | Value type | Meaning |
|---|---|---|
| `product.category` | entity | canonical product category |
| `product.brand` | entity | canonical brand |
| `product.product` | entity | canonical product family |
| `product.model` | entity | canonical model |
| `product.variant` | entity | trim/configuration/variant |
| `product.feature` | entity + polarity | required, discussed, present, or missing feature |
| `product.benefit_articulated` | entity/text | benefit connected to customer context |
| `product.availability` | state/date/text | stock or availability statement |
| `product.warranty` | duration/text/entity | warranty term or type |
| `product.service` | entity/text | service/maintenance topic |
| `product.demo` | event/state | demo offered, accepted, completed, or declined |
| `product.accessory` | entity + state | accessory discussed/offered/requested |

### Competition

| Key | Value type | Meaning |
|---|---|---|
| `competition.competitor` | entity | competing brand/company |
| `competition.retailer_dealer` | entity | competing retailer or dealer |
| `competition.product` | entity | competing product/model |
| `competition.price` | money | competitor price with entity relation |
| `competition.offer` | structured text/money | competitor promotion or terms |
| `competition.comparison_criterion` | taxonomy entity | price, feature, availability, service, etc. |

### Decision drivers and barriers

These are structured, evidence-backed conversation observations. Each records category/entity, normalized value, supporting evidence, speaker attribution where relevant, confidence, review state, and `assertion_basis` (`explicit_statement` or `inferred_from_evidence`). A primary designation is permitted only within one analysis run/policy and must remain reviewable.

| Key | Value type | Meaning |
|---|---|---|
| `decision.primary_driver` | taxonomy entity + text | the strongest observed factor supporting the customer's decision or preference |
| `decision.purchase_barrier` | taxonomy entity + text | the strongest observed factor preventing or delaying purchase |
| `decision.reason_for_deferral` | taxonomy entity + text/timeframe | why the customer indicated or appeared to defer a decision |
| `decision.explicit_loss_signal` | taxonomy entity + text | explicit conversation evidence that the opportunity is unlikely or lost |

The concepts have deliberately different grains:

| Concept | What it represents | Authority |
|---|---|---|
| Objection | a specific resistance statement/event raised during the interaction | conversation observation |
| Decision driver/barrier | a synthesized, evidence-backed observation about the main decision factor or impediment | explicit or inferred conversation observation |
| Outcome/lost reason | what the client later records as the commercial result or authoritative loss reason | authoritative outcome event |

One conversation may contain several objections but one inferred primary barrier. A client-supplied lost reason may disagree with the conversation observation; preserve both and never let a `decision.*` fact update or replace the outcome event.

### Closing

| Key | Value type | Meaning |
|---|---|---|
| `closing.close_attempt` | event | representative attempted to secure commitment |
| `closing.customer_commitment` | structured commitment | customer agreed to an action |
| `closing.next_step` | structured action | next activity, owner, due time/precision |
| `closing.follow_up_promised` | structured action | explicit follow-up commitment |
| `closing.follow_up_channel` | entity | call, message, visit, email, other |

### Outcome signals

These are conversation observations, not authoritative outcome events.

| Key | Value type | Meaning |
|---|---|---|
| `signal.purchase_interest` | ordinal | explicit purchase interest strength |
| `signal.explicit_rejection` | boolean + reason | explicit rejection in conversation |
| `signal.test_drive_interest` | boolean/state | interest in a test drive |
| `signal.purchase_intent` | ordinal + timeframe | stated intent and timing |
| `signal.follow_up_intent` | boolean/state | willingness to continue |

## Questions and responses

Question topic keys reuse taxonomy definitions such as budget, financing, availability, warranty, product feature, competitor comparison, price, promotion, delivery/waiting period, and next step. Question type is separate from topic: `open`, `closed`, `clarification`, `rhetorical`, or `other`; substantive classification is independent.

Responses are distinct objects linked many-to-many to questions. Link states are `answered`, `partially_answered`, `unanswered`, `uncertain`, and `not_applicable`. A response must not be marked answered merely because another representative utterance followed it.

## Objection taxonomy

Core objection families are stable; vertical packs may specialize them:

| Key | Meaning |
|---|---|
| `objection.price` | price or affordability resistance |
| `objection.financing` | finance eligibility, rate, EMI, or down-payment concern |
| `objection.feature_gap` | desired capability is missing/inadequate |
| `objection.availability` | stock, delivery, or waiting concern |
| `objection.warranty_service` | warranty, service, reliability, or support concern |
| `objection.competitor_offer` | alternative product/retailer/dealer seems better |
| `objection.brand_preference` | preference or trust favors another brand |
| `objection.timing` | not ready or purchase timing mismatch |
| `objection.other` | reviewed long-tail category |

An objection stores the customer statement and occurrence evidence. Handling is a linked response with approach (`acknowledge`, `clarify`, `reframe`, `provide_evidence`, `offer_alternative`, `commercial_concession`, `defer`, `ignore`, `other`) and resolution (`resolved`, `partially_resolved`, `unresolved`, `deferred`, `uncertain`).

## Review and confidence

Review states: `unreviewed`, `confirmed`, `corrected`, `rejected`, `needs_review`. Confidence is producer-specific and cannot be compared across models unless calibrated. A fact requiring evidence cannot become effective if its evidence group is empty or inconsistent with its conversation/run.

## Taxonomy governance

- Stable keys are never reused with new meaning.
- Draft versions can change; published versions are immutable.
- Organization extensions use namespaced keys and must map to shared concepts when aggregation is desired.
- Entity aliases are language-aware and retain the original surface text.
- Pack upgrades require an explicit compatibility/migration map; historical facts keep their original definition version.
- Frequently queried facts may gain typed projection tables without changing the canonical assertion/event history.
