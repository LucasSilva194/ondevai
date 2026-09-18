import { ApplicationConfig, inject, isDevMode, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { appRoutes } from './app.routes';
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
  DexieBudgetRepository,
  DexieCategoryRepository,
  DexieDataRepository,
  DexieExpenseRepository,
  DexieIncomeRepository,
  DexieRecurrenceExceptionRepository,
  DexieSavingsGoalRepository,
  DexieSettingsRepository,
} from './core/repositories/dexie.repositories';
import { AppStore } from './core/stores/app.store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(
      appRoutes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
    ),
    { provide: EXPENSE_REPOSITORY, useExisting: DexieExpenseRepository },
    { provide: CATEGORY_REPOSITORY, useExisting: DexieCategoryRepository },
    { provide: INCOME_REPOSITORY, useExisting: DexieIncomeRepository },
    { provide: SAVINGS_GOAL_REPOSITORY, useExisting: DexieSavingsGoalRepository },
    { provide: BUDGET_REPOSITORY, useExisting: DexieBudgetRepository },
    { provide: RECURRENCE_EXCEPTION_REPOSITORY, useExisting: DexieRecurrenceExceptionRepository },
    { provide: SETTINGS_REPOSITORY, useExisting: DexieSettingsRepository },
    { provide: DATA_REPOSITORY, useExisting: DexieDataRepository },
    provideAppInitializer(() => inject(AppStore).initialize()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
