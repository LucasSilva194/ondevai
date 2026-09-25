import type {
  IncomeKind,
  RecurrenceExceptionAction,
  RecurrenceExceptionChanges,
  RecurrenceRule,
  RecurrenceSeriesType,
  SavingsGoalKind,
  SavingsTransactionType,
  Subcategory,
} from '../../models/domain.models';

export const POCKETBASE_COLLECTIONS = {
  users: 'users',
  settings: 'user_settings',
  categories: 'categories',
  expenses: 'expenses',
  incomes: 'monthly_incomes',
  savingsGoals: 'savings_goals',
  savingsTransactions: 'savings_transactions',
  budgets: 'monthly_budgets',
  recurrenceExceptions: 'recurrence_exceptions',
} as const;

export interface PocketBaseRecordBase {
  id: string;
  collectionId: string;
  collectionName: string;
  created: string;
  updated: string;
  owner: string;
}

export interface SettingsRecord extends PocketBaseRecordBase {
  currency: 'EUR';
  locale: 'pt-PT';
  onboardingCompleted: boolean;
  lastExportAt?: string | null;
  changesSinceExport: number;
}

export interface CategoryRecord extends PocketBaseRecordBase {
  name: string;
  color: string;
  icon?: string | null;
  order: number;
  archived: boolean;
  subcategories: unknown;
}

export interface ExpenseRecord extends PocketBaseRecordBase {
  date: string;
  amountCents: number;
  category: string;
  subcategoryId?: string | null;
  description?: string | null;
  recurrence?: unknown;
}

export interface IncomeRecord extends PocketBaseRecordBase {
  name: string;
  kind: IncomeKind;
  amountCents: number;
  date: string;
  recurrence?: unknown;
}

export interface SavingsGoalRecord extends PocketBaseRecordBase {
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string | null;
}

export interface SavingsTransactionRecord extends PocketBaseRecordBase {
  goal: string;
  type: SavingsTransactionType;
  amountCents: number;
  effectiveDate: string;
  note?: string | null;
}

export interface BudgetRecord extends PocketBaseRecordBase {
  month: string;
  category: string;
  amountCents: number;
}

export interface RecurrenceExceptionRecord extends PocketBaseRecordBase {
  seriesType: RecurrenceSeriesType;
  seriesId: string;
  occurrenceDate: string;
  action: RecurrenceExceptionAction;
  changes?: unknown;
}

export interface SettingsRecordData {
  owner: string;
  currency: 'EUR';
  locale: 'pt-PT';
  onboardingCompleted: boolean;
  lastExportAt?: string;
  changesSinceExport: number;
}

export interface CategoryRecordData {
  owner: string;
  name: string;
  color: string;
  icon?: string;
  order: number;
  archived: boolean;
  subcategories: Subcategory[];
}

export interface ExpenseRecordData {
  owner: string;
  date: string;
  amountCents: number;
  category: string;
  subcategoryId?: string;
  description?: string;
  recurrence?: RecurrenceRule;
}

export interface IncomeRecordData {
  owner: string;
  name: string;
  kind: IncomeKind;
  amountCents: number;
  date: string;
  recurrence?: RecurrenceRule;
}

export interface SavingsGoalRecordData {
  owner: string;
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string;
}

export interface SavingsTransactionRecordData {
  owner: string;
  goal: string;
  type: SavingsTransactionType;
  amountCents: number;
  effectiveDate: string;
  note?: string;
}

export interface BudgetRecordData {
  owner: string;
  month: string;
  category: string;
  amountCents: number;
}

export interface RecurrenceExceptionRecordData {
  owner: string;
  seriesType: RecurrenceSeriesType;
  seriesId: string;
  occurrenceDate: string;
  action: RecurrenceExceptionAction;
  changes?: RecurrenceExceptionChanges;
}
