export interface Expense {
  id: string;
  date: string;
  amountCents: number;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  fixed: boolean;
  createdAt: string;
  updatedAt: string;
}

export type IncomeKind = 'salary' | 'subsidy' | 'freelance' | 'other';

export interface MonthlyIncome {
  id: string;
  name: string;
  kind: IncomeKind;
  amountCents: number;
  receivedMonth: string;
  fixed: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export type SavingsGoalKind = 'general' | 'reserve' | 'home' | 'car' | 'travel' | 'education' | 'other';

export interface SavingsGoal {
  id: string;
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string;
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
  schemaVersion: 3;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  expenses: Expense[];
  monthlyIncomes: MonthlyIncome[];
  savingsGoals: SavingsGoal[];
}

export interface ImportPreview {
  expenseCount: number;
  categoryCount: number;
  incomeCount: number;
  savingsGoalCount: number;
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
