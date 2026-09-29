# OndeVai code conventions

## Stack and scope

- Keep this app on Angular 21 with standalone components, strict TypeScript, Angular Router/forms/signals, and the Angular CLI build.
- Preserve PocketBase, Dexie, RxJS, and existing server/data contracts. Do not replace the auth provider or backend.
- Structural work must preserve behavior and route URLs. Record unrelated bugs instead of fixing them in a refactor.
- Ask before adding dependencies or changing build/CI configuration.

## Organization

- Put routed screens in `src/app/features/<feature>/pages/` and lazy-load them from `src/app/app.routes.ts`.
- Keep feature-only UI in `src/app/features/<feature>/components/`, feature services in `services/`, and feature-only models in `models/`.
- Keep shared app infrastructure in `src/app/core/`: auth, backups, database, migration coordination, PocketBase integration, realtime, repositories, app-wide services, and `AppStore`.
- `AppStore` owns the existing cross-feature session snapshot and realtime synchronization. Do not move user-scoped state into module globals or feature-local caches as part of file organization.
- Put shared UI in `src/app/shared/components/` only when it has multiple real consumers or is app-wide. Keep layout, common controls, forms, and charts in their respective folders. Put cross-feature pure helpers in `src/app/shared/utils/`.
- Keep component styles and specs next to their implementation. Preserve test behavior when relocating specs.

## Angular conventions

- Use standalone components and services; keep `ChangeDetectionStrategy.OnPush` on UI components.
- Pages coordinate forms, route state, and feature services. Keep persistence/network operations in services and repositories, not templates.
- Use Angular signals for local reactive state and derived `computed()` values. Keep the existing service and repository boundaries unless a separate behavior-preserving migration is planned.
- Extract repeated UI into a shared component when the same structure or interaction has multiple consumers. Prefer typed inputs/outputs and content projection for simple wrappers.
- Keep user-facing copy and locale behavior consistent with the existing Portuguese UI; localization is a separate task.
- Follow the current TypeScript import and formatting conventions. Do not add aliases or change compiler/build settings just for organization.

## Verification

- After each feature reorganization, run `npm run lint`, `npx tsc --noEmit -p tsconfig.app.json`, and `npx tsc --noEmit -p tsconfig.spec.json` before starting another feature.
- Keep each feature's structural change in one commit. Do not combine behavior changes with organization work.
