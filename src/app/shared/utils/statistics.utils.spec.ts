import { describe, expect, it } from 'vitest';
import { Category, Expense, MonthlyBudget, MonthlyIncome } from '../../models/domain.models';
import {
  annualTotal,
  averagePreviousThreeMonths,
  calculateBudgetSummary,
  compareAmounts,
  compareWithPreviousMonth,
  groupByCategory,
  groupBySubcategory,
  incomeTotalForMonth,
  monthlyBalanceSeries,
  monthlySeries,
  monthlyTotal,
} from './statistics.utils';

const category: Category = { id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }] };
const expense = (id: string, date: string, amountCents: number, subcategoryId?: string): Expense => ({ id, date, amountCents, categoryId: 'food', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, ...(subcategoryId ? { subcategoryId } : {}) });
const income = (id: string, date: string, amountCents: number): MonthlyIncome => ({ id, name: id, kind: 'salary', amountCents, date, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z` });

describe('statistics utilities', () => {
  const expenses = [expense('one', '2026-01-05', 1000, 'supermarket'), expense('two', '2026-01-20', 2500), expense('three', '2026-02-01', 4200, 'supermarket')];

  it('calcula totais mensais, anuais e agrupamentos sem floating point', () => {
    expect(monthlyTotal(expenses, 2026, 1)).toBe(3500);
    expect(annualTotal(expenses, 2026)).toBe(7700);
    expect(monthlySeries(expenses, 2026).slice(0, 3).map((point) => point.amountCents)).toEqual([3500, 4200, 0]);
    expect(groupByCategory(expenses, [category])[0].amountCents).toBe(7700);
    expect(groupBySubcategory(expenses, [category]).map((item) => item.amountCents)).toEqual([5200, 2500]);
  });

  it('compara janeiro com dezembro do ano anterior', () => {
    const values = [expense('dec', '2025-12-03', 2000), expense('jan', '2026-01-03', 3000)];
    expect(compareWithPreviousMonth(values, 2026, 1)).toMatchObject({ previousCents: 2000, currentCents: 3000, percentage: 50, direction: 'up' });
  });

  it('não inventa percentagens sem base anterior', () => {
    expect(compareAmounts(5000, 0)).toMatchObject({ percentage: null, direction: 'no-baseline' });
    expect(compareAmounts(0, 0)).toMatchObject({ percentage: null, direction: 'same' });
  });

  it('calcula a média dos três meses anteriores apenas com dados suficientes', () => {
    const values = [expense('jan', '2026-01-01', 3000), expense('feb', '2026-02-01', 6000), expense('mar', '2026-03-01', 9000)];
    const incomes = [income('ijan', '2026-01-01', 12000), income('ifeb', '2026-02-01', 15000), income('imar', '2026-03-01', 18000)];
    expect(averagePreviousThreeMonths(values, incomes, [], 2026, 4)).toEqual({ expensesCents: 6000, incomesCents: 15000, balanceCents: 9000 });
    expect(averagePreviousThreeMonths(values, incomes, [], 2026, 3)).toBeNull();
  });

  it('calcula rendimentos e saldo mensal pela mesma fonte de ocorrências', () => {
    const incomes: MonthlyIncome[] = [{ ...income('salary', '2026-01-01', 180000), recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-01-01', status: 'active' } }];
    const rent: Expense = { ...expense('rent', '2026-01-05', 70000), recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-01-05', status: 'active' } };
    expect(incomeTotalForMonth(incomes, 2026, 3)).toBe(180000);
    expect(monthlyBalanceSeries([rent], incomes, 2026, 2).map((point) => point.amountCents)).toEqual([110000, 110000]);
  });

  it('calcula gasto, orçamento, restante e estados por categoria', () => {
    const budget: MonthlyBudget = { id: 'budget', month: '2026-01', categoryId: 'food', amountCents: 10000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    const summary = calculateBudgetSummary([budget], [expense('spent', '2026-01-01', 8500)], [category]);
    expect(summary).toMatchObject({ totalBudgetedCents: 10000, totalSpentCents: 8500, remainingCents: 1500, usedPercentage: 85 });
    expect(summary.rows[0].status).toBe('attention');
  });
});
