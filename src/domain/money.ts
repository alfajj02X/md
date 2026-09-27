/**
 * Money utilities for Mechanic Dekho.
 *
 * ABSOLUTE RULE: every authoritative monetary value is an integer number of
 * paise. Never persist or transmit authoritative INR amounts as floats.
 * Floats appear only at the display boundary (paiseToDisplay / paiseToRupees).
 */

/** Assert a value is a safe integer paise amount. */
export function assertIntegerPaise(value: number, name = 'amount'): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} must be an integer number of paise, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`${name} must not be negative, got ${value}`);
  }
}

/** Convert rupees (possibly fractional, e.g. 49.5) to integer paise. */
export function rupeesToPaise(rupees: number): number {
  if (!Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`Invalid rupees amount: ${rupees}`);
  }
  return Math.round(rupees * 100);
}

/** Convert integer paise to a float rupee value for display math only. */
export function paiseToRupees(paise: number): number {
  assertIntegerPaise(paise);
  return paise / 100;
}

/**
 * Format integer paise as an Indian display string, e.g. 4900 -> "₹49.00".
 * Uses en-IN digit grouping (1,00,000).
 */
export function paiseToDisplay(paise: number): string {
  assertIntegerPaise(paise);
  const formatted = (paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `\u20B9${formatted}`;
}

/** Short display without decimals when the amount is whole rupees, e.g. "₹49". */
export function paiseToDisplayShort(paise: number): string {
  assertIntegerPaise(paise);
  if (paise % 100 === 0) {
    return `\u20B9${(paise / 100).toLocaleString('en-IN')}`;
  }
  return paiseToDisplay(paise);
}

/** Sum paise amounts. */
export function addPaise(...amounts: number[]): number {
  let total = 0;
  for (const a of amounts) {
    assertIntegerPaise(a);
    total += a;
    if (!Number.isSafeInteger(total)) throw new Error('Paise sum overflow');
  }
  return total;
}

/** Subtract paise amounts; result must not go negative. */
export function subtractPaise(a: number, b: number): number {
  assertIntegerPaise(a, 'minuend');
  assertIntegerPaise(b, 'subtrahend');
  const result = a - b;
  if (result < 0) throw new Error(`Paise subtraction would go negative: ${a} - ${b}`);
  return result;
}

/**
 * Compute `bps` basis points of an amount (bps in 0..10000).
 * 1000 bps = 10%. Rounds to the nearest paise.
 */
export function bpsOf(amountPaise: number, bps: number): number {
  assertIntegerPaise(amountPaise);
  if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
    throw new Error(`bps must be an integer in 0..10000, got ${bps}`);
  }
  return Math.round((amountPaise * bps) / 10000);
}

/** Itemized provider charges submitted for customer approval. All paise. */
export interface ItemizedAmount {
  labourPaise: number;
  partsPaise: number;
  additionalPaise: number;
  discountPaise: number;
}

/** Validate and total an itemized amount. Discount is capped at the subtotal. */
export function totalItemized(item: ItemizedAmount): number {
  const { labourPaise, partsPaise, additionalPaise, discountPaise } = item;
  assertIntegerPaise(labourPaise, 'labourPaise');
  assertIntegerPaise(partsPaise, 'partsPaise');
  assertIntegerPaise(additionalPaise, 'additionalPaise');
  assertIntegerPaise(discountPaise, 'discountPaise');
  const subtotal = addPaise(labourPaise, partsPaise, additionalPaise);
  if (subtotal === 0 && discountPaise > 0) {
    throw new Error('Discount on a zero subtotal is not allowed');
  }
  if (discountPaise > subtotal) {
    throw new Error(`Discount ${discountPaise} exceeds subtotal ${subtotal}`);
  }
  return subtotal - discountPaise;
}

/** Split a service total into platform commission and provider net. */
export function computePayout(
  serviceTotalPaise: number,
  commissionBps: number,
): { commissionPaise: number; providerNetPaise: number } {
  assertIntegerPaise(serviceTotalPaise, 'serviceTotalPaise');
  const commissionPaise = bpsOf(serviceTotalPaise, commissionBps);
  return { commissionPaise, providerNetPaise: serviceTotalPaise - commissionPaise };
}
