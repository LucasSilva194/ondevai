import { describe, expect, it } from 'vitest';
import { AppBackup } from '../../models/domain.models';
import { parseBackupContents, validateBackup } from './backup-validation';

const backup: AppBackup = {
  schemaVersion: 4,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 },
  categories: [{ id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false, subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }] }],
  expenses: [{ id: 'expense-1', date: '2026-09-15', amountCents: 1299, categoryId: 'food', subcategoryId: 'supermarket', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-09-15', status: 'active' }, createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z' }],
  monthlyIncomes: [{ id: 'income-1', name: 'Salário', kind: 'salary', amountCents: 180000, date: '2026-09-01', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-09-01', status: 'active' }, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
  savingsGoals: [{ id: 'goal-1', name: 'Fundo de reserva', kind: 'reserve', targetAmountCents: 600000, currentAmountCents: 120000, monthlyContributionCents: 20000, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
  savingsTransactions: [{ id: 'opening-1', goalId: 'goal-1', type: 'opening', amountCents: 120000, effectiveDate: '2026-09-01', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
  monthlyBudgets: [{ id: 'budget-1', month: '2026-09', categoryId: 'food', amountCents: 30000, createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
  recurrenceExceptions: [{ id: 'exception-1', seriesType: 'expense', seriesId: 'expense-1', occurrenceDate: '2026-10-15', action: 'skip', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z' }],
};

describe('backup validation', () => {
  it('valida a versão 4, relações e pré-visualização', () => {
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.preview).toMatchObject({ expenseCount: 1, incomeCount: 1, savingsGoalCount: 1, savingsTransactionCount: 1, budgetCount: 1, recurrenceExceptionCount: 1 });
  });

  it.each([1, 2, 3])('aceita e migra um backup antigo da versão %s', (schemaVersion) => {
    const legacy = {
      schemaVersion,
      exportedAt: backup.exportedAt,
      settings: backup.settings,
      categories: backup.categories,
      expenses: [{ id: 'old-expense', date: '2026-01-31', amountCents: 1000, categoryId: 'food', fixed: schemaVersion === 3, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      ...(schemaVersion >= 2 ? {
        monthlyIncomes: [{ id: 'old-income', name: 'Salário', kind: 'salary', amountCents: 100000, active: true, ...(schemaVersion === 3 ? { receivedMonth: '2026-01', fixed: true } : {}), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
        savingsGoals: [{ id: 'old-goal', name: 'Reserva', kind: 'reserve', targetAmountCents: 50000, currentAmountCents: 10000, monthlyContributionCents: 1000, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      } : {}),
    };
    const result = validateBackup(legacy);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.backup.schemaVersion).toBe(4);
      if (schemaVersion >= 2) {
        expect(result.backup.savingsTransactions[0]).toMatchObject({ type: 'opening', amountCents: 10000 });
        expect(result.backup.monthlyIncomes[0].date).toBe('2026-01-01');
      }
      if (schemaVersion === 3) expect(result.backup.expenses[0].recurrence?.frequency).toBe('monthly');
    }
  });

  it('faz round-trip sem perda nem duplicação', () => {
    const first = validateBackup(structuredClone(backup));
    expect(first.valid).toBe(true);
    if (!first.valid) return;
    const second = parseBackupContents(JSON.stringify(first.backup));
    expect(second.valid).toBe(true);
    if (second.valid) expect(second.backup).toEqual(first.backup);
  });

  it('rejeita duplicados, relações e saldos inconsistentes', () => {
    const invalid = structuredClone(backup);
    invalid.monthlyBudgets.push({ ...invalid.monthlyBudgets[0], id: 'budget-duplicate' });
    invalid.savingsGoals[0].currentAmountCents = 1;
    const result = validateBackup(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/mais do que um orçamento|não corresponde ao saldo/);
  });

  it('rejeita JSON malformado', () => {
    expect(parseBackupContents('{"schemaVersion":')).toEqual({ valid: false, errors: ['O ficheiro não contém JSON válido.'] });
  });
});
