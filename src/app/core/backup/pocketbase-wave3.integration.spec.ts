import { describe, expect, it } from 'vitest';
import { AppBackup } from '../../models/domain.models';
import {
  calculateBackupFingerprint,
  deterministicBackupRepresentation,
} from './backup-fingerprint';
import { validateBackup } from './backup-validation';

const ISO = '2026-09-25T10:00:00.000Z';

function wave3Backup(): AppBackup {
  return {
    schemaVersion: 4,
    exportedAt: ISO,
    settings: {
      currency: 'EUR',
      locale: 'pt-PT',
      onboardingCompleted: true,
      lastExportAt: '2026-09-24T09:00:00.000Z',
      changesSinceExport: 7,
    },
    categories: [
      {
        // Static suggested-category identifier: it must remain valid input even
        // though the server allocates a fresh PocketBase record id.
        id: 'alimentacao',
        name: 'Alimentação',
        color: '#52796F',
        icon: 'basket',
        order: 0,
        archived: false,
        subcategories: [{ id: 'legacy-subcategory', name: 'Supermercado', archived: false }],
      },
      {
        // Already PocketBase-shaped input ids must also be remapped server-side.
        id: 'cat000000000001',
        name: 'Casa',
        color: '#112233',
        order: 1,
        archived: false,
        subcategories: [],
      },
    ],
    expenses: [
      {
        id: '8faec59f-30a0-4a3b-90db-96382b746e56',
        date: '2026-09-25',
        amountCents: 1299,
        categoryId: 'alimentacao',
        subcategoryId: 'legacy-subcategory',
        description: 'Compras',
        recurrence: {
          frequency: 'monthly',
          interval: 1,
          startDate: '2026-09-25',
          endDate: '2027-09-25',
          status: 'active',
        },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    monthlyIncomes: [
      {
        id: 'income000000001',
        name: 'Salário',
        kind: 'salary',
        amountCents: 180000,
        date: '2026-09-01',
        recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-09-01', status: 'active' },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    savingsGoals: [
      {
        id: '2f9df608-42ac-42a4-bd19-285b9abce77e',
        name: 'Reserva',
        kind: 'reserve',
        targetAmountCents: 500000,
        currentAmountCents: 10500,
        monthlyContributionCents: 10000,
        targetDate: '2027-12-31',
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    savingsTransactions: [
      {
        id: 'opening-legacy-id',
        goalId: '2f9df608-42ac-42a4-bd19-285b9abce77e',
        type: 'opening',
        amountCents: 10000,
        effectiveDate: '2026-09-01',
        note: 'Saldo inicial',
        createdAt: ISO,
        updatedAt: ISO,
      },
      {
        id: 'move00000000001',
        goalId: '2f9df608-42ac-42a4-bd19-285b9abce77e',
        type: 'deposit',
        amountCents: 1000,
        effectiveDate: '2026-09-02',
        createdAt: ISO,
        updatedAt: ISO,
      },
      {
        id: 'move00000000002',
        goalId: '2f9df608-42ac-42a4-bd19-285b9abce77e',
        type: 'withdrawal',
        amountCents: 500,
        effectiveDate: '2026-09-03',
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    monthlyBudgets: [
      {
        id: 'budget000000001',
        month: '2026-09',
        categoryId: 'alimentacao',
        amountCents: 30000,
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
    recurrenceExceptions: [
      {
        id: 'except000000001',
        seriesType: 'expense',
        seriesId: '8faec59f-30a0-4a3b-90db-96382b746e56',
        occurrenceDate: '2026-10-25',
        action: 'override',
        changes: {
          date: '2026-10-26',
          amountCents: 1499,
          categoryId: 'cat000000000001',
          description: 'Alterada',
        },
        createdAt: ISO,
        updatedAt: ISO,
      },
    ],
  };
}

function legacyBackup(schemaVersion: 1 | 2 | 3): Record<string, unknown> {
  const current = wave3Backup();
  return {
    schemaVersion,
    exportedAt: current.exportedAt,
    settings: current.settings,
    categories: current.categories,
    expenses: current.expenses.map((expense) => {
      const legacy: Record<string, unknown> = { ...expense, fixed: schemaVersion === 3 };
      delete legacy['recurrence'];
      return legacy;
    }),
    ...(schemaVersion >= 2
      ? {
          monthlyIncomes: current.monthlyIncomes.map((income) => {
            const legacy: Record<string, unknown> = {
              ...income,
              ...(schemaVersion === 3 ? { receivedMonth: income.date.slice(0, 7), fixed: true } : {}),
            };
            delete legacy['date'];
            delete legacy['recurrence'];
            return legacy;
          }),
          savingsGoals: current.savingsGoals.map((goal) => ({ ...goal, currentAmountCents: 10000 })),
        }
      : {}),
  };
}

describe('PocketBase Wave 3 backup integration contract', () => {
  it.each([1, 2, 3] as const)('normaliza backup v%s para o payload v4 esperado pelo backend', (version) => {
    const result = validateBackup(legacyBackup(version));
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.backup.schemaVersion).toBe(4);
    expect(result.backup.monthlyBudgets).toEqual([]);
    expect(result.backup.recurrenceExceptions).toEqual([]);
    if (version === 1) {
      expect(result.backup.monthlyIncomes).toEqual([]);
      expect(result.backup.savingsTransactions).toEqual([]);
    } else {
      expect(result.backup.monthlyIncomes[0].date).toBe('2026-09-01');
      expect(result.backup.savingsTransactions).toEqual([
        expect.objectContaining({
          id: 'opening-2f9df608-42ac-42a4-bd19-285b9abce77e',
          goalId: '2f9df608-42ac-42a4-bd19-285b9abce77e',
          type: 'opening',
          amountCents: 10000,
        }),
      ]);
    }
  });

  it('preserva IDs legados, relações, recorrência, changes.categoryId, settings, datas e cêntimos no payload v4', () => {
    const input = wave3Backup();
    const result = validateBackup(input);
    expect(result.valid).toBe(true);
    if (!result.valid) return;

    expect(result.backup).toEqual(input);
    expect(result.backup.expenses[0]).toMatchObject({
      id: '8faec59f-30a0-4a3b-90db-96382b746e56',
      categoryId: 'alimentacao',
      subcategoryId: 'legacy-subcategory',
      amountCents: 1299,
    });
    expect(result.backup.recurrenceExceptions[0]).toMatchObject({
      seriesId: '8faec59f-30a0-4a3b-90db-96382b746e56',
      changes: { categoryId: 'cat000000000001' },
    });
  });

  it('produz fingerprint estável entre retries e sensível a relações/dinheiro', async () => {
    const backup = wave3Backup();
    const retry = structuredClone(backup);
    retry.exportedAt = '2030-01-01T00:00:00.000Z';

    expect(deterministicBackupRepresentation(retry)).toBe(deterministicBackupRepresentation(backup));
    expect(await calculateBackupFingerprint(retry)).toBe(await calculateBackupFingerprint(backup));

    retry.expenses[0].amountCents += 1;
    expect(await calculateBackupFingerprint(retry)).not.toBe(await calculateBackupFingerprint(backup));
  });

  it.each([
    ['data civil impossível', (backup: AppBackup) => { backup.expenses[0].date = '2026-02-30'; }],
    ['dinheiro fracionário', (backup: AppBackup) => { backup.expenses[0].amountCents = 12.5; }],
    ['dinheiro acima do inteiro seguro', (backup: AppBackup) => { backup.expenses[0].amountCents = Number.MAX_SAFE_INTEGER + 1; }],
    ['categoria forjada', (backup: AppBackup) => { backup.expenses[0].categoryId = 'other-owner-category'; }],
    ['goal forjado', (backup: AppBackup) => { backup.savingsTransactions[0].goalId = 'other-owner-goal'; }],
    ['changes.categoryId forjado', (backup: AppBackup) => {
      backup.recurrenceExceptions[0].changes = { categoryId: 'other-owner-category' };
    }],
  ] as const)('rejeita %s antes do upload', (_label, mutate) => {
    const backup = wave3Backup();
    mutate(backup);
    expect(validateBackup(backup).valid).toBe(false);
  });

  it('rejeita duplicados sem confundir IDs iguais em coleções independentes', () => {
    const validCrossCollection = wave3Backup();
    validCrossCollection.monthlyBudgets[0].id = validCrossCollection.expenses[0].id;
    expect(validateBackup(validCrossCollection).valid).toBe(true);

    const duplicate = wave3Backup();
    duplicate.expenses.push(structuredClone(duplicate.expenses[0]));
    expect(validateBackup(duplicate).valid).toBe(false);
  });

  it('valida o resultado final do ledger e os campos opcionais', () => {
    const withoutOptionalFields = wave3Backup();
    delete withoutOptionalFields.categories[0].icon;
    delete withoutOptionalFields.expenses[0].description;
    delete withoutOptionalFields.savingsGoals[0].targetDate;
    delete withoutOptionalFields.savingsTransactions[0].note;
    delete withoutOptionalFields.settings.lastExportAt;
    expect(validateBackup(withoutOptionalFields).valid).toBe(true);

    withoutOptionalFields.savingsGoals[0].currentAmountCents += 1;
    const invalid = validateBackup(withoutOptionalFields);
    expect(invalid.valid).toBe(false);
    if (!invalid.valid) expect(invalid.errors.join(' ')).toContain('não corresponde ao saldo');
  });
});
