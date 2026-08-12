# Vertical Packs

## Pack architecture

A vertical pack is an immutable, versioned configuration bundle, not an application fork. It contains enabled fact definitions, entity dictionaries and aliases, question topics, objection specializations, tracker templates, scorecard templates, outcome-event definitions, custom dimension definitions, display labels, and evaluation fixtures.

Organizations pin a published pack version. Organization-specific extensions layer on top through versioned definitions. Reprocessing against a newer pack creates a new analysis/evaluation run and never rewrites prior outputs.

## Shared pack contract

Each pack must declare:

- stable key and semantic version;
- supported interaction types and locales;
- taxonomy and output schema versions;
- fact/entity definitions and cardinality;
- objection and handling definitions;
- suggested trackers, never silently enabled score policy;
- outcome event state machine and eligible comparison cohorts;
- sensitive fields and retention implications;
- fixtures covering extraction, evidence, uncertainty, and non-applicability.

## Automotive retail pack

### Discovery and customer context

| Key | Type / examples |
|---|---|
| `auto.intended_use` | city commute, highway, commercial, mixed, leisure |
| `auto.family_requirement` | family size, child/elder needs, seating, luggage |
| `auto.budget` | exact/range money |
| `auto.purchase_timeline` | date/duration/precision |
| `auto.feature_requirement` | safety, transmission, fuel type, connectivity, comfort, performance |
| `auto.existing_vehicle` | brand/model/year/entity |

### Product and competition

| Key | Type / examples |
|---|---|
| `auto.brand`, `auto.model`, `auto.variant` | canonical vehicle entities |
| `auto.competitor_brand`, `auto.competitor_model` | related canonical entities |
| `auto.competitor_quoted_price` | money + competitor/dealer relation |
| `auto.dealer_price` | money + vehicle/variant relation |
| `auto.discount` | amount/percentage + terms |
| `auto.waiting_period` | duration/range + model/variant |
| `auto.accessories` | entity + requested/offered/included state |

### Commercial and process

| Key | Type / states |
|---|---|
| `auto.exchange_discussed` | boolean/event |
| `auto.exchange_expectation` | money/range |
| `auto.exchange_offer` | money |
| `auto.financing` | discussed/offered/accepted/declined |
| `auto.emi_requirement` | money/range and tenure when stated |
| `auto.down_payment` | money/range |
| `auto.test_drive` | offered, accepted, completed, declined, scheduled |
| `auto.insurance` | discussed/quoted/included and provider/price |
| `auto.warranty` | base/extended, duration, terms |
| `auto.booking` | proposed/committed/completed |
| `auto.follow_up`, `auto.next_action` | owner, action, due precision |

### Automotive objections

- `auto.objection.price`
- `auto.objection.exchange_value`
- `auto.objection.waiting_period`
- `auto.objection.financing`
- `auto.objection.feature_gap`
- `auto.objection.competitor_offer`
- `auto.objection.insurance`
- `auto.objection.service_network`

### Automotive decision drivers and barriers

Automotive specializes the shared `decision.*` definitions with canonical values including `affordability`, `exchange_valuation`, `waiting_period`, `competitor_offer`, `family_decision`, `purchase_timing`, `financing`, and `feature_gap`. The pack may add vehicle-specific values through versioning, but it must preserve the shared distinction between a specific objection, a synthesized conversation barrier/deferral reason, and an authoritative outcome reason.

Examples: `decision.primary_driver = family_requirement`, `decision.purchase_barrier = affordability`, or `decision.reason_for_deferral = family_decision`. Each remains evidence-backed and carries an explicit-versus-inferred basis.

### Automotive outcome events

`lead_created`, `showroom_visit`, `test_drive_scheduled`, `test_drive_completed`, `quotation_issued`, `booked`, `lost`, `delivered`, `cancelled`, and correction/supersession. Revenue, discount, and margin are optional money attributes. `lost` includes a versioned authoritative client reason when supplied. A later event does not delete earlier funnel history, and a conversation-level `decision.purchase_barrier` or `decision.explicit_loss_signal` never substitutes for this event.

### Suggested automotive trackers

- budget discovered;
- intended use/family needs discovered;
- finance discussed/offered;
- test drive offered/completed;
- quoted price extracted;
- exchange discussed and expectation captured;
- waiting period explained;
- insurance/warranty explained;
- competitor/model/price mentioned;
- explicit next step with owner/date agreed;
- conditional: price objection addressed when one occurred.

## Electronics retail pack

### Discovery and customer context

| Key | Type / examples |
|---|---|
| `electronics.use_case` | work, study, gaming, photography, home, travel, gifting |
| `electronics.category` | phone, laptop, TV, appliance, audio, accessory, other configured |
| `electronics.budget` | exact/range money |
| `electronics.feature_requirement` | category-specific canonical entity |
| `electronics.brand_preference` | canonical brand + strength |
| `electronics.purchase_timeline` | date/duration/precision |

### Product, competition, and commercial

| Key | Type / states |
|---|---|
| `electronics.brand`, `electronics.model` | canonical product entities |
| `electronics.competitor_brand` | canonical brand |
| `electronics.competitor_retailer` | online/offline retailer entity |
| `electronics.competitor_price` | money + retailer/product relation |
| `electronics.store_price` | money + product/model relation |
| `electronics.discount_request` | amount/percentage/boolean |
| `electronics.promotion` | offer, bundle, cashback, exchange terms |
| `electronics.financing_emi` | offered/discussed + amount/tenure/rate when stated |
| `electronics.warranty_question` | question topic and response link |
| `electronics.extended_warranty` | offered/accepted/declined + duration/price |
| `electronics.accessory` | discussed/offered/accepted/declined |
| `electronics.cross_sell` | product entity + state |
| `electronics.demo` | offered/completed/declined |
| `electronics.availability` | in stock, out of stock, expected date, alternate offered |

### Electronics objections

- `electronics.objection.online_price`
- `electronics.objection.warranty`
- `electronics.objection.stock`
- `electronics.objection.brand_preference`
- `electronics.objection.financing`
- `electronics.objection.feature_gap`
- `electronics.objection.store_price`
- `electronics.objection.return_policy`

### Electronics decision drivers and barriers

Electronics specializes the shared `decision.*` definitions with canonical values including `online_price`, `stock`, `warranty`, `financing`, `brand_preference`, `purchase_timing`, `needs_more_comparison`, and `feature_gap`. The pack may add category-specific values through versioning while preserving the shared objection/decision-observation/outcome distinction.

Examples: `decision.primary_driver = required_feature`, `decision.purchase_barrier = online_price`, or `decision.reason_for_deferral = needs_more_comparison`. Each remains evidence-backed and carries an explicit-versus-inferred basis.

### Electronics outcome events

`purchased`, `not_purchased`, `follow_up_required`, `reserved`, `cancelled`, and correction/supersession. Optional values are revenue, discount, purchased product/entity, and a versioned authoritative client reason where supplied. Events support multiple conversations per optional opportunity while preserving the original interaction link. Conversation-level decision observations never replace these outcome events.

### Suggested electronics trackers

- use case and budget discovered;
- product/model recommended;
- store and competitor/online price extracted;
- promotion and financing discussed;
- demo offered/completed;
- warranty question answered;
- extended warranty offered;
- stock/availability explained and alternative offered;
- accessory/cross-sell offered;
- explicit next action agreed;
- conditional: online-price objection addressed when one occurred.

## Customization limits

Organizations may add aliases, entities, trackers, scorecards, outcome reason values, and approved custom dimensions. They may not change the meaning of shared stable keys, weaken evidence requirements for high-impact claims, expose other tenants' benchmarks, or add unsupported inference types through configuration alone.

## Pack test fixtures

Each pack ships multilingual/code-mixed fixtures containing positive, negative, uncertain, not-applicable, multiple-product, multiple-price, competitor, question/answer, and objection/handling cases. Numeric exact match, entity linking, evidence span correctness, and speaker attribution are scored separately.
