import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import {
  LocalDataMigrationService,
  LocalDataMigrationState,
  LocalDataSummary,
} from '../../core/migration/local-data-migration.service';
import { LocalDataMigrationComponent } from './local-data-migration.component';

describe('LocalDataMigrationComponent', () => {
  const summary: LocalDataSummary = {
    counts: {
      categories: 2,
      expenses: 5,
      monthlyIncomes: 1,
      savingsGoals: 1,
      savingsTransactions: 2,
      monthlyBudgets: 1,
      recurrenceExceptions: 1,
    },
    totalRecords: 13,
    firstDate: '2026-01-01',
    lastDate: '2026-09-25',
  };
  const state = signal<LocalDataMigrationState>({
    status: 'available', summary, attempt: null, result: null, error: null, failureKind: null,
  });
  const detectLocalData = vi.fn().mockResolvedValue(summary);
  const createLocalSnapshot = vi.fn();
  const createMigrationAttempt = vi.fn();
  const uploadMigration = vi.fn();
  const navigate = vi.fn().mockResolvedValue(true);
  let fixture: ComponentFixture<LocalDataMigrationComponent>;

  beforeEach(async () => {
    state.set({ status: 'available', summary, attempt: null, result: null, error: null, failureKind: null });
    detectLocalData.mockClear();
    createLocalSnapshot.mockReset();
    createMigrationAttempt.mockReset();
    uploadMigration.mockReset();
    navigate.mockClear();
    await TestBed.configureTestingModule({
      imports: [LocalDataMigrationComponent],
      providers: [
        {
          provide: LocalDataMigrationService,
          useValue: {
            state: state.asReadonly(),
            status: () => state().status,
            summary: () => state().summary,
            error: () => state().error,
            detectLocalData,
            createLocalSnapshot,
            createMigrationAttempt,
            uploadMigration,
          },
        },
        { provide: AuthService, useValue: { user: () => ({ id: 'user-a', email: 'user@example.com', verified: true }) } },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LocalDataMigrationComponent);
    fixture.detectChanges();
  });

  it('mostra a pré-visualização, o intervalo e os avisos de preservação', () => {
    const text = fixture.nativeElement.textContent as string;

    expect(detectLocalData).toHaveBeenCalledOnce();
    expect(text).toContain('O que será copiado');
    expect(text).toContain('13 registos');
    expect(text).toContain('01/01/2026 — 25/09/2026');
    expect(text).toContain('Nada será removido do IndexedDB');
    expect(text).toContain('Continuar sem importar');
  });

  it('prepara a tentativa e só depois chama o upload', async () => {
    const snapshot = { schemaVersion: 4 };
    const attempt = { idempotencyKey: 'key' };
    createLocalSnapshot.mockResolvedValue(snapshot);
    createMigrationAttempt.mockResolvedValue(attempt);
    uploadMigration.mockResolvedValue({ status: 'imported' });

    await fixture.componentInstance.startMigration();

    expect(createMigrationAttempt).toHaveBeenCalledWith('user-a', snapshot);
    expect(uploadMigration).toHaveBeenCalledWith(snapshot, attempt);
    expect(createLocalSnapshot.mock.invocationCallOrder[0]).toBeLessThan(createMigrationAttempt.mock.invocationCallOrder[0]);
    expect(createMigrationAttempt.mock.invocationCallOrder[0]).toBeLessThan(uploadMigration.mock.invocationCallOrder[0]);
  });

  it('permite continuar sem importar sem limpar metadata nem IndexedDB', async () => {
    await fixture.componentInstance.continueWithoutImport();

    expect(navigate).toHaveBeenCalledWith(['/visao-geral']);
    expect(createLocalSnapshot).not.toHaveBeenCalled();
    expect(uploadMigration).not.toHaveBeenCalled();
  });
});
