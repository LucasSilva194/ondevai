export type RecurrenceFrequency = 'weekly' | 'monthly' | 'yearly';
export type RecurrenceStatus = 'active' | 'paused';

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  endDate?: string;
  status: RecurrenceStatus;
  /** First date that must no longer be materialised while the series is paused. */
  pausedFrom?: string;
}

export interface Expense {
  id: string;
  date: string;
  amountCents: number;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  recurrence?: RecurrenceRule;
  createdAt: string;
  updatedAt: string;
}

export type IncomeKind = 'salary' | 'subsidy' | 'freelance' | 'other';

export interface MonthlyIncome {
  id: string;
  name: string;
  kind: IncomeKind;
  amountCents: number;
  date: string;
  recurrence?: RecurrenceRule;
  createdAt: string;
  updatedAt: string;
}

export type RecurrenceSeriesType = 'expense' | 'income';
export type RecurrenceExceptionAction = 'skip' | 'override';

export interface RecurrenceExceptionChanges {
  date?: string;
  amountCents?: number;
  categoryId?: string;
  subcategoryId?: string;
  description?: string;
  name?: string;
  kind?: IncomeKind;
}

export interface RecurrenceException {
  id: string;
  seriesType: RecurrenceSeriesType;
  seriesId: string;
  occurrenceDate: string;
  action: RecurrenceExceptionAction;
  changes?: RecurrenceExceptionChanges;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseOccurrence extends Omit<Expense, 'recurrence'> {
  occurrenceKey: string;
  source: 'one-off' | 'series' | 'override';
  seriesId?: string;
  recurrence?: RecurrenceRule;
}

export interface IncomeOccurrence extends Omit<MonthlyIncome, 'recurrence'> {
  occurrenceKey: string;
  source: 'one-off' | 'series' | 'override';
  seriesId?: string;
  recurrence?: RecurrenceRule;
}

export type SavingsGoalKind = 'general' | 'reserve' | 'home' | 'car' | 'travel' | 'education' | 'other';

export interface SavingsGoal {
  id: string;
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  /** Transactionally maintained cache of the ledger balance. */
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string;
  createdAt: string;
  updatedAt: string;
}

export type SavingsTransactionType = 'opening' | 'deposit' | 'withdrawal';

export interface SavingsTransaction {
  id: string;
  goalId: string;
  type: SavingsTransactionType;
  amountCents: number;
  effectiveDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyBudget {
  id: string;
  month: string;
  categoryId: string;
  amountCents: number;
  createdAt: string;
  updatedAt: string;
}

export interface Subcategory {
  id: string;
  name: string;
  archived: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
  archived: boolean;
  subcategories: Subcategory[];
}

export interface Settings {
  currency: 'EUR';
  locale: 'pt-PT';
  onboardingCompleted: boolean;
  lastExportAt?: string;
  changesSinceExport: number;
}

export interface AppBackup {
  schemaVersion: 4;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  expenses: Expense[];
  monthlyIncomes: MonthlyIncome[];
  savingsGoals: SavingsGoal[];
  savingsTransactions: SavingsTransaction[];
  monthlyBudgets: MonthlyBudget[];
  recurrenceExceptions: RecurrenceException[];
}

export interface ImportPreview {
  expenseCount: number;
  categoryCount: number;
  incomeCount: number;
  savingsGoalCount: number;
  savingsTransactionCount: number;
  budgetCount: number;
  recurrenceExceptionCount: number;
  firstDate?: string;
  lastDate?: string;
  exportedAt: string;
}

export interface StorageStatus {
  supported: boolean;
  persisted?: boolean;
  usageBytes?: number;
  quotaBytes?: number;
}

export const DEFAULT_SETTINGS: Settings = {
  currency: 'EUR',
  locale: 'pt-PT',
  onboardingCompleted: false,
  changesSinceExport: 0,
};
