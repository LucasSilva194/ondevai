import { ApplicationConfig, inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { appRoutes } from './app.routes';
import {
  CATEGORY_REPOSITORY,
  DATA_REPOSITORY,
  EXPENSE_REPOSITORY,
  SETTINGS_REPOSITORY,
} from './core/repositories/repository.tokens';
import {
  DexieCategoryRepository,
  DexieDataRepository,
  DexieExpenseRepository,
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
    { provide: SETTINGS_REPOSITORY, useExisting: DexieSettingsRepository },
    { provide: DATA_REPOSITORY, useExisting: DexieDataRepository },
    provideAppInitializer(() => inject(AppStore).initialize()),
  ],
};
