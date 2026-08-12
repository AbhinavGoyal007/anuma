/**
 * Turning a spoken money amount into a stored one.
 *
 * People do not say "three million five hundred thousand rupees". In India they
 * say "pandrah lakh", "ek crore", "35 lakh something" — a number and a scale
 * word, and the scale word carries almost all of the magnitude. Recording the
 * number alone stores ₹35 where the customer meant ₹35,00,000, and every
 * average, price band and rupee total built on top is then wrong by a factor of
 * a hundred thousand.
 *
 * The model reports what it heard: the number, and which scale word was spoken.
 * The multiplication happens here, where it is deterministic and testable —
 * never in the model, which has no business doing arithmetic on money.
 */

export const amountScales = ["unit", "thousand", "lakh", "million", "crore", "billion"] as const;

export type AmountScale = (typeof amountScales)[number];

const SCALE_MULTIPLIER: Readonly<Record<AmountScale, number>> = {
  unit: 1,
  thousand: 1_000,
  lakh: 100_000,
  million: 1_000_000,
  crore: 10_000_000,
  billion: 1_000_000_000,
};

/** Currencies this product stores, with their minor-unit exponent. */
const CURRENCY_EXPONENT: Readonly<Record<string, number>> = { AED: 2, INR: 2 };

/**
 * The full major-unit amount, with the spoken scale applied.
 *
 * Returns null when there is no usable number, so a missing amount stays
 * missing rather than becoming zero — an observation with no price is not an
 * observation of a free product.
 */
export function scaledMajor(amountMajor: number | null, scale: AmountScale | null): number | null {
  if (amountMajor === null || !Number.isFinite(amountMajor) || amountMajor < 0) return null;
  return amountMajor * SCALE_MULTIPLIER[scale ?? "unit"];
}

/**
 * The value as stored: minor units of the given currency, scale applied.
 *
 * An unknown currency returns null rather than guessing, because a number
 * without a currency is not money.
 */
export function amountToMinor(
  amountMajor: number | null,
  scale: AmountScale | null,
  currency: string | null,
): number | null {
  const major = scaledMajor(amountMajor, scale);
  if (major === null || !currency) return null;
  const exponent = CURRENCY_EXPONENT[currency];
  return exponent === undefined ? null : Math.round(major * 10 ** exponent);
}
