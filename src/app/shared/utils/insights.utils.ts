import {
  Category,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
} from '../../models/domain.models';
import { materializeExpenses } from './recurrence.utils';
import {
  calculateBudgetSummary,
  comparePeriods,
  expensesForMonth,
  groupByCategory,
  incomesForMonth,
  monthBounds,
  monthKey,
  previousMonth,
  sumExpenses,
  sumIncomes,
} from './statistics.utils';

export type InsightTone = 'critical' | 'warning' | 'positive' | 'informative';

export interface Insight {
  id: string;
  title: string;
  explanation: string;
  tone: InsightTone;
  priority: number;
}

export interface InsightInput {
  year: number;
  month: number;
  expenses: readonly Expense[];
  incomes: readonly MonthlyIncome[];
  categories: readonly Category[];
  budgets: readonly MonthlyBudget[];
  exceptions: readonly RecurrenceException[];
  savingsGoals: readonly SavingsGoal[];
  today?: string;
}

function formatEuros(cents: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

export function budgetInsights(input: InsightInput): Insight[] {
  const key = monthKey(input.year, input.month);
  const monthExpenses = expensesForMonth(input.expenses, input.year, input.month, input.exceptions);
  const summary = calculateBudgetSummary(input.budgets.filter((budget) => budget.month === key), monthExpenses, input.categories);
  return summary.rows.filter((row) => row.status !== 'normal').map((row) => ({
    id: `budget-${row.status}-${row.budget.categoryId}`,
    title: row.status === 'exceeded' ? `${row.categoryName} ultrapassou o orçamento` : `${row.categoryName} está perto do limite`,
    explanation: row.status === 'exceeded'
      ? `Foram usados ${row.usedPercentage}% do limite, mais ${formatEuros(Math.abs(row.remainingCents))} do que o planeado.`
      : `Foram usados ${row.usedPercentage}% do limite; restam ${formatEuros(row.remainingCents)}.`,
    tone: row.status === 'exceeded' ? 'critical' : 'warning',
    priority: row.status === 'exceeded' ? 100 : 82,
  }));
}

export function categoryGrowthInsights(input: InsightInput): Insight[] {
  const previous = previousMonth(input.year, input.month);
  const currentGroups = groupByCategory(expensesForMonth(input.expenses, input.year, input.month, input.exceptions), input.categories);
  const previousGroups = new Map(groupByCategory(
    expensesForMonth(input.expenses, previous.year, previous.month, input.exceptions),
    input.categories,
  ).map((group) => [group.id, group]));
  return currentGroups.flatMap((current): Insight[] => {
    const prior = previousGroups.get(current.id);
    if (!prior || prior.amountCents === 0) return [];
    const difference = current.amountCents - prior.amountCents;
    const percentage = (difference / prior.amountCents) * 100;
    if (difference < 2_000 || percentage < 20) return [];
    return [{
      id: `category-growth-${current.id}`,
      title: `A despesa em ${current.name} aumentou`,
      explanation: `Subiu ${Math.round(percentage)}% (${formatEuros(difference)}) face ao mês anterior.`,
      tone: 'informative',
      priority: 68,
    }];
  });
}

/** Requires five comparable expenses, at least 2× the median and a €25 gap. */
export function unusualExpenseInsights(input: InsightInput): Insight[] {
  const currentBounds = monthBounds(input.year, input.month);
  const previousDay = new Date(`${currentBounds.from}T00:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const historicalTo = previousDay.toISOString().slice(0, 10);
  const earliest = input.expenses.map((expense) => expense.date).sort()[0];
  if (!earliest || earliest > historicalTo) return [];
  const historical = materializeExpenses(input.expenses, input.exceptions, earliest, historicalTo);
  const current = expensesForMonth(input.expenses, input.year, input.month, input.exceptions);
  return current.flatMap((expense): Insight[] => {
    const comparable = historical.filter((item) => item.categoryId === expense.categoryId).map((item) => item.amountCents);
    if (comparable.length < 5) return [];
    const reference = median(comparable);
    if (expense.amountCents < reference * 2 || expense.amountCents - reference < 2_500) return [];
    const categoryName = input.categories.find((category) => category.id === expense.categoryId)?.name ?? 'esta categoria';
    return [{
      id: `unusual-${expense.occurrenceKey}`,
      title: `Despesa acima do habitual em ${categoryName}`,
      explanation: `${formatEuros(expense.amountCents)} compara com uma mediana histórica de ${formatEuros(Math.round(reference))}, calculada a partir de ${comparable.length} despesas.`,
      tone: 'informative',
      priority: 72,
    }];
  });
}

export function recurringCommitmentInsight(input: InsightInput): Insight[] {
  const incomes = incomesForMonth(input.incomes, input.year, input.month, input.exceptions);
  const totalIncome = sumIncomes(incomes);
  if (totalIncome === 0) return [];
  const recurring = expensesForMonth(input.expenses, input.year, input.month, input.exceptions)
    .filter((expense) => expense.source !== 'one-off');
  if (recurring.length === 0) return [];
  const totalRecurring = sumExpenses(recurring);
  const percentage = Math.round((totalRecurring / totalIncome) * 100);
  return [{
    id: 'recurring-commitment',
    title: 'Peso das despesas recorrentes',
    explanation: `${formatEuros(totalRecurring)} em despesas recorrentes representam ${percentage}% dos rendimentos deste mês.`,
    tone: percentage >= 70 ? 'warning' : 'informative',
    priority: percentage >= 70 ? 78 : 45,
  }];
}

export function savingsPlanInsights(input: InsightInput): Insight[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  return input.savingsGoals.flatMap((goal): Insight[] => {
    if (!goal.targetDate || goal.targetDate <= today || goal.currentAmountCents >= goal.targetAmountCents) return [];
    const start = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
    const end = new Date(`${goal.targetDate.slice(0, 7)}-01T00:00:00Z`);
    const months = Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1);
    const projected = goal.currentAmountCents + months * goal.monthlyContributionCents;
    if (projected >= goal.targetAmountCents) return [];
    return [{
      id: `savings-plan-${goal.id}`,
      title: `${goal.name} precisa de um plano diferente`,
      explanation: `Ao ritmo de ${formatEuros(goal.monthlyContributionCents)} por mês, a projeção fica ${formatEuros(goal.targetAmountCents - projected)} abaixo da meta na data definida.`,
      tone: 'warning',
      priority: 75,
    }];
  });
}

export function balanceInsights(input: InsightInput): Insight[] {
  const currentExpenses = sumExpenses(expensesForMonth(input.expenses, input.year, input.month, input.exceptions));
  const currentIncomes = sumIncomes(incomesForMonth(input.incomes, input.year, input.month, input.exceptions));
  const balance = currentIncomes - currentExpenses;
  const insights: Insight[] = [];
  if (balance < 0) {
    insights.push({
      id: 'negative-balance',
      title: 'O saldo do mês está negativo',
      explanation: `As despesas excedem os rendimentos em ${formatEuros(Math.abs(balance))}.`,
      tone: 'critical',
      priority: 96,
    });
  }
  const comparison = comparePeriods(input.expenses, input.incomes, input.exceptions, input.year, input.month).balance;
  if (comparison.previousCents !== 0 && comparison.differenceCents >= 5_000
    && (comparison.differenceCents / Math.abs(comparison.previousCents)) * 100 >= 10) {
    insights.push({
      id: 'balance-improvement',
      title: 'O saldo melhorou face ao mês anterior',
      explanation: `A diferença favorável é de ${formatEuros(comparison.differenceCents)}.`,
      tone: 'positive',
      priority: 60,
    });
  }
  return insights;
}

export function generateInsights(input: InsightInput): Insight[] {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  if (monthKey(input.year, input.month) > today.slice(0, 7)) return [];
  const all = [
    ...budgetInsights(input),
    ...balanceInsights(input),
    ...savingsPlanInsights(input),
    ...unusualExpenseInsights(input),
    ...categoryGrowthInsights(input),
    ...recurringCommitmentInsight(input),
  ];
  const unique = new Map<string, Insight>();
  for (const insight of all.sort((a, b) => b.priority - a.priority)) {
    if (!unique.has(insight.id)) unique.set(insight.id, insight);
  }
  return [...unique.values()].slice(0, 5);
}
