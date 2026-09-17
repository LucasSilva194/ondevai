import { Category, Expense } from '../../models/domain.models';

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

export function expensesForMonth(expenses: readonly Expense[], year: number, month: number): Expense[] {
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  return expenses.filter((expense) => expense.date.startsWith(prefix));
}

export function expensesForYear(expenses: readonly Expense[], year: number): Expense[] {
  return expenses.filter((expense) => expense.date.startsWith(`${year}-`));
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
