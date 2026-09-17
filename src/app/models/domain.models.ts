export interface Expense {
  id: string;
  date: string;
  amountCents: number;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
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
  schemaVersion: 1;
  exportedAt: string;
  settings: Settings;
  categories: Category[];
  expenses: Expense[];
}

export interface ImportPreview {
  expenseCount: number;
  categoryCount: number;
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
