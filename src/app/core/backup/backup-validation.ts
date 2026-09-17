import {
  AppBackup,
  Category,
  Expense,
  ImportPreview,
  MonthlyIncome,
  SavingsGoal,
  Settings,
  Subcategory,
} from '../../models/domain.models';
import { isDateString, isIsoDate } from '../../shared/utils/date.utils';

export type BackupValidationResult =
  | { valid: true; backup: AppBackup; preview: ImportPreview }
  | { valid: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

function validateSettings(value: unknown, errors: string[]): value is Settings {
  if (!isRecord(value)) {
    errors.push('As preferências não têm um formato válido.');
    return false;
  }
  if (value['currency'] !== 'EUR' || value['locale'] !== 'pt-PT') {
    errors.push('A moeda ou o idioma do ficheiro não são suportados.');
  }
  if (typeof value['onboardingCompleted'] !== 'boolean') {
    errors.push('O estado do onboarding é inválido.');
  }
  if (!Number.isInteger(value['changesSinceExport']) || (value['changesSinceExport'] as number) < 0) {
    errors.push('O contador de alterações é inválido.');
  }
  if (value['lastExportAt'] !== undefined && !isIsoDate(value['lastExportAt'])) {
    errors.push('A data da última exportação é inválida.');
  }
  return errors.length === 0;
}

function validateSubcategory(value: unknown, categoryIndex: number, errors: string[]): value is Subcategory {
  if (!isRecord(value)) {
    errors.push(`A subcategoria da categoria ${categoryIndex + 1} é inválida.`);
    return false;
  }
  const valid = isNonEmptyString(value['id']) && isNonEmptyString(value['name']) && typeof value['archived'] === 'boolean';
  if (!valid) errors.push(`Uma subcategoria da categoria ${categoryIndex + 1} tem campos inválidos.`);
  return valid;
}

function validateCategory(value: unknown, index: number, errors: string[]): value is Category {
  if (!isRecord(value)) {
    errors.push(`A categoria ${index + 1} é inválida.`);
    return false;
  }
  const baseValid = isNonEmptyString(value['id'])
    && isNonEmptyString(value['name'])
    && typeof value['color'] === 'string'
    && Number.isInteger(value['order'])
    && typeof value['archived'] === 'boolean'
    && Array.isArray(value['subcategories']);
  if (!baseValid) {
    errors.push(`A categoria ${index + 1} tem campos inválidos.`);
    return false;
  }
  (value['subcategories'] as unknown[]).forEach((subcategory) => validateSubcategory(subcategory, index, errors));
  return true;
}

const isMonthString = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

function validateExpense(value: unknown, index: number, errors: string[], requireRecurrence: boolean): value is Expense {
  if (!isRecord(value)) {
    errors.push(`A despesa ${index + 1} é inválida.`);
    return false;
  }
  const valid = isNonEmptyString(value['id'])
    && isDateString(value['date'])
    && Number.isSafeInteger(value['amountCents'])
    && (value['amountCents'] as number) > 0
    && isNonEmptyString(value['categoryId'])
    && (value['subcategoryId'] === undefined || isNonEmptyString(value['subcategoryId']))
    && (value['description'] === undefined || typeof value['description'] === 'string')
    && (value['fixed'] === undefined || typeof value['fixed'] === 'boolean')
    && (!requireRecurrence || typeof value['fixed'] === 'boolean')
    && isIsoDate(value['createdAt'])
    && isIsoDate(value['updatedAt']);
  if (!valid) errors.push(`A despesa ${index + 1} tem campos inválidos.`);
  return valid;
}

function validateIncome(value: unknown, index: number, errors: string[], requireRecurrence: boolean): value is MonthlyIncome {
  if (!isRecord(value)) {
    errors.push(`O rendimento ${index + 1} é inválido.`);
    return false;
  }
  const valid = isNonEmptyString(value['id'])
    && isNonEmptyString(value['name'])
    && ['salary', 'subsidy', 'freelance', 'other'].includes(value['kind'] as string)
    && Number.isSafeInteger(value['amountCents'])
    && (value['amountCents'] as number) > 0
    && (value['receivedMonth'] === undefined || isMonthString(value['receivedMonth']))
    && (value['fixed'] === undefined || typeof value['fixed'] === 'boolean')
    && (!requireRecurrence || (isMonthString(value['receivedMonth']) && typeof value['fixed'] === 'boolean'))
    && typeof value['active'] === 'boolean'
    && isIsoDate(value['createdAt'])
    && isIsoDate(value['updatedAt']);
  if (!valid) errors.push(`O rendimento ${index + 1} tem campos inválidos.`);
  return valid;
}

function validateSavingsGoal(value: unknown, index: number, errors: string[]): value is SavingsGoal {
  if (!isRecord(value)) {
    errors.push(`O objetivo de poupança ${index + 1} é inválido.`);
    return false;
  }
  const valid = isNonEmptyString(value['id'])
    && isNonEmptyString(value['name'])
    && ['general', 'reserve', 'home', 'car', 'travel', 'education', 'other'].includes(value['kind'] as string)
    && Number.isSafeInteger(value['targetAmountCents'])
    && (value['targetAmountCents'] as number) > 0
    && Number.isSafeInteger(value['currentAmountCents'])
    && (value['currentAmountCents'] as number) >= 0
    && Number.isSafeInteger(value['monthlyContributionCents'])
    && (value['monthlyContributionCents'] as number) >= 0
    && (value['targetDate'] === undefined || isDateString(value['targetDate']))
    && isIsoDate(value['createdAt'])
    && isIsoDate(value['updatedAt']);
  if (!valid) errors.push(`O objetivo de poupança ${index + 1} tem campos inválidos.`);
  return valid;
}

export function validateBackup(value: unknown): BackupValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['O ficheiro não contém um objeto JSON válido.'] };
  const schemaVersion = value['schemaVersion'];
  if (schemaVersion !== 1 && schemaVersion !== 2 && schemaVersion !== 3) errors.push('A versão do backup não é suportada.');
  if (!isIsoDate(value['exportedAt'])) errors.push('A data de exportação é inválida.');
  validateSettings(value['settings'], errors);
  if (!Array.isArray(value['categories'])) errors.push('A lista de categorias é inválida.');
  if (!Array.isArray(value['expenses'])) errors.push('A lista de despesas é inválida.');
  if ((schemaVersion === 2 || schemaVersion === 3) && !Array.isArray(value['monthlyIncomes'])) errors.push('A lista de rendimentos é inválida.');
  if ((schemaVersion === 2 || schemaVersion === 3) && !Array.isArray(value['savingsGoals'])) errors.push('A lista de objetivos de poupança é inválida.');
  if (errors.length > 0) return { valid: false, errors };

  const categories = value['categories'] as unknown[];
  const expenses = value['expenses'] as unknown[];
  const monthlyIncomes = schemaVersion === 2 || schemaVersion === 3 ? value['monthlyIncomes'] as unknown[] : [];
  const savingsGoals = schemaVersion === 2 || schemaVersion === 3 ? value['savingsGoals'] as unknown[] : [];
  categories.forEach((item, index) => validateCategory(item, index, errors));
  expenses.forEach((item, index) => validateExpense(item, index, errors, schemaVersion === 3));
  monthlyIncomes.forEach((item, index) => validateIncome(item, index, errors, schemaVersion === 3));
  savingsGoals.forEach((item, index) => validateSavingsGoal(item, index, errors));
  if (errors.length > 0) return { valid: false, errors };

  const typedCategories = categories as Category[];
  const typedExpenses = (expenses as Expense[]).map((expense) => ({ ...expense, fixed: expense.fixed ?? false }));
  const typedIncomes = (monthlyIncomes as MonthlyIncome[]).map((income) => ({
    ...income,
    receivedMonth: income.receivedMonth ?? income.createdAt.slice(0, 7),
    fixed: income.fixed ?? true,
  }));
  const typedGoals = savingsGoals as SavingsGoal[];
  const categoryIds = new Set<string>();
  const subcategoryOwners = new Map<string, string>();
  for (const category of typedCategories) {
    if (categoryIds.has(category.id)) errors.push(`O ID de categoria "${category.id}" está repetido.`);
    categoryIds.add(category.id);
    for (const subcategory of category.subcategories) {
      if (subcategoryOwners.has(subcategory.id)) errors.push(`O ID de subcategoria "${subcategory.id}" está repetido.`);
      subcategoryOwners.set(subcategory.id, category.id);
    }
  }

  const expenseIds = new Set<string>();
  for (const expense of typedExpenses) {
    if (expenseIds.has(expense.id)) errors.push(`O ID de despesa "${expense.id}" está repetido.`);
    expenseIds.add(expense.id);
    if (!categoryIds.has(expense.categoryId)) {
      errors.push(`A despesa "${expense.id}" refere uma categoria inexistente.`);
    }
    if (expense.subcategoryId && subcategoryOwners.get(expense.subcategoryId) !== expense.categoryId) {
      errors.push(`A despesa "${expense.id}" refere uma subcategoria inválida.`);
    }
  }
  const incomeIds = new Set<string>();
  for (const income of typedIncomes) {
    if (incomeIds.has(income.id)) errors.push(`O ID de rendimento "${income.id}" está repetido.`);
    incomeIds.add(income.id);
  }
  const savingsGoalIds = new Set<string>();
  for (const goal of typedGoals) {
    if (savingsGoalIds.has(goal.id)) errors.push(`O ID de objetivo de poupança "${goal.id}" está repetido.`);
    savingsGoalIds.add(goal.id);
  }
  if (errors.length > 0) return { valid: false, errors };

  const backup: AppBackup = {
    schemaVersion: 3,
    exportedAt: value['exportedAt'] as string,
    settings: value['settings'] as Settings,
    categories: typedCategories,
    expenses: typedExpenses,
    monthlyIncomes: typedIncomes,
    savingsGoals: typedGoals,
  };
  const sortedDates = typedExpenses.map((expense) => expense.date).sort();
  const preview: ImportPreview = {
    expenseCount: typedExpenses.length,
    categoryCount: typedCategories.length,
    incomeCount: typedIncomes.length,
    savingsGoalCount: typedGoals.length,
    exportedAt: backup.exportedAt,
    ...(sortedDates[0] ? { firstDate: sortedDates[0] } : {}),
    ...(sortedDates.at(-1) ? { lastDate: sortedDates.at(-1) } : {}),
  };
  return { valid: true, backup, preview };
}

export function parseBackupContents(contents: string): BackupValidationResult {
  try {
    return validateBackup(JSON.parse(contents) as unknown);
  } catch {
    return { valid: false, errors: ['O ficheiro não contém JSON válido.'] };
  }
}
