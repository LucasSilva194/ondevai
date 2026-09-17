const currencyFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amountCents: number): string {
  return currencyFormatter.format(amountCents / 100);
}

export function centsToInputValue(amountCents: number): string {
  return (amountCents / 100).toFixed(2).replace('.', ',');
}

export function parseMoneyToCents(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null;
  }

  const trimmed = value.trim().replace(/[€\s\u00a0]/g, '');
  if (!trimmed) return null;

  let normalized = trimmed;
  if (trimmed.includes(',')) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.');
  }

  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

export function parseNonNegativeMoneyToCents(value: string | number): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  }

  const trimmed = value.trim().replace(/[€\s\u00a0]/g, '');
  if (!trimmed) return 0;
  let normalized = trimmed;
  if (trimmed.includes(',')) normalized = trimmed.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  const cents = Math.round(parsed * 100);
  return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
}
