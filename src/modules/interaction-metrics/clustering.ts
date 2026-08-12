/**
 * Deterministic clustering for the free-text fields.
 *
 * Objections and timing come out of the model as sentences — "too heavy to
 * carry to college", "we'll decide after Diwali" — which do not roll up: every
 * one is its own bucket. Until a controlled vocabulary exists, a keyword map
 * folds them into a handful of categories a dashboard can count.
 *
 * This is honest about being approximate. It is a pure function so it can be
 * tested and improved in one place, and it works across English, Hindi and
 * code-mixed text because it matches on the words that actually recur in Indian
 * retail conversations, in both scripts.
 */

type Rule = { category: string; patterns: RegExp[] };

/** First matching rule wins, so the more specific categories come first. */
const OBJECTION_RULES: Rule[] = [
  {
    category: "price / budget",
    patterns: [
      /price|expensive|costl|afford|budget|over.?budget|बजट|meheng|महंग|महंगा|ज्यादा (है|hai)|dear|too much/i,
    ],
  },
  {
    category: "finance / EMI",
    patterns: [/emi|installment|instalment|loan|down.?payment|finance|किश्त|क़िस्त/i],
  },
  {
    category: "weight / size",
    patterns: [/heav|weight|bulky|too big|too large|size|bhaari|भारी|portab|carry/i],
  },
  {
    category: "stock / delivery",
    patterns: [/stock|availab|out of stock|deliver|wait|lead time|kab mileg|कब मिलेग|possession/i],
  },
  {
    category: "warranty / service",
    patterns: [/warrant|guarantee|service|repair|after.?sales|support/i],
  },
  {
    category: "competitor / cheaper elsewhere",
    patterns: [/amazon|flipkart|croma|online|cheaper|kam (mein|me)|sasta|सस्ता|elsewhere/i],
  },
  {
    category: "trust / quality",
    patterns: [/trust|doubt|reliab|quality|durab|genuine|fake|bharosa|भरोसा/i],
  },
];

const TIMING_RULES: Rule[] = [
  {
    category: "immediate",
    patterns: [/today|right now|abhi|turant|तुरंत|अभी|this week|is hafte|इस हफ्ते/i],
  },
  {
    category: "within days",
    patterns: [/tomorrow|day after|weekend|saturday|sunday|kal|parso|परसों|कल|few days|couple of days/i],
  },
  {
    category: "later / after event",
    patterns: [/after|next month|festival|diwali|dussehra|salary|baad|बाद|later|month end/i],
  },
  {
    category: "just exploring",
    patterns: [/just look|explor|research|dekh rah|देख रह|browsing|comparing|window/i],
  },
];

/**
 * Recurring topics that cut across fields.
 *
 * A theme is a curated topic a category head watches — battery, portability,
 * price — and a single utterance can touch several, so this returns every theme
 * that matches rather than one. It is the interim before embeddings: the guide
 * defers vector search and forbids an LLM computing counts, so themes are a
 * controlled vocabulary matched deterministically, and the counts stay code's.
 */
const THEME_RULES: Rule[] = [
  {
    category: "performance",
    patterns: [
      /perform|fast|speed|processor|\bcpu\b|\bi9\b|\bi7\b|\bi5\b|ryzen|\brtx\b|\bgpu\b|graphics|powerful|render|\bediting\b|\blag\b/i,
    ],
  },
  {
    category: "portability / weight",
    patterns: [/light|weight|portab|carry|slim|\bthin\b|heav|bhaari|भारी|travel|commute|compact/i],
  },
  {
    category: "battery life",
    patterns: [/batter|backup|back-up|बैटरी|all.?day|hours? of (use|backup)/i],
  },
  {
    category: "price / budget",
    patterns: [
      /price|budget|expensiv|afford|\bcheap|meheng|mehng|महंग|बजट|sasta|सस्ता|discount|\bdeal\b|value for money|over.?budget/i,
    ],
  },
  { category: "gaming", patterns: [/gaming|\bgame\b|\bfps\b|valorant|\bgta\b|aaa titles?/i] },
  {
    category: "display",
    patterns: [/display|screen|\bpanel\b|resolution|oled|\bips\b|refresh|\bnits\b|colour accura|color accura/i],
  },
  { category: "storage", patterns: [/storage|\bssd\b|\btb\b|hard disk|\bhdd\b|\bspace\b/i] },
  {
    category: "warranty / service",
    patterns: [/warrant|guarantee|service|repair|after.?sales|\bsupport\b/i],
  },
  {
    category: "financing / EMI",
    patterns: [/\bemi\b|finance|\bloan\b|installment|instalment|no.?cost|tenure|किश्त|cashback|(bank|card) offer/i],
  },
  {
    category: "stock / availability",
    patterns: [/stock|availab|out of stock|deliver|possession|lead time/i],
  },
  {
    category: "online comparison",
    patterns: [/amazon|flipkart|\bonline\b|croma|website|cheaper (online|elsewhere)/i],
  },
  {
    category: "work / productivity",
    patterns: [
      /office|\bwork\b|excel|power ?bi|coding|program|professional|productiv|python|solidworks|\bcad\b|lightroom|photoshop|multitask/i,
    ],
  },
  { category: "college / study", patterns: [/college|student|\bstudy\b|university|semester|assignment/i] },
  { category: "location / area", patterns: [/locality|\barea\b|\bmetro\b|school|facing|\bfloor\b|connectivity|\broad\b/i] },
];

/** Every curated theme a piece of free text touches; empty when none match. */
export function clusterThemes(text: string | null): string[] {
  if (!text) return [];
  return THEME_RULES.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map(
    (rule) => rule.category,
  );
}

function classify(text: string | null, rules: Rule[], fallback: string): string {
  if (!text) return fallback;
  for (const rule of rules) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.category;
  }
  return fallback;
}

export function clusterObjection(text: string | null): string {
  return classify(text, OBJECTION_RULES, "other");
}

export function clusterTiming(text: string | null): string {
  return classify(text, TIMING_RULES, "unspecified");
}
