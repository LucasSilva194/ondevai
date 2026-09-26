import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataMigrationService } from '../../core/migration/local-data-migration.service';
import { PwaService } from '../../core/services/pwa.service';
import { AppStore } from '../../core/stores/app.store';
import { AppBackup, DEFAULT_SETTINGS } from '../../models/domain.models';
import { DataManagementComponent } from './data-management.component';

const backup: AppBackup = {
  schemaVersion: 4,
  exportedAt: '2026-09-25T12:00:00.000Z',
  settings: { ...DEFAULT_SETTINGS },
  categories: [], expenses: [], monthlyIncomes: [], savingsGoals: [],
  savingsTransactions: [], monthlyBudgets: [], recurrenceExceptions: [],
};

describe('DataManagementComponent', () => {
  const settings = signal({ ...DEFAULT_SETTINGS });
  const lastSyncedAt = signal<string | null>('2026-09-25T12:00:00.000Z');
  const migrationSummary = signal<{ totalRecords: number } | null>({ totalRecords: 3 });
  const importBackup = vi.fn().mockResolvedValue(undefined);
  const clearAll = vi.fn().mockResolvedValue(undefined);
  const detectLocalData = vi.fn().mockResolvedValue({ totalRecords: 3 });
  let fixture: ComponentFixture<DataManagementComponent>;

  beforeEach(async () => {
    importBackup.mockClear();
    clearAll.mockClear();
    detectLocalData.mockClear();
    await TestBed.configureTestingModule({
      imports: [DataManagementComponent],
      providers: [
        provideRouter([]),
        {
          provide: AppStore,
          useValue: {
            settings: settings.asReadonly(),
            lastSyncedAt: lastSyncedAt.asReadonly(),
            syncing: () => false,
            connectionError: () => null,
            operationPending: () => false,
            exportBackup: vi.fn().mockResolvedValue(undefined),
            parseBackup: vi.fn(),
            importBackup,
            clearAll,
            repeatOnboarding: vi.fn(),
          },
        },
        { provide: PwaService, useValue: { offline: () => false } },
        {
          provide: LocalDataMigrationService,
          useValue: { summary: migrationSummary.asReadonly(), status: () => 'available', detectLocalData },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DataManagementComponent);
    fixture.detectChanges();
  });

  it('descreve armazenamento cloud, sincronização e preservação dos dados legados', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('guardada na sua conta cloud');
    expect(text).toContain('Última sincronização');
    expect(text).toContain('3 registos no IndexedDB antigo');
    expect(text).toContain('não apaga dados antigos do IndexedDB');
  });

  it('exige confirmação explícita e importa por substituição', async () => {
    fixture.componentInstance.pendingBackup.set(backup);
    fixture.componentInstance.importForm.setValue({ confirmation: 'errado' });
    await fixture.componentInstance.confirmImport();
    expect(importBackup).not.toHaveBeenCalled();

    fixture.componentInstance.importForm.setValue({ confirmation: 'SUBSTITUIR' });
    await fixture.componentInstance.confirmImport();

    expect(importBackup).toHaveBeenCalledWith(backup);
    expect(fixture.componentInstance.successMessage()).toContain('substituídos');
  });

  it('mostra erro de importação sem limpar a pré-visualização nem os dados cloud', async () => {
    importBackup.mockRejectedValueOnce(new Error('Rollback confirmado'));
    fixture.componentInstance.pendingBackup.set(backup);
    fixture.componentInstance.importForm.setValue({ confirmation: 'SUBSTITUIR' });

    await fixture.componentInstance.confirmImport();

    expect(fixture.componentInstance.operationError()).toBe('Rollback confirmado');
    expect(fixture.componentInstance.pendingBackup()).toBe(backup);
  });

  it('clear-all exige confirmação, mantém a sessão e navega para onboarding', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.deleteForm.setValue({ confirmation: 'APAGAR' });
    await fixture.componentInstance.deleteAll();
    expect(clearAll).not.toHaveBeenCalled();

    fixture.componentInstance.deleteForm.setValue({ confirmation: 'APAGAR DADOS' });
    await fixture.componentInstance.deleteAll();

    expect(clearAll).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/onboarding']);
  });
});
