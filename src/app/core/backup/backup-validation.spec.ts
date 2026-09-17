import { describe, expect, it } from 'vitest';
import { AppBackup } from '../../models/domain.models';
import { parseBackupContents, validateBackup } from './backup-validation';

const backup: AppBackup = {
  schemaVersion: 1,
  exportedAt: '2026-09-17T10:00:00.000Z',
  settings: { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 },
  categories: [{
    id: 'food', name: 'Alimentação', color: '#52796f', order: 0, archived: false,
    subcategories: [{ id: 'supermarket', name: 'Supermercado', archived: false }],
  }],
  expenses: [{
    id: 'expense-1', date: '2026-09-15', amountCents: 1299, categoryId: 'food', subcategoryId: 'supermarket',
    createdAt: '2026-09-15T10:00:00.000Z', updatedAt: '2026-09-15T10:00:00.000Z',
  }],
};

describe('backup validation', () => {
  it('valida o formato e produz a pré-visualização', () => {
    const result = validateBackup(backup);
    expect(result.valid).toBe(true);
    if (result.valid) expect(result.preview).toEqual({
      expenseCount: 1,
      categoryCount: 1,
      firstDate: '2026-09-15',
      lastDate: '2026-09-15',
      exportedAt: '2026-09-17T10:00:00.000Z',
    });
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
