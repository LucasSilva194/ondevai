import {
  AppBackup,
  Category,
  Expense,
  ImportPreview,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  RecurrenceRule,
  SavingsGoal,
  SavingsTransaction,
  Settings,
  Subcategory,
} from '../../models/domain.models';
import { isDateString, isIsoDate } from '../../shared/utils/date.utils';
import { validateRecurrenceRule } from '../../shared/utils/recurrence.utils';

export type BackupValidationResult =
  | { valid: true; backup: AppBackup; preview: ImportPreview }
  | { valid: false; errors: string[] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isMonthString = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
const isPositiveCents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isNonNegativeCents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function validSettings(value: unknown, errors: string[]): value is Settings {
  if (!isRecord(value)) {
    errors.push('As preferências não têm um formato válido.');
    return false;
  }
  if (value['currency'] !== 'EUR' || value['locale'] !== 'pt-PT') errors.push('A moeda ou o idioma do ficheiro não são suportados.');
  if (typeof value['onboardingCompleted'] !== 'boolean') errors.push('O estado do onboarding é inválido.');
  if (!isNonNegativeCents(value['changesSinceExport'])) errors.push('O contador de alterações é inválido.');
  if (value['lastExportAt'] !== undefined && !isIsoDate(value['lastExportAt'])) errors.push('A data da última exportação é inválida.');
  return errors.length === 0;
}

function parseCategories(values: unknown[], errors: string[]): Category[] {
  return values.flatMap((value, index): Category[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])
      || typeof value['color'] !== 'string' || !Number.isInteger(value['order'])
      || typeof value['archived'] !== 'boolean' || !Array.isArray(value['subcategories'])) {
      errors.push(`A categoria ${index + 1} tem campos inválidos.`);
      return [];
    }
    const subcategories = value['subcategories'].flatMap((item): Subcategory[] => {
      if (!isRecord(item) || !isNonEmptyString(item['id']) || !isNonEmptyString(item['name']) || typeof item['archived'] !== 'boolean') {
        errors.push(`Uma subcategoria da categoria ${index + 1} tem campos inválidos.`);
        return [];
      }
      return [{ id: item['id'], name: item['name'], archived: item['archived'] }];
    });
    return [{
      id: value['id'], name: value['name'], color: value['color'], order: value['order'] as number,
      archived: value['archived'], subcategories,
      ...(typeof value['icon'] === 'string' ? { icon: value['icon'] } : {}),
    }];
  });
}

function parseRule(value: unknown, label: string, errors: string[]): RecurrenceRule | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    errors.push(`${label} tem uma recorrência inválida.`);
    return undefined;
  }
  const rule: RecurrenceRule = {
    frequency: value['frequency'] as RecurrenceRule['frequency'],
    interval: value['interval'] as number,
    startDate: value['startDate'] as string,
    status: value['status'] as RecurrenceRule['status'],
    ...(typeof value['endDate'] === 'string' ? { endDate: value['endDate'] } : {}),
    ...(typeof value['pausedFrom'] === 'string' ? { pausedFrom: value['pausedFrom'] } : {}),
  };
  if (!validateRecurrenceRule(rule) || !isDateString(rule.startDate)
    || (rule.endDate !== undefined && !isDateString(rule.endDate))
    || (rule.pausedFrom !== undefined && !isDateString(rule.pausedFrom))) {
    errors.push(`${label} tem uma recorrência inválida.`);
    return undefined;
  }
  return rule;
}

function parseExpenses(values: unknown[], version: number, errors: string[]): Expense[] {
  return values.flatMap((value, index): Expense[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isDateString(value['date'])
      || !isPositiveCents(value['amountCents']) || !isNonEmptyString(value['categoryId'])
      || (value['subcategoryId'] !== undefined && !isNonEmptyString(value['subcategoryId']))
      || (value['description'] !== undefined && typeof value['description'] !== 'string')
      || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`A despesa ${index + 1} tem campos inválidos.`);
      return [];
    }
    const legacyFixed = value['fixed'] === true;
    const recurrence = version === 4
      ? parseRule(value['recurrence'], `A despesa ${index + 1}`, errors)
      : legacyFixed ? { frequency: 'monthly', interval: 1, startDate: value['date'], status: 'active' } satisfies RecurrenceRule : undefined;
    if (version === 4 && value['recurrence'] !== undefined && !recurrence) return [];
    return [{
      id: value['id'], date: value['date'], amountCents: value['amountCents'], categoryId: value['categoryId'],
      createdAt: value['createdAt'], updatedAt: value['updatedAt'],
      ...(value['subcategoryId'] ? { subcategoryId: value['subcategoryId'] as string } : {}),
      ...(typeof value['description'] === 'string' && value['description'].trim() ? { description: value['description'] } : {}),
      ...(recurrence ? { recurrence } : {}),
    }];
  });
}

function parseIncomes(values: unknown[], version: number, errors: string[]): MonthlyIncome[] {
  return values.flatMap((value, index): MonthlyIncome[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])
      || !['salary', 'subsidy', 'freelance', 'other'].includes(value['kind'] as string)
      || !isPositiveCents(value['amountCents']) || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`O rendimento ${index + 1} tem campos inválidos.`);
      return [];
    }
    const date = version === 4 ? value['date'] : `${String(value['receivedMonth'] ?? value['createdAt'].slice(0, 7))}-01`;
    if (!isDateString(date)) {
      errors.push(`O rendimento ${index + 1} tem uma data inválida.`);
      return [];
    }
    let recurrence: RecurrenceRule | undefined;
    if (version === 4) recurrence = parseRule(value['recurrence'], `O rendimento ${index + 1}`, errors);
    else if (value['fixed'] ?? true) {
      const active = value['active'] !== false;
      recurrence = { frequency: 'monthly', interval: 1, startDate: date, status: active ? 'active' : 'paused', ...(!active ? { pausedFrom: date } : {}) };
    }
    if (version === 4 && value['recurrence'] !== undefined && !recurrence) return [];
    return [{
      id: value['id'], name: value['name'], kind: value['kind'] as MonthlyIncome['kind'],
      amountCents: value['amountCents'], date, createdAt: value['createdAt'], updatedAt: value['updatedAt'],
      ...(recurrence ? { recurrence } : {}),
    }];
  });
}

function parseGoals(values: unknown[], errors: string[]): SavingsGoal[] {
  return values.flatMap((value, index): SavingsGoal[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isNonEmptyString(value['name'])
      || !['general', 'reserve', 'home', 'car', 'travel', 'education', 'other'].includes(value['kind'] as string)
      || !isPositiveCents(value['targetAmountCents']) || !isNonNegativeCents(value['currentAmountCents'])
      || !isNonNegativeCents(value['monthlyContributionCents'])
      || (value['targetDate'] !== undefined && !isDateString(value['targetDate']))
      || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`O objetivo de poupança ${index + 1} tem campos inválidos.`);
      return [];
    }
    return [{
      id: value['id'], name: value['name'], kind: value['kind'] as SavingsGoal['kind'],
      targetAmountCents: value['targetAmountCents'], currentAmountCents: value['currentAmountCents'],
      monthlyContributionCents: value['monthlyContributionCents'], createdAt: value['createdAt'], updatedAt: value['updatedAt'],
      ...(typeof value['targetDate'] === 'string' ? { targetDate: value['targetDate'] } : {}),
    }];
  });
}

function parseTransactions(values: unknown[], errors: string[]): SavingsTransaction[] {
  return values.flatMap((value, index): SavingsTransaction[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isNonEmptyString(value['goalId'])
      || !['opening', 'deposit', 'withdrawal'].includes(value['type'] as string)
      || !isPositiveCents(value['amountCents']) || !isDateString(value['effectiveDate'])
      || (value['note'] !== undefined && typeof value['note'] !== 'string')
      || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`O movimento de poupança ${index + 1} tem campos inválidos.`);
      return [];
    }
    return [{
      id: value['id'], goalId: value['goalId'], type: value['type'] as SavingsTransaction['type'],
      amountCents: value['amountCents'], effectiveDate: value['effectiveDate'],
      createdAt: value['createdAt'], updatedAt: value['updatedAt'],
      ...(typeof value['note'] === 'string' && value['note'].trim() ? { note: value['note'] } : {}),
    }];
  });
}

function parseBudgets(values: unknown[], errors: string[]): MonthlyBudget[] {
  return values.flatMap((value, index): MonthlyBudget[] => {
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !isMonthString(value['month'])
      || !isNonEmptyString(value['categoryId']) || !isPositiveCents(value['amountCents'])
      || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`O orçamento ${index + 1} tem campos inválidos.`);
      return [];
    }
    return [{
      id: value['id'], month: value['month'], categoryId: value['categoryId'], amountCents: value['amountCents'],
      createdAt: value['createdAt'], updatedAt: value['updatedAt'],
    }];
  });
}

function parseExceptions(values: unknown[], errors: string[]): RecurrenceException[] {
  return values.flatMap((value, index): RecurrenceException[] => {
    const changes = isRecord(value) && isRecord(value['changes']) ? value['changes'] : undefined;
    const changesValid = value && isRecord(value)
      && (value['changes'] === undefined || changes !== undefined)
      && (changes?.['date'] === undefined || isDateString(changes['date']))
      && (changes?.['amountCents'] === undefined || isPositiveCents(changes['amountCents']))
      && (changes?.['categoryId'] === undefined || isNonEmptyString(changes['categoryId']))
      && (changes?.['subcategoryId'] === undefined || isNonEmptyString(changes['subcategoryId']))
      && (changes?.['description'] === undefined || typeof changes['description'] === 'string')
      && (changes?.['name'] === undefined || isNonEmptyString(changes['name']))
      && (changes?.['kind'] === undefined || ['salary', 'subsidy', 'freelance', 'other'].includes(changes['kind'] as string));
    if (!isRecord(value) || !isNonEmptyString(value['id']) || !['expense', 'income'].includes(value['seriesType'] as string)
      || !isNonEmptyString(value['seriesId']) || !isDateString(value['occurrenceDate'])
      || !['skip', 'override'].includes(value['action'] as string) || !changesValid
      || !isIsoDate(value['createdAt']) || !isIsoDate(value['updatedAt'])) {
      errors.push(`A exceção de recorrência ${index + 1} tem campos inválidos.`);
      return [];
    }
    return [{
      id: value['id'], seriesType: value['seriesType'] as RecurrenceException['seriesType'], seriesId: value['seriesId'],
      occurrenceDate: value['occurrenceDate'], action: value['action'] as RecurrenceException['action'],
      createdAt: value['createdAt'], updatedAt: value['updatedAt'],
      ...(changes ? { changes } : {}),
    }];
  });
}

function findDuplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => seen.has(value) || !seen.add(value));
}

export function validateBackup(value: unknown): BackupValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ['O ficheiro não contém um objeto JSON válido.'] };
  const version = value['schemaVersion'];
  if (![1, 2, 3, 4].includes(version as number)) errors.push('A versão do backup não é suportada.');
  if (!isIsoDate(value['exportedAt'])) errors.push('A data de exportação é inválida.');
  validSettings(value['settings'], errors);
  for (const field of ['categories', 'expenses']) if (!Array.isArray(value[field])) errors.push(`A lista de ${field} é inválida.`);
  if ((version as number) >= 2) {
    if (!Array.isArray(value['monthlyIncomes'])) errors.push('A lista de rendimentos é inválida.');
    if (!Array.isArray(value['savingsGoals'])) errors.push('A lista de objetivos de poupança é inválida.');
  }
  if (version === 4) {
    if (!Array.isArray(value['savingsTransactions'])) errors.push('A lista de movimentos de poupança é inválida.');
    if (!Array.isArray(value['monthlyBudgets'])) errors.push('A lista de orçamentos é inválida.');
    if (!Array.isArray(value['recurrenceExceptions'])) errors.push('A lista de exceções de recorrência é inválida.');
  }
  if (errors.length > 0) return { valid: false, errors };

  const numericVersion = version as number;
  const categories = parseCategories(value['categories'] as unknown[], errors);
  const expenses = parseExpenses(value['expenses'] as unknown[], numericVersion, errors);
  const incomes = parseIncomes(numericVersion >= 2 ? value['monthlyIncomes'] as unknown[] : [], numericVersion, errors);
  const goals = parseGoals(numericVersion >= 2 ? value['savingsGoals'] as unknown[] : [], errors);
  const transactions = numericVersion === 4
    ? parseTransactions(value['savingsTransactions'] as unknown[], errors)
    : goals.filter((goal) => goal.currentAmountCents > 0).map((goal): SavingsTransaction => ({
      id: `opening-${goal.id}`, goalId: goal.id, type: 'opening', amountCents: goal.currentAmountCents,
      effectiveDate: goal.createdAt.slice(0, 10), note: 'Saldo migrado para o histórico',
      createdAt: goal.createdAt, updatedAt: goal.updatedAt,
    }));
  const budgets = numericVersion === 4 ? parseBudgets(value['monthlyBudgets'] as unknown[], errors) : [];
  const exceptions = numericVersion === 4 ? parseExceptions(value['recurrenceExceptions'] as unknown[], errors) : [];
  if (errors.length > 0) return { valid: false, errors };

  const categoryIds = new Set(categories.map((category) => category.id));
  const subcategoryOwners = new Map<string, string>();
  for (const category of categories) for (const subcategory of category.subcategories) {
    if (subcategoryOwners.has(subcategory.id)) errors.push(`O ID de subcategoria "${subcategory.id}" está repetido.`);
    subcategoryOwners.set(subcategory.id, category.id);
  }
  for (const duplicate of findDuplicates(categories.map((item) => item.id))) errors.push(`O ID de categoria "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(expenses.map((item) => item.id))) errors.push(`O ID de despesa "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(incomes.map((item) => item.id))) errors.push(`O ID de rendimento "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(goals.map((item) => item.id))) errors.push(`O ID de objetivo "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(transactions.map((item) => item.id))) errors.push(`O ID de movimento "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(budgets.map((item) => item.id))) errors.push(`O ID de orçamento "${duplicate}" está repetido.`);
  for (const duplicate of findDuplicates(exceptions.map((item) => item.id))) errors.push(`O ID de exceção "${duplicate}" está repetido.`);

  for (const expense of expenses) {
    if (!categoryIds.has(expense.categoryId)) errors.push(`A despesa "${expense.id}" refere uma categoria inexistente.`);
    if (expense.subcategoryId && subcategoryOwners.get(expense.subcategoryId) !== expense.categoryId) errors.push(`A despesa "${expense.id}" refere uma subcategoria inválida.`);
  }
  const goalIds = new Set(goals.map((goal) => goal.id));
  for (const transaction of transactions) if (!goalIds.has(transaction.goalId)) errors.push(`O movimento "${transaction.id}" refere um objetivo inexistente.`);
  for (const goal of goals) {
    const balance = transactions.filter((item) => item.goalId === goal.id)
      .reduce((total, item) => total + (item.type === 'withdrawal' ? -item.amountCents : item.amountCents), 0);
    if (balance !== goal.currentAmountCents) errors.push(`O histórico do objetivo "${goal.id}" não corresponde ao saldo guardado.`);
  }
  const budgetKeys = new Set<string>();
  for (const budget of budgets) {
    if (!categoryIds.has(budget.categoryId)) errors.push(`O orçamento "${budget.id}" refere uma categoria inexistente.`);
    const key = `${budget.month}:${budget.categoryId}`;
    if (budgetKeys.has(key)) errors.push(`Existe mais do que um orçamento para ${key}.`);
    budgetKeys.add(key);
  }
  const expenseIds = new Set(expenses.filter((item) => item.recurrence).map((item) => item.id));
  const incomeIds = new Set(incomes.filter((item) => item.recurrence).map((item) => item.id));
  const expenseMap = new Map(expenses.map((item) => [item.id, item]));
  const exceptionKeys = new Set<string>();
  for (const exception of exceptions) {
    const related = exception.seriesType === 'expense' ? expenseIds.has(exception.seriesId) : incomeIds.has(exception.seriesId);
    if (!related) errors.push(`A exceção "${exception.id}" refere uma série inexistente.`);
    if (exception.seriesType === 'expense' && exception.changes) {
      const series = expenseMap.get(exception.seriesId);
      const categoryId = exception.changes.categoryId ?? series?.categoryId;
      if (categoryId && !categoryIds.has(categoryId)) errors.push(`A exceção "${exception.id}" refere uma categoria inexistente.`);
      if (exception.changes.subcategoryId && subcategoryOwners.get(exception.changes.subcategoryId) !== categoryId) {
        errors.push(`A exceção "${exception.id}" refere uma subcategoria inválida.`);
      }
    }
    const key = `${exception.seriesType}:${exception.seriesId}:${exception.occurrenceDate}`;
    if (exceptionKeys.has(key)) errors.push(`Existe mais do que uma exceção para ${key}.`);
    exceptionKeys.add(key);
  }
  if (errors.length > 0) return { valid: false, errors };

  const backup: AppBackup = {
    schemaVersion: 4,
    exportedAt: value['exportedAt'] as string,
    settings: value['settings'] as Settings,
    categories,
    expenses,
    monthlyIncomes: incomes,
    savingsGoals: goals,
    savingsTransactions: transactions,
    monthlyBudgets: budgets,
    recurrenceExceptions: exceptions,
  };
  const sortedDates = [...expenses.map((expense) => expense.date), ...incomes.map((income) => income.date)].sort();
  const preview: ImportPreview = {
    expenseCount: expenses.length,
    categoryCount: categories.length,
    incomeCount: incomes.length,
    savingsGoalCount: goals.length,
    savingsTransactionCount: transactions.length,
    budgetCount: budgets.length,
    recurrenceExceptionCount: exceptions.length,
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
