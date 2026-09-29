# OndeVai Angular structure refactor plan

## Scope

Keep Angular 21, standalone components, TypeScript, Angular Router/forms/signals, PocketBase, Dexie, and the existing Angular CLI build. This is a file organization and component reuse refactor only. No framework, dependency, backend, route, or build changes are in scope. Preserve behavior and route URLs.

The business domains follow the PocketBase nouns: users/auth, settings, categories, expenses, monthly incomes, savings goals/transactions, monthly budgets, and recurrence exceptions. Dashboard, onboarding, migration, and data management are application workflows that consume those domains.

## Target structure for this app

```text
src/app/
├── core/
│   ├── auth/                 # auth/session services and guards
│   ├── backup/               # backup validation and fingerprint helpers
│   ├── database/             # Dexie database
│   ├── pocketbase/           # client, endpoint/collection constants, errors, mappers, wire types
│   ├── realtime/             # PocketBase realtime coordination
│   ├── repositories/         # repository contracts and PocketBase adapters
│   ├── services/             # domain application services
│   ├── migration/            # local data transfer orchestration
│   └── stores/               # app-wide session/data state
├── features/
│   ├── auth/{pages,components}/
│   ├── account/{pages,components,services}/
│   ├── categories/{pages,components,models,services}/
│   ├── expenses/{pages,components,models,services}/
│   ├── savings/{pages,components,models,services}/
│   ├── budgets/{pages,components,models,services}/
│   ├── dashboard/{pages,components}/
│   ├── landing/{pages,components}/
│   ├── onboarding/{pages,components}/
│   ├── migration/{pages,components,services}/
│   └── data-management/{pages,components,services}/
├── shared/
│   ├── components/
│   │   ├── common/           # domain-agnostic controls and feedback UI
│   │   ├── form/             # reusable field/control components
│   │   ├── layout/           # app shell and navigation
│   │   └── chart/            # shared chart wrapper
│   ├── models/               # types used across domains
│   └── utils/                # pure helpers with multiple consumers
├── models/                   # shared persisted/domain models during migration
├── app.component.ts
├── app.config.ts
└── app.routes.ts
```

Use Angular standalone components and services; do not introduce Vue composables, Pinia, Quasar, Axios, Zod, or an i18n layer. Keep domain-only state and behavior with its feature service. Keep `AppStore` for the existing cross-domain session snapshot and realtime synchronization until a domain can be separated without changing semantics. Shared components must have at least two real consumers or be clearly app-wide (such as the shell).

## Current file mapping

| Current file(s) | Target location |
|---|---|
| `src/app/app.component.ts`, `src/app/app.config.ts`, `src/app/app.routes.ts`, `src/main.ts` | Remain at the Angular application root; route definitions stay lazy-loaded and retain the same paths |
| `src/app/models/domain.models.ts` | `src/app/shared/models/domain.models.ts` if used across features; otherwise split into each feature's `models/` during its migration |
| `src/app/models/suggested-categories.ts` | `src/app/features/categories/models/suggested-categories.ts` |
| `src/app/core/auth/auth.service.ts`, `user-session.service.ts`, `auth.guards.ts` | Remain under `src/app/core/auth/` |
| `src/app/core/pocketbase/pocketbase.client.ts`, `pocketbase.endpoints.ts`, `pocketbase.errors.ts`, `pocketbase.ids.ts`, `pocketbase.mappers.ts`, `pocketbase.types.ts` | Remain under `src/app/core/pocketbase/`; domain-specific record mappers/types may move with their owning feature only if doing so does not create cross-domain imports |
| `src/app/core/repositories/repository.tokens.ts`, `pocketbase.repositories.ts` | Remain under `src/app/core/repositories/` as shared persistence adapters |
| `src/app/core/services/category.service.ts` | `src/app/features/categories/services/category.service.ts` |
| `src/app/core/services/expense.service.ts` | `src/app/features/expenses/services/expense.service.ts` |
| `src/app/core/services/budget.service.ts` | `src/app/features/budgets/services/budget.service.ts` |
| `src/app/core/services/savings.service.ts` | `src/app/features/savings/services/savings.service.ts`; it currently owns monthly income and savings goal/transaction operations consumed together by the savings screen, so keep the service boundary intact during this structural-only pass |
| `src/app/core/services/settings.service.ts` | Remain under `src/app/core/services/` as app-wide settings service |
| `src/app/core/stores/app.store.ts` | Remain under `src/app/core/stores/`; it coordinates multi-domain snapshot/realtime state |
| `src/app/core/realtime/pocketbase-realtime.service.ts` | Remain under `src/app/core/realtime/` |
| `src/app/core/backup/backup.service.ts`, `backup-validation.ts`, `backup-fingerprint.ts` | Remain under `src/app/core/backup/`; data-management feature calls these services |
| `src/app/core/migration/local-data-migration.service.ts` | `src/app/features/migration/services/local-data-migration.service.ts` |
| `src/app/core/database/ondevai.database.ts` | Remain under `src/app/core/database/` |
| `src/app/features/auth/{login,register,password-recovery,password-reset,email-verification,auth-page}.component.ts`, `auth-page.component.css`, `auth-form.css` | `features/auth/pages/` for routed screens and `features/auth/components/` for genuinely shared auth UI; retain styles alongside their component |
| `src/app/features/account/account.component.ts`, `account.component.css`, `account.service.ts` | `features/account/pages/account.component.ts`, colocated CSS, `features/account/services/account.service.ts` |
| `src/app/features/categories/categories.component.ts`, `categories.component.css` | `features/categories/pages/categories.component.ts`, colocated CSS; extract category-only dialogs/forms into `features/categories/components/` when useful for reuse within the feature |
| `src/app/features/expenses/expenses.component.ts`, `expenses.component.css` | `features/expenses/pages/expenses.component.ts`, colocated CSS; extract domain-only expense form/filter/dialog pieces into `features/expenses/components/` |
| `src/app/features/budgets/budgets.component.ts`, `budgets.component.css` | `features/budgets/pages/budgets.component.ts`, colocated CSS; extract budget-specific form/table pieces into `features/budgets/components/` |
| `src/app/features/savings/savings.component.ts`, `savings.component.css` | `features/savings/pages/savings.component.*`; keep income UI within the combined savings screen because extracting it would change component ownership and behavior |
| `src/app/features/dashboard/dashboard.component.ts`, `dashboard.component.css` | `features/dashboard/pages/dashboard.component.ts`; dashboard-specific summaries/widgets into `features/dashboard/components/` |
| `src/app/features/landing/landing.component.ts`, `landing.component.css` | `features/landing/pages/landing.component.*` |
| `src/app/features/onboarding/onboarding.component.ts`, `onboarding.component.css` | `features/onboarding/pages/onboarding.component.ts`, colocated CSS |
| `src/app/features/migration/local-data-migration.component.ts`, `local-data-migration.component.css` | `features/migration/pages/local-data-migration.component.ts`, colocated CSS |
| `src/app/features/data-management/data-management.component.ts`, `data-management.component.css` | `features/data-management/pages/data-management.component.ts`, colocated CSS; extract only data-management-specific subcomponents into its `components/` |
| `src/app/shared/components/app-shell/app-shell.component.ts`, `app-shell.component.css` | `src/app/shared/components/layout/app-shell/` |
| `src/app/shared/components/icon/icon.component.ts` | `src/app/shared/components/common/icon/` |
| `src/app/shared/components/chart/chart.component.ts` | `src/app/shared/components/chart/` |
| `src/app/shared/utils/date.utils.ts`, `money.utils.ts`, `recurrence.utils.ts`, `statistics.utils.ts`, `insights.utils.ts` | Remain under `src/app/shared/utils/` while they have cross-feature consumers; move domain-only helpers beside their owning feature if no other consumer exists |
| All `*.spec.ts` files | Move beside the implementation they cover, preserving test content and existing Angular/Vitest setup |
| `src/styles.css` | Remain the global stylesheet; feature styles stay colocated |

## Migration order

1. Establish the Angular feature folder conventions and inspect repeated UI patterns. Keep shared shell/icon/chart components where they are conceptually shared. Extract a shared dialog/form/control only when at least two existing screens use the same behavior and structure.
2. **Categories** (smallest domain): move suggested category data and category service/UI into the feature; update imports.
3. **Budgets:** move its service and page/components.
4. **Expenses:** move expense service and page/components; keep recurrence exception persistence in the existing cross-domain repository layer unless the ownership boundary is clear.
5. **Savings:** move the combined income/savings service and screen together; retain the current domain boundary because those operations and dialogs are managed by one screen today.
6. **Dashboard:** organize dashboard page and dashboard-only widgets after domain locations stabilize.
7. **Migration and data management:** organize local migration and backup workflows while retaining Dexie, backup validation, and transactional API semantics.
8. **Auth, account, onboarding, shell, routes:** finish organization and verify all lazy imports and guards still resolve; preserve every route path and title.

After each domain, run lint and the TypeScript check and require both to be clean before continuing. Keep each completed domain in one restructuring commit. Do not mix behavior fixes into those commits.

## Risks and audit findings

- **Import cycles:** feature services and repository tokens cross current feature boundaries. Keep shared persistence interfaces and adapters in `core/`; only move a service when consumers can follow without circular imports.
- **AppStore state lifetime:** the singleton owns user-scoped data and realtime coordination. Do not change state ownership or replace it with feature-local/module-global caches as part of moving files.
- **Route behavior:** route paths are Portuguese and used by links/guards. Keep all current URL strings, lazy loading, guard ordering, and titles unchanged.
- **Combined savings screen:** monthly incomes and savings goals/transactions currently share one feature screen and service. Keep that boundary intact to avoid a behavior or dependency-injection change.
- **Audit flags:** no `any`, `v-html`, or `innerHTML` use was found in application source. No component calls axios or `fetch`; PocketBase operations live in auth/repository/account/realtime services. User-visible copy is hardcoded Portuguese; localization is out of scope. UI is Angular standalone/class components, not Vue Options API.
- **Existing issues:** no bug-fixing is in scope. Record any unrelated bug found during migration here and leave it unchanged.

## Approval

The user clarified that Angular must remain and approved proceeding with this organization/component reuse refactor. No dependency, build, backend, or framework changes are authorized or needed.
