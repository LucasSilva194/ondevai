import { describe, expect, it } from 'vitest';
import { AppBackup } from '../../models/domain.models';
import { parseBackupContents, validateBackup } from './backup-validation';

const backup: AppBackup = {
  schemaVersion: 3,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 },
  categories: [{
    id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false,
    subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }],
  }],
  expenses: [{
    id: 'expense-1', date: '2026-09-15', amountCents: 1299, categoryId: 'food', subcategoryId: 'supermarket', fixed: false,
    createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z',
  }],
  monthlyIncomes: [{
    id: 'income-1', name: 'Salário', kind: 'salary', amountCents: 180000, receivedMonth: '2026-09', fixed: true, active: true,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  }],
  savingsGoals: [{
    id: 'goal-1', name: 'Fundo de reserva', kind: 'reserve', targetAmountCents: 600000,
    currentAmountCents: 120000, monthlyContributionCents: 20000,
    createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z',
  }],
};

describe('backup validation', () => {
  it('valida o formato e produz a pré-visualização', () => {
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.preview).toEqual({
      expenseCount: 1,
      categoryCount: 1,
      incomeCount: 1,
      savingsGoalCount: 1,
      firstDate: '2026-09-15',
      lastDate: '2026-09-15',
      exportedAt: '2026-09-17T10:00:00.000Z',
    });
  });

  it('migra backups da versão 1 sem rendimentos nem objetivos', () => {
    const legacyExpenses = backup.expenses.map(({ fixed, ...expense }) => {
      void fixed;
      return expense;
    });
    const legacyBackup = {
      schemaVersion: 1,
      exportedAt: backup.exportedAt,
      settings: backup.settings,
      categories: backup.categories,
      expenses: legacyExpenses,
    };
    const result = validateBackup(legacyBackup);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.backup.schemaVersion).toBe(3);
      expect(result.backup.monthlyIncomes).toEqual([]);
      expect(result.backup.savingsGoals).toEqual([]);
      expect(result.backup.expenses[0].fixed).toBe(false);
    }
  });

  it('migra rendimentos mensais da versão 2 como fixos', () => {
    const legacyIncomes = backup.monthlyIncomes.map(({ fixed, receivedMonth, ...income }) => {
      void fixed;
      void receivedMonth;
      return income;
    });
    const legacyExpenses = backup.expenses.map(({ fixed, ...expense }) => {
      void fixed;
      return expense;
    });
    const result = validateBackup({ ...backup, schemaVersion: 2, monthlyIncomes: legacyIncomes, expenses: legacyExpenses });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.backup.monthlyIncomes[0].fixed).toBe(true);
      expect(result.backup.monthlyIncomes[0].receivedMonth).toBe('2026-09');
      expect(result.backup.expenses[0].fixed).toBe(false);
    }
  });

  it('rejeita relações inválidas e valores monetários inválidos', () => {
    const invalid = structuredClone(backup) as AppBackup;
    invalid.expenses[0].categoryId = 'missing';
    invalid.expenses[0].amountCents = -1;
    const result = validateBackup(invalid);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.errors.join(' ')).toMatch(/campos inválidos|categoria inexistente/);
  });

  it('rejeita JSON malformado sem produzir dados importáveis', () => {
    const result = parseBackupContents('{"schemaVersion":');
    expect(result).toEqual({ valid: false, errors: ['O ficheiro não contém JSON válido.'] });
  });
});
