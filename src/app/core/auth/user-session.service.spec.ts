import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataMigrationService } from '../migration/local-data-migration.service';
import { AppStore } from '../stores/app.store';
import { AuthService, AuthUser } from './auth.service';
import { UserSessionService } from './user-session.service';

describe('UserSessionService', () => {
  const user = signal<AuthUser | null>(null);
  const dataReady = signal(false);
  const storeError = signal<string | null>(null);
  const empty = signal<unknown[]>([]);
  let calls: string[];
  let auth: { initialize: ReturnType<typeof vi.fn>; login: ReturnType<typeof vi.fn>; logout: ReturnType<typeof vi.fn>; user: typeof user };
  let store: Record<string, unknown>;
  let migration: { detectLocalData: ReturnType<typeof vi.fn>; getMigrationStatus: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    calls = [];
    user.set(null);
    dataReady.set(false);
    storeError.set(null);
    empty.set([]);
    auth = {
      initialize: vi.fn(async () => { calls.push('auth.initialize'); }),
      login: vi.fn(async () => { calls.push('auth.login'); }),
      logout: vi.fn(() => { calls.push('auth.logout'); }),
      user,
    };
    store = {
      initialize: vi.fn(async () => { calls.push('store.initialize'); }),
      loadAuthenticatedUser: vi.fn(async () => { calls.push('store.load'); }),
      clearUserState: vi.fn(async () => { calls.push('store.clear'); }),
      dataReady,
      error: storeError,
      categories: empty,
      expenses: empty,
      monthlyIncomes: empty,
      savingsGoals: empty,
      savingsTransactions: empty,
      monthlyBudgets: empty,
      recurrenceExceptions: empty,
    };
    migration = {
      detectLocalData: vi.fn().mockResolvedValue({ totalRecords: 0 }),
      getMigrationStatus: vi.fn().mockReturnValue({ status: 'none' }),
    };
    router = { navigate: vi.fn(async () => { calls.push('router.navigate'); return true; }) };

    TestBed.configureTestingModule({ providers: [
      UserSessionService,
      { provide: AuthService, useValue: auth },
      { provide: AppStore, useValue: store },
      { provide: LocalDataMigrationService, useValue: migration },
      { provide: Router, useValue: router },
    ] });
  });

  it('inicializa autenticação antes de carregar ou limpar o AppStore', async () => {
    await TestBed.inject(UserSessionService).initialize();
    expect(calls).toEqual(['auth.initialize', 'store.initialize']);
  });

  it('carrega a conta após login e oferece migração apenas quando há dados locais e a cloud está vazia', async () => {
    user.set({ id: 'u'.repeat(15), email: 'user@example.com', verified: true });
    dataReady.set(true);
    migration.detectLocalData.mockResolvedValue({ totalRecords: 2 });

    await expect(TestBed.inject(UserSessionService).login('user@example.com', 'password')).resolves.toBe('migration');
    expect(calls).toEqual(['auth.login', 'store.load']);

    (store['categories'] as typeof empty).set([{}]);
    await expect(TestBed.inject(UserSessionService).login('user@example.com', 'password')).resolves.toBe('application');
  });

  it('não consulta dados locais antes de uma conta verificada', async () => {
    user.set({ id: 'u'.repeat(15), email: 'user@example.com', verified: false });

    await expect(TestBed.inject(UserSessionService).login('user@example.com', 'password')).resolves.toBe('verification-required');
    expect(migration.detectLocalData).not.toHaveBeenCalled();
    expect(calls).toEqual(['auth.login', 'store.clear']);
  });

  it('não trata um snapshot remoto falhado como conta vazia', async () => {
    user.set({ id: 'u'.repeat(15), email: 'user@example.com', verified: true });
    storeError.set('Servidor indisponível');

    await expect(TestBed.inject(UserSessionService).login('user@example.com', 'password')).rejects.toThrow('Servidor indisponível');
    expect(migration.detectLocalData).not.toHaveBeenCalled();
  });

  it('não volta a apresentar uma migração já concluída, mesmo que a cloud fique vazia', async () => {
    user.set({ id: 'u'.repeat(15), email: 'user@example.com', verified: true });
    dataReady.set(true);
    migration.detectLocalData.mockResolvedValue({ totalRecords: 2 });
    migration.getMigrationStatus.mockReturnValue({ status: 'completed' });

    await expect(TestBed.inject(UserSessionService).login('user@example.com', 'password')).resolves.toBe('application');
  });

  it('no logout limpa dados e subscrições antes do auth store e da navegação', async () => {
    await TestBed.inject(UserSessionService).logout();

    expect(calls).toEqual(['store.clear', 'auth.logout', 'router.navigate']);
    expect(router.navigate).toHaveBeenCalledWith(['/entrar']);
  });
});
