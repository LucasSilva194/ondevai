import { describe, expect, it } from 'vitest';
import {
  budgetFromRecord,
  budgetToRecordData,
  categoryFromRecord,
  categoryToRecordData,
  expenseFromRecord,
  expenseToRecordData,
  incomeFromRecord,
  incomeToRecordData,
  recurrenceExceptionFromRecord,
  recurrenceExceptionToRecordData,
  savingsGoalFromRecord,
  savingsGoalToRecordData,
  savingsTransactionFromRecord,
  savingsTransactionToRecordData,
  settingsFromRecord,
  settingsToRecordData,
} from './pocketbase.mappers';
import {
  BudgetRecord,
  CategoryRecord,
  ExpenseRecord,
  IncomeRecord,
  PocketBaseRecordBase,
  RecurrenceExceptionRecord,
  SavingsGoalRecord,
  SavingsTransactionRecord,
  SettingsRecord,
} from './pocketbase.types';

const owner = 'u'.repeat(15);
const base: PocketBaseRecordBase = {
  id: 'r'.repeat(15),
  collectionId: 'collection',
  collectionName: 'records',
  owner,
  created: '2026-09-25 23:30:00.000Z',
  updated: '2026-09-26 00:30:00.000Z',
};

describe('PocketBase mappers', () => {
  it('mapeia despesas nos dois sentidos sem alterar a data civil, cêntimos, relação ou recorrência', () => {
    const record: ExpenseRecord = {
      ...base,
      date: '2026-03-29',
      amountCents: 12345,
      category: 'c'.repeat(15),
      subcategoryId: '',
      description: '',
      recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-03-29', endDate: '2027-03-29', status: 'active' },
    };
    const domain = expenseFromRecord(record);
    expect(domain).toMatchObject({ date: '2026-03-29', amountCents: 12345, categoryId: 'c'.repeat(15) });
    expect(domain.createdAt).toBe('2026-09-25T23:30:00.000Z');
    expect(domain.subcategoryId).toBeUndefined();
    expect(domain.description).toBeUndefined();
    expect(expenseToRecordData(domain, owner)).toEqual({
      owner,
      date: '2026-03-29',
      amountCents: 12345,
      category: 'c'.repeat(15),
      recurrence: record.recurrence,
    });
  });

  it('mapeia categorias e valida o JSON de subcategorias', () => {
    const record: CategoryRecord = {
      ...base,
      name: 'Casa',
      color: '#112233',
      icon: '',
      order: 2,
      archived: false,
      subcategories: [{ id: 'sub-1', name: 'Renda', archived: false }],
    };
    const domain = categoryFromRecord(record);
    expect(domain.icon).toBeUndefined();
    expect(domain.subcategories).toEqual([{ id: 'sub-1', name: 'Renda', archived: false }]);
    expect(categoryToRecordData(domain, owner)).toMatchObject({ owner, subcategories: domain.subcategories });
    expect(() => categoryFromRecord({ ...record, subcategories: [{ id: 'bad' }] })).toThrow(/subcategories/);
  });

  it('mapeia rendimentos e respetivo JSON de recorrência', () => {
    const record: IncomeRecord = {
      ...base,
      name: 'Salário',
      kind: 'salary',
      amountCents: 250000,
      date: '2026-10-01',
      recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-10-01', status: 'paused', pausedFrom: '2027-01-01' },
    };
    const domain = incomeFromRecord(record);
    expect(domain.recurrence?.pausedFrom).toBe('2027-01-01');
    expect(incomeToRecordData(domain, owner)).toMatchObject({ owner, kind: 'salary', amountCents: 250000 });
  });

  it('mapeia objetivos e campos opcionais vazios', () => {
    const record: SavingsGoalRecord = {
      ...base,
      name: 'Reserva',
      kind: 'reserve',
      targetAmountCents: 100000,
      currentAmountCents: 25000,
      monthlyContributionCents: 10000,
      targetDate: '',
    };
    const domain = savingsGoalFromRecord(record);
    expect(domain.targetDate).toBeUndefined();
    expect(savingsGoalToRecordData(domain, owner)).toEqual({
      owner,
      name: 'Reserva',
      kind: 'reserve',
      targetAmountCents: 100000,
      currentAmountCents: 25000,
      monthlyContributionCents: 10000,
    });
  });

  it('mapeia movimentos e a relação goal', () => {
    const record: SavingsTransactionRecord = {
      ...base,
      goal: 'g'.repeat(15),
      type: 'deposit',
      amountCents: 9900,
      effectiveDate: '2026-09-25',
      note: '',
    };
    const domain = savingsTransactionFromRecord(record);
    expect(domain).toMatchObject({ goalId: 'g'.repeat(15), amountCents: 9900 });
    expect(domain.note).toBeUndefined();
    expect(savingsTransactionToRecordData(domain, owner)).toMatchObject({ owner, goal: 'g'.repeat(15) });
  });

  it('mapeia orçamentos e a relação category', () => {
    const record: BudgetRecord = { ...base, month: '2026-09', category: 'c'.repeat(15), amountCents: 50000 };
    const domain = budgetFromRecord(record);
    expect(domain).toMatchObject({ month: '2026-09', categoryId: 'c'.repeat(15), amountCents: 50000 });
    expect(budgetToRecordData(domain, owner)).toMatchObject({ owner, category: 'c'.repeat(15) });
  });

  it('mapeia exceções e valida o JSON de alterações', () => {
    const record: RecurrenceExceptionRecord = {
      ...base,
      seriesType: 'expense',
      seriesId: 'e'.repeat(15),
      occurrenceDate: '2026-09-30',
      action: 'override',
      changes: { date: '2026-10-01', amountCents: 4200, categoryId: 'c'.repeat(15) },
    };
    const domain = recurrenceExceptionFromRecord(record);
    expect(domain.changes).toEqual(record.changes);
    expect(recurrenceExceptionToRecordData(domain, owner)).toMatchObject({ owner, changes: record.changes });
    expect(() => recurrenceExceptionFromRecord({ ...record, changes: { amountCents: 1.5 } })).toThrow(/changes.amountCents/);
  });

  it('mapeia settings existentes, timestamps opcionais e inteiros', () => {
    const record: SettingsRecord = {
      ...base,
      currency: 'EUR',
      locale: 'pt-PT',
      onboardingCompleted: true,
      lastExportAt: '2026-09-25 18:30:00.000Z',
      changesSinceExport: 3,
    };
    const domain = settingsFromRecord(record);
    expect(domain.lastExportAt).toBe('2026-09-25T18:30:00.000Z');
    expect(settingsToRecordData(domain, owner)).toEqual({ owner, ...domain });
  });
});
