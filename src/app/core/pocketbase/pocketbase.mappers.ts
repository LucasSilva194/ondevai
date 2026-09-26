import {
  Category,
  Expense,
  IncomeKind,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  RecurrenceExceptionChanges,
  RecurrenceFrequency,
  RecurrenceRule,
  RecurrenceStatus,
  SavingsGoal,
  SavingsGoalKind,
  SavingsTransaction,
  SavingsTransactionType,
  Settings,
  Subcategory,
} from '../../models/domain.models';
import {
  BudgetRecord,
  BudgetRecordData,
  CategoryRecord,
  CategoryRecordData,
  ExpenseRecord,
  ExpenseRecordData,
  IncomeRecord,
  IncomeRecordData,
  RecurrenceExceptionRecord,
  RecurrenceExceptionRecordData,
  SavingsGoalRecord,
  SavingsGoalRecordData,
  SavingsTransactionRecord,
  SavingsTransactionRecordData,
  SettingsRecord,
  SettingsRecordData,
} from './pocketbase.types';

const recurrenceFrequencies = new Set<RecurrenceFrequency>(['weekly', 'monthly', 'yearly']);
const recurrenceStatuses = new Set<RecurrenceStatus>(['active', 'paused']);
const incomeKinds = new Set<IncomeKind>(['salary', 'subsidy', 'freelance', 'other']);
const goalKinds = new Set<SavingsGoalKind>(['general', 'reserve', 'home', 'car', 'travel', 'education', 'other']);
const transactionTypes = new Set<SavingsTransactionType>(['opening', 'deposit', 'withdrawal']);

function invalid(field: string): never {
  throw new Error(`O campo ${field} recebido do servidor não é válido.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) return invalid(field);
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return requireText(value, field);
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') return invalid(field);
  return value;
}

function requireInteger(value: unknown, field: string, minimum: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) return invalid(field);
  return value as number;
}

function requireCivilDate(value: unknown, field: string): string {
  const result = requireText(value, field);
  if (!/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/.test(result)) return invalid(field);
  return result;
}

function requireCivilMonth(value: unknown, field: string): string {
  const result = requireText(value, field);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result)) return invalid(field);
  return result;
}

function normalizeTimestamp(value: unknown, field: string): string {
  const timestamp = requireText(value, field);
  const parsed = new Date(timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T'));
  if (Number.isNaN(parsed.valueOf())) return invalid(field);
  return parsed.toISOString();
}

function requireEnum<T extends string>(value: unknown, allowed: ReadonlySet<T>, field: string): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) return invalid(field);
  return value as T;
}

function recurrenceFromJson(value: unknown, field: string): RecurrenceRule | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isObject(value)) return invalid(field);

  const endDate = optionalText(value['endDate'], `${field}.endDate`);
  const pausedFrom = optionalText(value['pausedFrom'], `${field}.pausedFrom`);
  return {
    frequency: requireEnum(value['frequency'], recurrenceFrequencies, `${field}.frequency`),
    interval: requireInteger(value['interval'], `${field}.interval`, 1),
    startDate: requireCivilDate(value['startDate'], `${field}.startDate`),
    status: requireEnum(value['status'], recurrenceStatuses, `${field}.status`),
    ...(endDate ? { endDate: requireCivilDate(endDate, `${field}.endDate`) } : {}),
    ...(pausedFrom ? { pausedFrom: requireCivilDate(pausedFrom, `${field}.pausedFrom`) } : {}),
  };
}

function subcategoriesFromJson(value: unknown): Subcategory[] {
  if (!Array.isArray(value)) return invalid('subcategories');
  return value.map((item, index) => {
    if (!isObject(item)) return invalid(`subcategories[${index}]`);
    return {
      id: requireText(item['id'], `subcategories[${index}].id`),
      name: requireText(item['name'], `subcategories[${index}].name`),
      archived: requireBoolean(item['archived'], `subcategories[${index}].archived`),
    };
  });
}

function exceptionChangesFromJson(value: unknown): RecurrenceExceptionChanges | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isObject(value)) return invalid('changes');

  const date = optionalText(value['date'], 'changes.date');
  const amountCents = value['amountCents'];
  const categoryId = optionalText(value['categoryId'], 'changes.categoryId');
  const subcategoryId = optionalText(value['subcategoryId'], 'changes.subcategoryId');
  const description = optionalText(value['description'], 'changes.description');
  const name = optionalText(value['name'], 'changes.name');
  const kind = optionalText(value['kind'], 'changes.kind');

  return {
    ...(date ? { date: requireCivilDate(date, 'changes.date') } : {}),
    ...(amountCents === undefined || amountCents === null
      ? {}
      : { amountCents: requireInteger(amountCents, 'changes.amountCents', 1) }),
    ...(categoryId ? { categoryId } : {}),
    ...(subcategoryId ? { subcategoryId } : {}),
    ...(description ? { description } : {}),
    ...(name ? { name } : {}),
    ...(kind ? { kind: requireEnum(kind, incomeKinds, 'changes.kind') } : {}),
  };
}

export function expenseFromRecord(record: ExpenseRecord): Expense {
  const subcategoryId = optionalText(record.subcategoryId, 'subcategoryId');
  const description = optionalText(record.description, 'description');
  const recurrence = recurrenceFromJson(record.recurrence, 'recurrence');
  return {
    id: requireText(record.id, 'id'),
    date: requireCivilDate(record.date, 'date'),
    amountCents: requireInteger(record.amountCents, 'amountCents', 1),
    categoryId: requireText(record.category, 'category'),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
    ...(subcategoryId ? { subcategoryId } : {}),
    ...(description ? { description } : {}),
    ...(recurrence ? { recurrence } : {}),
  };
}

export function expenseToRecordData(expense: Expense, owner: string): ExpenseRecordData {
  return {
    owner,
    date: expense.date,
    amountCents: expense.amountCents,
    category: expense.categoryId,
    ...(expense.subcategoryId ? { subcategoryId: expense.subcategoryId } : {}),
    ...(expense.description ? { description: expense.description } : {}),
    ...(expense.recurrence ? { recurrence: { ...expense.recurrence } } : {}),
  };
}

export function categoryFromRecord(record: CategoryRecord): Category {
  const icon = optionalText(record.icon, 'icon');
  return {
    id: requireText(record.id, 'id'),
    name: requireText(record.name, 'name'),
    color: requireText(record.color, 'color'),
    order: requireInteger(record.order, 'order', 0),
    archived: requireBoolean(record.archived, 'archived'),
    subcategories: subcategoriesFromJson(record.subcategories),
    ...(icon ? { icon } : {}),
  };
}

export function categoryToRecordData(category: Category, owner: string): CategoryRecordData {
  return {
    owner,
    name: category.name,
    color: category.color,
    order: category.order,
    archived: category.archived,
    subcategories: category.subcategories.map((item) => ({ ...item })),
    ...(category.icon ? { icon: category.icon } : {}),
  };
}

export function incomeFromRecord(record: IncomeRecord): MonthlyIncome {
  const recurrence = recurrenceFromJson(record.recurrence, 'recurrence');
  return {
    id: requireText(record.id, 'id'),
    name: requireText(record.name, 'name'),
    kind: requireEnum(record.kind, incomeKinds, 'kind'),
    amountCents: requireInteger(record.amountCents, 'amountCents', 1),
    date: requireCivilDate(record.date, 'date'),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
    ...(recurrence ? { recurrence } : {}),
  };
}

export function incomeToRecordData(income: MonthlyIncome, owner: string): IncomeRecordData {
  return {
    owner,
    name: income.name,
    kind: income.kind,
    amountCents: income.amountCents,
    date: income.date,
    ...(income.recurrence ? { recurrence: { ...income.recurrence } } : {}),
  };
}

export function savingsGoalFromRecord(record: SavingsGoalRecord): SavingsGoal {
  const targetDate = optionalText(record.targetDate, 'targetDate');
  return {
    id: requireText(record.id, 'id'),
    name: requireText(record.name, 'name'),
    kind: requireEnum(record.kind, goalKinds, 'kind'),
    targetAmountCents: requireInteger(record.targetAmountCents, 'targetAmountCents', 1),
    currentAmountCents: requireInteger(record.currentAmountCents, 'currentAmountCents', 0),
    monthlyContributionCents: requireInteger(record.monthlyContributionCents, 'monthlyContributionCents', 0),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
    ...(targetDate ? { targetDate: requireCivilDate(targetDate, 'targetDate') } : {}),
  };
}

export function savingsGoalToRecordData(goal: SavingsGoal, owner: string): SavingsGoalRecordData {
  return {
    owner,
    name: goal.name,
    kind: goal.kind,
    targetAmountCents: goal.targetAmountCents,
    currentAmountCents: goal.currentAmountCents,
    monthlyContributionCents: goal.monthlyContributionCents,
    ...(goal.targetDate ? { targetDate: goal.targetDate } : {}),
  };
}

export function savingsTransactionFromRecord(record: SavingsTransactionRecord): SavingsTransaction {
  const note = optionalText(record.note, 'note');
  return {
    id: requireText(record.id, 'id'),
    goalId: requireText(record.goal, 'goal'),
    type: requireEnum(record.type, transactionTypes, 'type'),
    amountCents: requireInteger(record.amountCents, 'amountCents', 1),
    effectiveDate: requireCivilDate(record.effectiveDate, 'effectiveDate'),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
    ...(note ? { note } : {}),
  };
}

export function savingsTransactionToRecordData(transaction: SavingsTransaction, owner: string): SavingsTransactionRecordData {
  return {
    owner,
    goal: transaction.goalId,
    type: transaction.type,
    amountCents: transaction.amountCents,
    effectiveDate: transaction.effectiveDate,
    ...(transaction.note ? { note: transaction.note } : {}),
  };
}

export function budgetFromRecord(record: BudgetRecord): MonthlyBudget {
  return {
    id: requireText(record.id, 'id'),
    month: requireCivilMonth(record.month, 'month'),
    categoryId: requireText(record.category, 'category'),
    amountCents: requireInteger(record.amountCents, 'amountCents', 1),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
  };
}

export function budgetToRecordData(budget: MonthlyBudget, owner: string): BudgetRecordData {
  return {
    owner,
    month: budget.month,
    category: budget.categoryId,
    amountCents: budget.amountCents,
  };
}

export function recurrenceExceptionFromRecord(record: RecurrenceExceptionRecord): RecurrenceException {
  const changes = exceptionChangesFromJson(record.changes);
  return {
    id: requireText(record.id, 'id'),
    seriesType: requireEnum(record.seriesType, new Set(['expense', 'income']), 'seriesType'),
    seriesId: requireText(record.seriesId, 'seriesId'),
    occurrenceDate: requireCivilDate(record.occurrenceDate, 'occurrenceDate'),
    action: requireEnum(record.action, new Set(['skip', 'override']), 'action'),
    createdAt: normalizeTimestamp(record.created, 'created'),
    updatedAt: normalizeTimestamp(record.updated, 'updated'),
    ...(changes ? { changes } : {}),
  };
}

export function recurrenceExceptionToRecordData(exception: RecurrenceException, owner: string): RecurrenceExceptionRecordData {
  return {
    owner,
    seriesType: exception.seriesType,
    seriesId: exception.seriesId,
    occurrenceDate: exception.occurrenceDate,
    action: exception.action,
    ...(exception.changes ? { changes: { ...exception.changes } } : {}),
  };
}

export function settingsFromRecord(record: SettingsRecord): Settings {
  const lastExportAt = optionalText(record.lastExportAt, 'lastExportAt');
  if (record.currency !== 'EUR') return invalid('currency');
  if (record.locale !== 'pt-PT') return invalid('locale');
  return {
    currency: record.currency,
    locale: record.locale,
    onboardingCompleted: requireBoolean(record.onboardingCompleted, 'onboardingCompleted'),
    changesSinceExport: requireInteger(record.changesSinceExport, 'changesSinceExport', 0),
    ...(lastExportAt ? { lastExportAt: normalizeTimestamp(lastExportAt, 'lastExportAt') } : {}),
  };
}

export function settingsToRecordData(settings: Settings, owner: string): SettingsRecordData {
  return {
    owner,
    currency: settings.currency,
    locale: settings.locale,
    onboardingCompleted: settings.onboardingCompleted,
    changesSinceExport: settings.changesSinceExport,
    ...(settings.lastExportAt ? { lastExportAt: settings.lastExportAt } : {}),
  };
}
