import { describe, expect, it } from 'vitest';
import { Category, Expense, MonthlyIncome } from '../../models/domain.models';
import {
  annualTotal,
  compareWithPreviousMonth,
  incomeTotalForMonth,
  groupByCategory,
  groupBySubcategory,
  monthlyBalanceSeries,
  monthlySeries,
  monthlyTotal,
} from './statistics.utils';

const category: Category = {
  id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false,
  subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }],
};

const expense = (id: string, date: string, amountCents: number, subcategoryId?: string, fixed = false): Expense => ({
  id, date, amountCents, categoryId: 'food', fixed, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  ...(subcategoryId ? { subcategoryId } : {}),
});

const expenses = [
  expense('one', '2026-01-05', 1000, 'supermarket'),
  expense('two', '2026-01-20', 2500),
  expense('three', '2026-02-01', 4200, 'supermarket'),
];

describe('statistics utilities', () => {
  it('calcula totais mensais e anuais sem floating point', () => {
    expect(monthlyTotal(expenses, 2026, 1)).toBe(3500);
    expect(annualTotal(expenses, 2026)).toBe(7700);
    expect(monthlySeries(expenses, 2026).map((point) => point.amountCents).slice(0, 3)).toEqual([3500, 4200, 0]);
  });

  it('compara com o mês anterior e trata a ausência de base', () => {
    expect(compareWithPreviousMonth(expenses, 2026, 2)).toMatchObject({
      currentCents: 4200, previousCents: 3500, differenceCents: 700, percentage: 20, direction: 'up',
    });
    expect(compareWithPreviousMonth(expenses, 2026, 1).direction).toBe('no-baseline');
  });

  it('agrupa por categoria e subcategoria, incluindo valores sem subcategoria', () => {
    expect(groupByCategory(expenses, [category])).toEqual([{
      id: 'food', name: 'Alimentação', color: '#52796f', amountCents: 7700, count: 3,
    }]);
    expect(groupBySubcategory(expenses, [category])).toEqual([
      { id: 'supermarket', name: 'Supermercado', color: '#52796f', amountCents: 5200, count: 2 },
      { id: 'without-subcategory', name: 'Sem subcategoria', color: '#68727d', amountCents: 2500, count: 1 },
    ]);
  });

  it('projeta despesas fixas nos meses seguintes sem duplicar o mês inicial', () => {
    const recurring = expense('rent', '2026-01-31', 80000, undefined, true);
    expect(monthlyTotal([recurring], 2026, 1)).toBe(80000);
    expect(monthlyTotal([recurring], 2026, 2)).toBe(80000);
    expect(monthlyTotal([recurring], 2025, 12)).toBe(0);
    expect(annualTotal([recurring], 2026)).toBe(960000);
  });

  it('calcula rendimentos pontuais, fixos e o saldo mensal', () => {
    const incomes: MonthlyIncome[] = [
      { id: 'salary', name: 'Salário', kind: 'salary', amountCents: 180000, receivedMonth: '2026-01', fixed: true, active: true, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      { id: 'subsidy', name: 'Subsídio', kind: 'subsidy', amountCents: 50000, receivedMonth: '2026-02', fixed: false, active: true, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
    ];
    const rent = expense('rent', '2026-01-05', 70000, undefined, true);
    expect(incomeTotalForMonth(incomes, 2026, 1)).toBe(180000);
    expect(incomeTotalForMonth(incomes, 2026, 2)).toBe(230000);
    expect(incomeTotalForMonth(incomes, 2026, 3)).toBe(180000);
    expect(monthlyBalanceSeries([rent], incomes, 2026).slice(0, 3).map((point) => point.amountCents)).toEqual([110000, 160000, 110000]);
    expect(monthlyBalanceSeries([rent], incomes, 2026, 2).map((point) => point.label)).toEqual(['Jan', 'Fev']);
    expect(monthlyBalanceSeries([rent], incomes, 2026, 0)).toEqual([]);
  });
});
