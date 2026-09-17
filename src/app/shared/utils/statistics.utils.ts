import { Category, Expense, MonthlyIncome } from '../../models/domain.models';

export interface TotalGroup {
  id: string;
  name: string;
  amountCents: number;
  count: number;
  color?: string;
}

export interface MonthPoint {
  month: number;
  label: string;
  amountCents: number;
}

export interface MonthComparison {
  currentCents: number;
  previousCents: number;
  differenceCents: number;
  percentage: number | null;
  direction: 'up' | 'down' | 'same' | 'no-baseline';
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export function sumExpenses(expenses: readonly Expense[]): number {
  return expenses.reduce((total, expense) => total + expense.amountCents, 0);
}

export function sumIncomes(incomes: readonly MonthlyIncome[]): number {
  return incomes.reduce((total, income) => total + income.amountCents, 0);
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function expenseOccurrence(expense: Expense, year: number, month: number): Expense {
  const day = Math.min(Number(expense.date.slice(8, 10)), new Date(year, month, 0).getDate());
  return {
    ...expense,
    id: `${expense.id}:${monthKey(year, month)}`,
    date: `${monthKey(year, month)}-${String(day).padStart(2, '0')}`,
  };
}

export function expensesForMonth(expenses: readonly Expense[], year: number, month: number): Expense[] {
  const targetMonth = monthKey(year, month);
  return expenses.flatMap((expense) => {
    const expenseMonth = expense.date.slice(0, 7);
    if (expenseMonth === targetMonth) return [expense];
    if (expense.fixed && expenseMonth < targetMonth) return [expenseOccurrence(expense, year, month)];
    return [];
  });
}

export function expensesForYear(expenses: readonly Expense[], year: number): Expense[] {
  return MONTH_NAMES.flatMap((_, index) => expensesForMonth(expenses, year, index + 1));
}

export function incomesForMonth(incomes: readonly MonthlyIncome[], year: number, month: number): MonthlyIncome[] {
  const targetMonth = monthKey(year, month);
  return incomes.filter((income) => income.active
    && (income.receivedMonth === targetMonth || (income.fixed && income.receivedMonth < targetMonth)));
}

export function incomeTotalForMonth(incomes: readonly MonthlyIncome[], year: number, month: number): number {
  return sumIncomes(incomesForMonth(incomes, year, month));
}

export function annualIncomeTotal(incomes: readonly MonthlyIncome[], year: number): number {
  return MONTH_NAMES.reduce((total, _, index) => total + incomeTotalForMonth(incomes, year, index + 1), 0);
}

export function monthlyTotal(expenses: readonly Expense[], year: number, month: number): number {
  return sumExpenses(expensesForMonth(expenses, year, month));
}

export function annualTotal(expenses: readonly Expense[], year: number): number {
  return sumExpenses(expensesForYear(expenses, year));
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function compareWithPreviousMonth(
  expenses: readonly Expense[],
  year: number,
  month: number,
): MonthComparison {
  const currentCents = monthlyTotal(expenses, year, month);
  const previous = previousMonth(year, month);
  const previousCents = monthlyTotal(expenses, previous.year, previous.month);
  const differenceCents = currentCents - previousCents;

  if (previousCents === 0) {
    return {
      currentCents,
      previousCents,
      differenceCents,
      percentage: null,
      direction: currentCents === 0 ? 'same' : 'no-baseline',
    };
  }

  return {
    currentCents,
    previousCents,
    differenceCents,
    percentage: Math.round((differenceCents / previousCents) * 1000) / 10,
    direction: differenceCents > 0 ? 'up' : differenceCents < 0 ? 'down' : 'same',
  };
}

export function monthlySeries(expenses: readonly Expense[], year: number): MonthPoint[] {
  return MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    label: label.slice(0, 3),
    amountCents: monthlyTotal(expenses, year, index + 1),
  }));
}

export function monthlyBalanceSeries(
  expenses: readonly Expense[],
  incomes: readonly MonthlyIncome[],
  year: number,
  throughMonth = 12,
): MonthPoint[] {
  const visibleMonths = Math.max(0, Math.min(12, throughMonth));
  return MONTH_NAMES.slice(0, visibleMonths).map((label, index) => ({
    month: index + 1,
    label: label.slice(0, 3),
    amountCents: incomeTotalForMonth(incomes, year, index + 1) - monthlyTotal(expenses, year, index + 1),
  }));
}

export function groupByCategory(expenses: readonly Expense[], categories: readonly Category[]): TotalGroup[] {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const totals = new Map<string, TotalGroup>();

  for (const expense of expenses) {
    const category = categoryMap.get(expense.categoryId);
    const existing = totals.get(expense.categoryId);
    totals.set(expense.categoryId, {
      id: expense.categoryId,
      name: category?.name ?? 'Categoria indisponível',
      color: category?.color ?? '#68727d',
      amountCents: (existing?.amountCents ?? 0) + expense.amountCents,
      count: (existing?.count ?? 0) + 1,
    });
  }

  return [...totals.values()].sort((a, b) => b.amountCents - a.amountCents);
}

export function groupBySubcategory(expenses: readonly Expense[], categories: readonly Category[]): TotalGroup[] {
  const subcategoryMap = new Map<string, { name: string; color: string }>();
  for (const category of categories) {
    for (const subcategory of category.subcategories) {
      subcategoryMap.set(subcategory.id, { name: subcategory.name, color: category.color });
    }
  }

  const totals = new Map<string, TotalGroup>();
  for (const expense of expenses) {
    const id = expense.subcategoryId ?? 'without-subcategory';
    const subcategory = expense.subcategoryId ? subcategoryMap.get(expense.subcategoryId) : undefined;
    const existing = totals.get(id);
    totals.set(id, {
      id,
      name: subcategory?.name ?? 'Sem subcategoria',
      color: subcategory?.color ?? '#68727d',
      amountCents: (existing?.amountCents ?? 0) + expense.amountCents,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return [...totals.values()].sort((a, b) => b.amountCents - a.amountCents);
}
