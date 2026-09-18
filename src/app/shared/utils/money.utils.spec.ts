import { describe, expect, it } from 'vitest';
import { centsToInputValue, formatCurrency, parseMoneyToCents, parseNonNegativeMoneyToCents } from './money.utils';

describe('money utilities', () => {
  it('converte valores portugueses para cêntimos inteiros', () => {
    expect(parseMoneyToCents('12,34')).toBe(1234);
    expect(parseMoneyToCents('1.234,56 €')).toBe(123456);
    expect(parseMoneyToCents('9.5')).toBe(950);
  });

  it('rejeita valores inválidos, negativos e com precisão excessiva', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('-1,00')).toBeNull();
    expect(parseMoneyToCents('1,234')).toBeNull();
    expect(parseMoneyToCents('abc')).toBeNull();
  });

  it('formata cêntimos em EUR e repõe o valor num campo', () => {
    expect(formatCurrency(123456).replace(/\s/g, '')).toContain('1234,56');
    expect(formatCurrency(123456)).toContain('€');
    expect(centsToInputValue(123456)).toBe('1234,56');
  });

  it('aceita zero em campos monetários opcionais', () => {
    expect(parseNonNegativeMoneyToCents('')).toBe(0);
    expect(parseNonNegativeMoneyToCents('0,00')).toBe(0);
    expect(parseNonNegativeMoneyToCents('125,50')).toBe(12550);
    expect(parseNonNegativeMoneyToCents('-1')).toBeNull();
  });
});
