import { describe, expect, it } from 'vitest';
import { Expense, RecurrenceException } from '../../models/domain.models';
import { materializeExpenses, occurrenceDatesBetween } from './recurrence.utils';

describe('recurrence utilities', () => {
  it('gera recorrências semanais com intervalo', () => {
    expect(occurrenceDatesBetween({ frequency: 'weekly', interval: 2, startDate: '2026-01-01', status: 'active' }, '2026-01-01', '2026-02-01'))
      .toEqual(['2026-01-01', '2026-01-15', '2026-01-29']);
  });

  it('usa o último dia válido nas recorrências mensais', () => {
    expect(occurrenceDatesBetween({ frequency: 'monthly', interval: 1, startDate: '2026-01-31', status: 'active' }, '2026-01-01', '2026-04-30'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
  });

  it('ajusta 29 de fevereiro e respeita o fim inclusivo', () => {
    expect(occurrenceDatesBetween({ frequency: 'yearly', interval: 1, startDate: '2024-02-29', endDate: '2026-02-28', status: 'active' }, '2024-01-01', '2027-12-31'))
      .toEqual(['2024-02-29', '2025-02-28', '2026-02-28']);
  });

  it('preserva o histórico anterior à pausa', () => {
    expect(occurrenceDatesBetween({ frequency: 'monthly', interval: 1, startDate: '2026-01-10', status: 'paused', pausedFrom: '2026-03-10' }, '2026-01-01', '2026-05-31'))
      .toEqual(['2026-01-10', '2026-02-10']);
  });

  it('aplica exceções editadas e omitidas sem dupla contabilização', () => {
    const expense: Expense = { id: 'series', date: '2026-01-10', amountCents: 1000, categoryId: 'food', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-01-10', status: 'active' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const exceptions: RecurrenceException[] = [
      { id: 'edit', seriesType: 'expense', seriesId: 'series', occurrenceDate: '2026-02-10', action: 'override', changes: { amountCents: 2500 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'skip', seriesType: 'expense', seriesId: 'series', occurrenceDate: '2026-03-10', action: 'skip', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    ];
    const occurrences = materializeExpenses([expense], exceptions, '2026-01-01', '2026-03-31');
    expect(occurrences.map((item) => [item.date, item.amountCents, item.source])).toEqual([
      ['2026-02-10', 2500, 'override'],
      ['2026-01-10', 1000, 'series'],
    ]);
    expect(occurrences.reduce((total, item) => total + item.amountCents, 0)).toBe(3500);
  });
});
