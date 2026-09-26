import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LocalDataMigrationService } from '../migration/local-data-migration.service';
import { AppStore } from '../stores/app.store';
import { AuthService } from './auth.service';

export type LoginDestination = 'verification-required' | 'migration' | 'application';

@Injectable({ providedIn: 'root' })
export class UserSessionService {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AppStore);
  private readonly migration = inject(LocalDataMigrationService);
  private readonly router = inject(Router);
  private readonly errorState = signal<string | null>(null);

  readonly error = this.errorState.asReadonly();

  async initialize(): Promise<void> {
    await this.auth.initialize();
    await this.store.initialize();
  }

  async login(email: string, password: string): Promise<LoginDestination> {
    this.errorState.set(null);
    await this.auth.login(email, password);
    const user = this.auth.user();
    if (!user?.verified) {
      await this.store.clearUserState();
      return 'verification-required';
    }

    await this.store.loadAuthenticatedUser();
    if (!this.store.dataReady()) {
      const message = this.store.error() ?? 'Não foi possível carregar os dados da conta.';
      this.errorState.set(message);
      throw new Error(message);
    }

    try {
      const local = await this.migration.detectLocalData();
      if (
        local.totalRecords > 0
        && this.migration.getMigrationStatus().status !== 'completed'
        && this.remoteAccountIsEmpty()
      ) return 'migration';
    } catch {
      // Uma falha ao inspecionar o IndexedDB legado não invalida a sessão cloud.
    }
    return 'application';
  }

  async logout(): Promise<void> {
    this.errorState.set(null);
    await this.store.clearUserState();
    this.auth.logout();
    await this.router.navigate(['/entrar']);
  }

  clearError(): void {
    this.errorState.set(null);
  }

  private remoteAccountIsEmpty(): boolean {
    return this.store.categories().length === 0
      && this.store.expenses().length === 0
      && this.store.monthlyIncomes().length === 0
      && this.store.savingsGoals().length === 0
      && this.store.savingsTransactions().length === 0
      && this.store.monthlyBudgets().length === 0
      && this.store.recurrenceExceptions().length === 0;
  }
}
