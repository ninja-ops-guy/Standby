export const PLATFORM_FEE_RATE = 0.12;
export const BOOST_PRICE_CENTS = 199;
export const BOOST_DURATION_HOURS = 24;
export const SIGNUP_BONUS_CENTS = 25000;

export function platformFeeCents(priceCents: number): number {
  return Math.round(priceCents * PLATFORM_FEE_RATE);
}

export function sellerNetCents(priceCents: number): number {
  return priceCents - platformFeeCents(priceCents);
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatMoneyCompact(cents: number): string {
  const abs = Math.abs(cents);
  if (abs >= 1_000_00) return `$${(abs / 100_000).toFixed(1)}k`;
  return `$${Math.round(abs / 100)}`;
}

export function discountPercent(faceValueCents: number, priceCents: number): number {
  if (faceValueCents <= 0) return 0;
  return Math.max(0, Math.round(100 - (priceCents / faceValueCents) * 100));
}

export function timeLeftLabel(target: Date, now = new Date()): string {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) return "started";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
