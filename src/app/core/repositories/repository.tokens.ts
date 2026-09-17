import { InjectionToken } from '@angular/core';
import { AppBackup, Category, Expense, MonthlyIncome, SavingsGoal, Settings } from '../../models/domain.models';

export interface ExpenseRepository {
  getAll(): Promise<Expense[]>;
  getById(id: string): Promise<Expense | undefined>;
  put(expense: Expense): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface CategoryRepository {
  getAll(): Promise<Category[]>;
  getById(id: string): Promise<Category | undefined>;
  put(category: Category): Promise<void>;
  bulkPut(categories: Category[]): Promise<void>;
}

export interface IncomeRepository {
  getAll(): Promise<MonthlyIncome[]>;
  getById(id: string): Promise<MonthlyIncome | undefined>;
  put(income: MonthlyIncome): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SavingsGoalRepository {
  getAll(): Promise<SavingsGoal[]>;
  getById(id: string): Promise<SavingsGoal | undefined>;
  put(goal: SavingsGoal): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(): Promise<Settings | undefined>;
  put(settings: Settings): Promise<void>;
}

export interface DataRepository {
  replaceAll(backup: AppBackup): Promise<void>;
  clearAll(): Promise<void>;
}

export const EXPENSE_REPOSITORY = new InjectionToken<ExpenseRepository>('EXPENSE_REPOSITORY');
export const CATEGORY_REPOSITORY = new InjectionToken<CategoryRepository>('CATEGORY_REPOSITORY');
export const INCOME_REPOSITORY = new InjectionToken<IncomeRepository>('INCOME_REPOSITORY');
export const SAVINGS_GOAL_REPOSITORY = new InjectionToken<SavingsGoalRepository>('SAVINGS_GOAL_REPOSITORY');
export const SETTINGS_REPOSITORY = new InjectionToken<SettingsRepository>('SETTINGS_REPOSITORY');
export const DATA_REPOSITORY = new InjectionToken<DataRepository>('DATA_REPOSITORY');
