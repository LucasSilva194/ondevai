import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { AppStore } from './core/stores/app.store';

const completedGuard: CanMatchFn = () => {
  const store = inject(AppStore);
  return store.settings().onboardingCompleted || inject(Router).createUrlTree(['/onboarding']);
};

const onboardingGuard: CanMatchFn = () => {
  const store = inject(AppStore);
  return !store.settings().onboardingCompleted || inject(Router).createUrlTree(['/visao-geral']);
};

export const appRoutes: Routes = [
  {
    path: 'onboarding',
    canMatch: [onboardingGuard],
    loadComponent: () => import('./features/onboarding/onboarding.component').then((module) => module.OnboardingComponent),
  },
  {
    path: '',
    canMatch: [completedGuard],
    loadComponent: () => import('./shared/components/app-shell/app-shell.component').then((module) => module.AppShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'visao-geral' },
      {
        path: 'visao-geral',
        title: 'Visão geral | OndeVai',
        loadComponent: () => import('./features/dashboard/dashboard.component').then((module) => module.DashboardComponent),
      },
      {
        path: 'despesas',
        title: 'Despesas | OndeVai',
        loadComponent: () => import('./features/expenses/expenses.component').then((module) => module.ExpensesComponent),
      },
      {
        path: 'orcamentos',
        title: 'Orçamentos | OndeVai',
        loadComponent: () => import('./features/budgets/budgets.component').then((module) => module.BudgetsComponent),
      },
      {
        path: 'poupancas',
        title: 'Poupanças | OndeVai',
        loadComponent: () => import('./features/savings/savings.component').then((module) => module.SavingsComponent),
      },
      {
        path: 'categorias',
        title: 'Categorias | OndeVai',
        loadComponent: () => import('./features/categories/categories.component').then((module) => module.CategoriesComponent),
      },
      {
        path: 'dados-e-privacidade',
        title: 'Dados e privacidade | OndeVai',
        loadComponent: () => import('./features/data-management/data-management.component').then((module) => module.DataManagementComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
