import { inject } from '@angular/core';
import { CanMatchFn, Router, Routes } from '@angular/router';
import { authGuard, guestGuard, verifiedGuard } from './core/auth/auth.guards';
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
    path: '',
    pathMatch: 'full',
    title: 'OndeVai | O seu dinheiro, explicado',
    loadComponent: () => import('./features/landing/landing.component').then((module) => module.LandingComponent),
  },
  {
    path: 'entrar',
    canActivate: [guestGuard],
    title: 'Entrar | OndeVai',
    loadComponent: () => import('./features/auth/login.component').then((module) => module.LoginComponent),
  },
  {
    path: 'registar',
    canActivate: [guestGuard],
    title: 'Criar conta | OndeVai',
    loadComponent: () => import('./features/auth/register.component').then((module) => module.RegisterComponent),
  },
  {
    path: 'recuperar-password',
    canActivate: [guestGuard],
    title: 'Recuperar palavra-passe | OndeVai',
    loadComponent: () => import('./features/auth/password-recovery.component').then((module) => module.PasswordRecoveryComponent),
  },
  {
    path: 'repor-password',
    canActivate: [guestGuard],
    title: 'Repor palavra-passe | OndeVai',
    loadComponent: () => import('./features/auth/password-reset.component').then((module) => module.PasswordResetComponent),
  },
  {
    path: 'confirmar-email',
    title: 'Confirmar email | OndeVai',
    loadComponent: () => import('./features/auth/email-verification.component').then((module) => module.EmailVerificationComponent),
  },
  {
    path: 'migrar-dados',
    canActivate: [authGuard, verifiedGuard],
    title: 'Migrar dados locais | OndeVai',
    loadComponent: () => import('./features/migration/local-data-migration.component').then((module) => module.LocalDataMigrationComponent),
  },
  {
    path: 'onboarding',
    canActivate: [authGuard, verifiedGuard],
    canMatch: [onboardingGuard],
    loadComponent: () => import('./features/onboarding/onboarding.component').then((module) => module.OnboardingComponent),
  },
  {
    path: '',
    canActivate: [authGuard, verifiedGuard],
    canMatch: [completedGuard],
    loadComponent: () => import('./shared/components/layout/app-shell/app-shell.component').then((module) => module.AppShellComponent),
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
        loadComponent: () => import('./features/budgets/pages/budgets.component').then((module) => module.BudgetsComponent),
      },
      {
        path: 'poupancas',
        title: 'Poupanças | OndeVai',
        loadComponent: () => import('./features/savings/savings.component').then((module) => module.SavingsComponent),
      },
      {
        path: 'categorias',
        title: 'Categorias | OndeVai',
        loadComponent: () => import('./features/categories/pages/categories.component').then((module) => module.CategoriesComponent),
      },
      {
        path: 'dados-e-privacidade',
        title: 'Dados e privacidade | OndeVai',
        loadComponent: () => import('./features/data-management/data-management.component').then((module) => module.DataManagementComponent),
      },
      {
        path: 'conta',
        canActivate: [authGuard, verifiedGuard],
        title: 'Conta | OndeVai',
        loadComponent: () => import('./features/account/account.component').then((module) => module.AccountComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
