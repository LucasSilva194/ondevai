import { ApplicationConfig, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { environment } from '../environments/environment';
import { appRoutes } from './app.routes';
import { UserSessionService } from './core/auth/user-session.service';
import { POCKETBASE_URL } from './core/pocketbase/pocketbase.client';
import {
  BUDGET_REPOSITORY,
  CATEGORY_REPOSITORY,
  DATA_REPOSITORY,
  EXPENSE_REPOSITORY,
  INCOME_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
  SETTINGS_REPOSITORY,
} from './core/repositories/repository.tokens';
import {
  PocketBaseBudgetRepository,
  PocketBaseCategoryRepository,
  PocketBaseDataRepository,
  PocketBaseExpenseRepository,
  PocketBaseIncomeRepository,
  PocketBaseRecurrenceExceptionRepository,
  PocketBaseSavingsGoalRepository,
  PocketBaseSettingsRepository,
} from './core/repositories/pocketbase.repositories';
async function initializeAuthenticatedApplication(): Promise<void> {
  await inject(UserSessionService).initialize();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: POCKETBASE_URL, useValue: environment.pocketBaseUrl },
    { provide: EXPENSE_REPOSITORY, useExisting: PocketBaseExpenseRepository },
    { provide: CATEGORY_REPOSITORY, useExisting: PocketBaseCategoryRepository },
    { provide: INCOME_REPOSITORY, useExisting: PocketBaseIncomeRepository },
    { provide: SAVINGS_GOAL_REPOSITORY, useExisting: PocketBaseSavingsGoalRepository },
    { provide: BUDGET_REPOSITORY, useExisting: PocketBaseBudgetRepository },
    { provide: RECURRENCE_EXCEPTION_REPOSITORY, useExisting: PocketBaseRecurrenceExceptionRepository },
    { provide: SETTINGS_REPOSITORY, useExisting: PocketBaseSettingsRepository },
    { provide: DATA_REPOSITORY, useExisting: PocketBaseDataRepository },
    provideAppInitializer(initializeAuthenticatedApplication),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
