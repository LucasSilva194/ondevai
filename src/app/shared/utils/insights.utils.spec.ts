import { describe, expect, it } from 'vitest';
import { Category, Expense, MonthlyIncome, SavingsGoal } from '../../models/domain.models';
import { balanceInsights, budgetInsights, categoryGrowthInsights, generateInsights, recurringCommitmentInsight, savingsPlanInsights, unusualExpenseInsights } from './insights.utils';

const category: Category = { id: 'food', name: 'Alimentação', color: '#123456', order: 0, archived: false, subcategories: [] };
const expense = (id: string, date: string, amountCents: number, recurrence = false): Expense => ({ id, date, amountCents, categoryId: 'food', createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, ...(recurrence ? { recurrence: { frequency: 'monthly' as const, interval: 1, startDate: date, status: 'active' as const } } : {}) });
const income = (id: string, date: string, amountCents: number, recurrence = false): MonthlyIncome => ({ id, name: id, kind: 'salary', date, amountCents, createdAt: `${date}T00:00:00.000Z`, updatedAt: `${date}T00:00:00.000Z`, ...(recurrence ? { recurrence: { frequency: 'monthly' as const, interval: 1, startDate: date, status: 'active' as const } } : {}) });
const base = { year: 2026, month: 6, expenses: [] as Expense[], incomes: [] as MonthlyIncome[], categories: [category], budgets: [], exceptions: [], savingsGoals: [] as SavingsGoal[], today: '2026-06-15' };

describe('local insights', () => {
  it('sinaliza orçamentos perto do limite e excedidos', () => {
    const budgets = [{ id: 'budget', month: '2026-06', categoryId: 'food', amountCents: 10000, createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-06-01T00:00:00.000Z' }];
    expect(budgetInsights({ ...base, budgets, expenses: [expense('current', '2026-06-01', 8500)] })[0].id).toContain('attention');
    expect(budgetInsights({ ...base, budgets, expenses: [expense('current', '2026-06-01', 11000)] })[0].id).toContain('exceeded');
  });

  it('deteta crescimento de categoria de pelo menos 20% e 20 euros', () => {
    const result = categoryGrowthInsights({ ...base, expenses: [expense('prior', '2026-05-01', 10000), expense('current', '2026-06-01', 13000)] });
    expect(result[0].explanation).toContain('30%');
  });

  it('deteta uma despesa anormal com cinco comparáveis, dobro da mediana e 25 euros de diferença', () => {
    const history = ['2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01'].map((date, index) => expense(`old-${index}`, date, 2000));
    expect(unusualExpenseInsights({ ...base, expenses: [...history, expense('large', '2026-06-01', 5000)] })[0].id).toContain('unusual');
  });

  it('explica a percentagem do rendimento comprometida com recorrências', () => {
    const result = recurringCommitmentInsight({ ...base, expenses: [expense('rent', '2026-01-05', 60000, true)], incomes: [income('salary', '2026-01-01', 100000, true)] });
    expect(result[0].explanation).toContain('60%');
  });

  it('deteta objetivos cujo reforço não atinge a meta na data', () => {
    const goal: SavingsGoal = { id: 'goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 100000, currentAmountCents: 10000, monthlyContributionCents: 5000, targetDate: '2026-09-30', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
    expect(savingsPlanInsights({ ...base, savingsGoals: [goal] })[0].title).toContain('Reserva');
  });

  it('distingue saldo negativo e melhoria relevante', () => {
    expect(balanceInsights({ ...base, expenses: [expense('current', '2026-06-01', 120000)], incomes: [income('current-income', '2026-06-01', 100000)] }).some((item) => item.id === 'negative-balance')).toBe(true);
    const improved = balanceInsights({ ...base, expenses: [expense('old', '2026-05-01', 90000), expense('new', '2026-06-01', 50000)], incomes: [income('old-income', '2026-05-01', 100000), income('new-income', '2026-06-01', 100000)] });
    expect(improved.some((item) => item.id === 'balance-improvement')).toBe(true);
  });

  it('não produz conclusões sem dados e limita a lista a cinco', () => {
    expect(generateInsights(base)).toEqual([]);
    const manyBudgets = Array.from({ length: 7 }, (_, index) => ({ id: `b${index}`, month: '2026-06', categoryId: `c${index}`, amountCents: 1000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
    const categories = Array.from({ length: 7 }, (_, index): Category => ({ id: `c${index}`, name: `C${index}`, color: '#123456', order: index, archived: false, subcategories: [] }));
    const expenses = categories.map((item, index) => ({ ...expense(`e${index}`, '2026-06-01', 1500), categoryId: item.id }));
    expect(generateInsights({ ...base, budgets: manyBudgets, categories, expenses })).toHaveLength(5);
  });
});
