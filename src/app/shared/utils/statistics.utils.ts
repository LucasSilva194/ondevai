import {
  Category,
  Expense,
  ExpenseOccurrence,
  IncomeOccurrence,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
} from '../../models/domain.models';
import { materializeExpenses, materializeIncomes } from './recurrence.utils';

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

export interface PeriodComparisons {
  expenses: MonthComparison;
  incomes: MonthComparison;
  balance: MonthComparison;
}

export interface ThreeMonthAverage {
  expensesCents: number;
  incomesCents: number;
  balanceCents: number;
}

export type BudgetStatus = 'normal' | 'attention' | 'exceeded';

export interface BudgetProgress {
  budget: MonthlyBudget;
  categoryName: string;
  categoryColor: string;
  categoryArchived: boolean;
  spentCents: number;
  remainingCents: number;
  usedPercentage: number;
  status: BudgetStatus;
}

export interface BudgetSummary {
  totalBudgetedCents: number;
  totalSpentCents: number;
  remainingCents: number;
  usedPercentage: number;
  rows: BudgetProgress[];
  categoriesWithoutBudget: Category[];
  nearLimit: BudgetProgress[];
  exceeded: BudgetProgress[];
}

export const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
] as const;

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const key = monthKey(year, month);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${key}-01`, to: `${key}-${String(lastDay).padStart(2, '0')}` };
}

export function sumExpenses(expenses: readonly Pick<Expense, 'amountCents'>[]): number {
  return expenses.reduce((total, expense) => total + expense.amountCents, 0);
}

export function sumIncomes(incomes: readonly Pick<MonthlyIncome, 'amountCents'>[]): number {
  return incomes.reduce((total, income) => total + income.amountCents, 0);
}

export function expensesForMonth(
  expenses: readonly Expense[],
  year: number,
  month: number,
  exceptions: readonly RecurrenceException[] = [],
): ExpenseOccurrence[] {
  const bounds = monthBounds(year, month);
  return materializeExpenses(expenses, exceptions, bounds.from, bounds.to);
}

export function expensesForYear(
  expenses: readonly Expense[],
  year: number,
  exceptions: readonly RecurrenceException[] = [],
): ExpenseOccurrence[] {
  return materializeExpenses(expenses, exceptions, `${year}-01-01`, `${year}-12-31`);
}

export function incomesForMonth(
  incomes: readonly MonthlyIncome[],
  year: number,
  month: number,
  exceptions: readonly RecurrenceException[] = [],
): IncomeOccurrence[] {
  const bounds = monthBounds(year, month);
  return materializeIncomes(incomes, exceptions, bounds.from, bounds.to);
}

export function incomeTotalForMonth(
  incomes: readonly MonthlyIncome[],
  year: number,
  month: number,
  exceptions: readonly RecurrenceException[] = [],
): number {
  return sumIncomes(incomesForMonth(incomes, year, month, exceptions));
}

export function annualIncomeTotal(
  incomes: readonly MonthlyIncome[],
  year: number,
  exceptions: readonly RecurrenceException[] = [],
): number {
  return MONTH_NAMES.reduce((total, _, index) => total + incomeTotalForMonth(incomes, year, index + 1, exceptions), 0);
}

export function monthlyTotal(
  expenses: readonly Expense[],
  year: number,
  month: number,
  exceptions: readonly RecurrenceException[] = [],
): number {
  return sumExpenses(expensesForMonth(expenses, year, month, exceptions));
}

export function annualTotal(
  expenses: readonly Expense[],
  year: number,
  exceptions: readonly RecurrenceException[] = [],
): number {
  return sumExpenses(expensesForYear(expenses, year, exceptions));
}

export function previousMonth(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function compareAmounts(currentCents: number, previousCents: number): MonthComparison {
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
    percentage: Math.round((differenceCents / Math.abs(previousCents)) * 1000) / 10,
    direction: differenceCents > 0 ? 'up' : differenceCents < 0 ? 'down' : 'same',
  };
}

export function compareWithPreviousMonth(
  expenses: readonly Expense[],
  year: number,
  month: number,
  exceptions: readonly RecurrenceException[] = [],
): MonthComparison {
  const previous = previousMonth(year, month);
  return compareAmounts(
    monthlyTotal(expenses, year, month, exceptions),
    monthlyTotal(expenses, previous.year, previous.month, exceptions),
  );
}

export function comparePeriods(
  expenses: readonly Expense[],
  incomes: readonly MonthlyIncome[],
  exceptions: readonly RecurrenceException[],
  year: number,
  month: number,
): PeriodComparisons {
  const previous = previousMonth(year, month);
  const currentExpenses = monthlyTotal(expenses, year, month, exceptions);
  const previousExpenses = monthlyTotal(expenses, previous.year, previous.month, exceptions);
  const currentIncomes = incomeTotalForMonth(incomes, year, month, exceptions);
  const previousIncomes = incomeTotalForMonth(incomes, previous.year, previous.month, exceptions);
  return {
    expenses: compareAmounts(currentExpenses, previousExpenses),
    incomes: compareAmounts(currentIncomes, previousIncomes),
    balance: compareAmounts(currentIncomes - currentExpenses, previousIncomes - previousExpenses),
  };
}

export function averagePreviousThreeMonths(
  expenses: readonly Expense[],
  incomes: readonly MonthlyIncome[],
  exceptions: readonly RecurrenceException[],
  year: number,
  month: number,
): ThreeMonthAverage | null {
  const periods: Array<{ expenses: number; incomes: number }> = [];
  let cursor = { year, month };
  for (let index = 0; index < 3; index += 1) {
    cursor = previousMonth(cursor.year, cursor.month);
    const expenseOccurrences = expensesForMonth(expenses, cursor.year, cursor.month, exceptions);
    const incomeOccurrences = incomesForMonth(incomes, cursor.year, cursor.month, exceptions);
    if (expenseOccurrences.length === 0 && incomeOccurrences.length === 0) return null;
    periods.push({ expenses: sumExpenses(expenseOccurrences), incomes: sumIncomes(incomeOccurrences) });
  }
  const expensesCents = Math.round(periods.reduce((total, period) => total + period.expenses, 0) / 3);
  const incomesCents = Math.round(periods.reduce((total, period) => total + period.incomes, 0) / 3);
  return { expensesCents, incomesCents, balanceCents: incomesCents - expensesCents };
}

export function monthlySeries(
  expenses: readonly Expense[],
  year: number,
  exceptions: readonly RecurrenceException[] = [],
): MonthPoint[] {
  return MONTH_NAMES.map((label, index) => ({
    month: index + 1,
    label: label.slice(0, 3),
    amountCents: monthlyTotal(expenses, year, index + 1, exceptions),
  }));
}

export function monthlyBalanceSeries(
  expenses: readonly Expense[],
  incomes: readonly MonthlyIncome[],
  year: number,
  throughMonth = 12,
  exceptions: readonly RecurrenceException[] = [],
): MonthPoint[] {
  const visibleMonths = Math.max(0, Math.min(12, throughMonth));
  return MONTH_NAMES.slice(0, visibleMonths).map((label, index) => ({
    month: index + 1,
    label: label.slice(0, 3),
    amountCents: incomeTotalForMonth(incomes, year, index + 1, exceptions)
      - monthlyTotal(expenses, year, index + 1, exceptions),
  }));
}

export function groupByCategory(
  expenses: readonly Pick<Expense, 'categoryId' | 'amountCents'>[],
  categories: readonly Category[],
): TotalGroup[] {
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

export function groupBySubcategory(
  expenses: readonly Pick<Expense, 'subcategoryId' | 'amountCents'>[],
  categories: readonly Category[],
): TotalGroup[] {
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

export function calculateBudgetSummary(
  budgets: readonly MonthlyBudget[],
  expenses: readonly Pick<Expense, 'categoryId' | 'amountCents'>[],
  categories: readonly Category[],
): BudgetSummary {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const spentByCategory = new Map<string, number>();
  for (const expense of expenses) {
    spentByCategory.set(expense.categoryId, (spentByCategory.get(expense.categoryId) ?? 0) + expense.amountCents);
  }
  const rows = budgets.map((budget): BudgetProgress => {
    const category = categoryMap.get(budget.categoryId);
    const spentCents = spentByCategory.get(budget.categoryId) ?? 0;
    const usedPercentage = Math.round((spentCents / budget.amountCents) * 1000) / 10;
    const status: BudgetStatus = usedPercentage >= 100 ? 'exceeded' : usedPercentage >= 80 ? 'attention' : 'normal';
    return {
      budget,
      categoryName: category?.name ?? 'Categoria indisponível',
      categoryColor: category?.color ?? '#68727d',
      categoryArchived: category?.archived ?? true,
      spentCents,
      remainingCents: budget.amountCents - spentCents,
      usedPercentage,
      status,
    };
  }).sort((a, b) => b.usedPercentage - a.usedPercentage || a.categoryName.localeCompare(b.categoryName, 'pt-PT'));
  const budgetedIds = new Set(budgets.map((budget) => budget.categoryId));
  const totalBudgetedCents = budgets.reduce((total, budget) => total + budget.amountCents, 0);
  const totalSpentCents = expenses.reduce((total, expense) => total + expense.amountCents, 0);
  return {
    totalBudgetedCents,
    totalSpentCents,
    remainingCents: totalBudgetedCents - totalSpentCents,
    usedPercentage: totalBudgetedCents > 0 ? Math.round((totalSpentCents / totalBudgetedCents) * 1000) / 10 : 0,
    rows,
    categoriesWithoutBudget: categories.filter((category) => !category.archived && !budgetedIds.has(category.id)),
    nearLimit: rows.filter((row) => row.status === 'attention'),
    exceeded: rows.filter((row) => row.status === 'exceeded'),
  };
}
