import { computed, inject, Injectable, signal } from '@angular/core';
import { BackupValidationResult, validateBackup } from '../backup/backup-validation';
import { calculateBackupFingerprint, createBackupAttemptKey } from '../backup/backup-fingerprint';
import { OndeVaiDatabase, SettingsRecord } from '../database/ondevai.database';
import { POCKETBASE_ENDPOINTS } from '../pocketbase/pocketbase.endpoints';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import {
  AppBackup,
  Category,
  DEFAULT_SETTINGS,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
} from '../../models/domain.models';

export type LocalDataMigrationStatus =
  | 'checking'
  | 'none'
  | 'available'
  | 'preparing'
  | 'ready'
  | 'uploading'
  | 'completed'
  | 'failed';

export type LocalDataMigrationFailureKind =
  | 'endpoint-unavailable'
  | 'network'
  | 'account-not-empty'
  | 'validation'
  | 'authentication'
  | 'unexpected';

export interface LocalDataCounts {
  readonly categories: number;
  readonly expenses: number;
  readonly monthlyIncomes: number;
  readonly savingsGoals: number;
  readonly savingsTransactions: number;
  readonly monthlyBudgets: number;
  readonly recurrenceExceptions: number;
}

export interface LocalDataSummary {
  readonly counts: LocalDataCounts;
  readonly totalRecords: number;
  readonly firstDate?: string;
  readonly lastDate?: string;
}

export interface LocalMigrationAttempt {
  readonly idempotencyKey: string;
  readonly snapshotHash: string;
  readonly userId: string;
  readonly createdAt: string;
}

export interface MigrationUploadResponse {
  readonly status: 'imported' | 'already_imported';
  readonly counts: LocalDataCounts;
}

export interface LocalDataMigrationState {
  readonly status: LocalDataMigrationStatus;
  readonly summary: LocalDataSummary | null;
  readonly attempt: LocalMigrationAttempt | null;
  readonly result: MigrationUploadResponse | null;
  readonly error: string | null;
  readonly failureKind: LocalDataMigrationFailureKind | null;
}

interface LocalCollections {
  readonly settings: SettingsRecord | undefined;
  readonly categories: Category[];
  readonly expenses: Expense[];
  readonly monthlyIncomes: MonthlyIncome[];
  readonly savingsGoals: SavingsGoal[];
  readonly savingsTransactions: SavingsTransaction[];
  readonly monthlyBudgets: MonthlyBudget[];
  readonly recurrenceExceptions: RecurrenceException[];
}

interface MigrationMetadata {
  readonly version: 1;
  readonly attempt: LocalMigrationAttempt;
  readonly completedAt?: string;
  readonly result?: MigrationUploadResponse;
}

interface PocketBaseErrorLike {
  readonly status: number;
}

const MIGRATION_METADATA_KEY = 'pocketbase-local-data-migration:v1';

const INITIAL_STATE: LocalDataMigrationState = {
  status: 'checking',
  summary: null,
  attempt: null,
  result: null,
  error: null,
  failureKind: null,
};

export class LocalDataValidationError extends Error {
  constructor(readonly validationErrors: readonly string[]) {
    super(validationErrors.join(' '));
    this.name = 'LocalDataValidationError';
  }
}

export class LocalMigrationEndpointUnavailableError extends Error {
  constructor(readonly status: 404 | 501, options?: ErrorOptions) {
    super('A importação para a conta ainda não está disponível. Os dados locais continuam guardados neste dispositivo.', options);
    this.name = 'LocalMigrationEndpointUnavailableError';
  }
}

@Injectable({ providedIn: 'root' })
export class LocalDataMigrationService {
  private readonly database = inject(OndeVaiDatabase);
  private readonly pocketBase = inject(PocketBaseClientService).client;
  private readonly stateState = signal<LocalDataMigrationState>(INITIAL_STATE);

  readonly state = this.stateState.asReadonly();
  readonly status = computed(() => this.stateState().status);
  readonly summary = computed(() => this.stateState().summary);
  readonly error = computed(() => this.stateState().error);

  async detectLocalData(): Promise<LocalDataSummary> {
    this.patchState({ status: 'checking', error: null, failureKind: null });
    try {
      const collections = await this.readLocalCollections();
      const summary = createSummary(collections);
      const metadata = await this.readMetadata();
      let completed = false;
      if (
        summary.totalRecords > 0
        && metadata?.completedAt !== undefined
        && this.pocketBase.authStore.isValid
        && metadata.attempt.userId === this.pocketBase.authStore.record?.id
      ) {
        const current = validateBackup(createSnapshot(collections, new Date().toISOString()));
        completed = current.valid && await calculateBackupFingerprint(current.backup) === metadata.attempt.snapshotHash;
      }
      this.stateState.set({
        status: summary.totalRecords === 0 ? 'none' : completed ? 'completed' : 'available',
        summary,
        attempt: metadata?.attempt ?? null,
        result: metadata?.result ?? null,
        error: null,
        failureKind: null,
      });
      return summary;
    } catch (error: unknown) {
      this.fail('Não foi possível verificar os dados guardados neste dispositivo.', 'unexpected');
      throw error;
    }
  }

  async createLocalSnapshot(): Promise<AppBackup> {
    this.patchState({ status: 'preparing', error: null, failureKind: null });
    try {
      const collections = await this.readLocalCollections();
      const snapshot = createSnapshot(collections, new Date().toISOString());
      const validation = this.validateLocalSnapshot(snapshot);
      if (!validation.valid) {
        this.fail(validation.errors.join(' '), 'validation');
        throw new LocalDataValidationError(validation.errors);
      }
      this.patchState({ status: 'ready', summary: createSummary(collections), error: null, failureKind: null });
      return validation.backup;
    } catch (error: unknown) {
      if (!(error instanceof LocalDataValidationError)) {
        this.fail('Não foi possível preparar os dados locais para a migração.', 'unexpected');
      }
      throw error;
    }
  }

  validateLocalSnapshot(snapshot: unknown): BackupValidationResult {
    return validateBackup(snapshot);
  }

  async createMigrationAttempt(userId: string, snapshot: AppBackup): Promise<LocalMigrationAttempt> {
    const normalizedUserId = userId.trim();
    if (!normalizedUserId) {
      this.fail('É necessário iniciar sessão antes de preparar a migração.', 'authentication');
      throw new Error('Migration userId is required.');
    }
    const validation = this.validateLocalSnapshot(snapshot);
    if (!validation.valid) {
      this.fail(validation.errors.join(' '), 'validation');
      throw new LocalDataValidationError(validation.errors);
    }

    const snapshotHash = await calculateBackupFingerprint(validation.backup);
    const stored = await this.readMetadata();
    const attempt = stored?.attempt.userId === normalizedUserId && stored.attempt.snapshotHash === snapshotHash
      ? stored.attempt
      : {
          idempotencyKey: createBackupAttemptKey(),
          snapshotHash,
          userId: normalizedUserId,
          createdAt: new Date().toISOString(),
        };

    if (stored?.attempt !== attempt) {
      await this.database.metadata.put({
        key: MIGRATION_METADATA_KEY,
        value: { version: 1, attempt } satisfies MigrationMetadata,
      });
    }
    this.patchState({ status: 'ready', attempt, result: stored?.attempt === attempt ? stored.result ?? null : null, error: null, failureKind: null });
    return attempt;
  }

  async uploadMigration(snapshot: AppBackup, attempt: LocalMigrationAttempt): Promise<MigrationUploadResponse> {
    const validation = this.validateLocalSnapshot(snapshot);
    if (!validation.valid) {
      this.fail(validation.errors.join(' '), 'validation');
      throw new LocalDataValidationError(validation.errors);
    }
    const currentHash = await calculateBackupFingerprint(validation.backup);
    if (currentHash !== attempt.snapshotHash) {
      const message = 'Os dados locais mudaram depois da preparação. Prepare uma nova tentativa antes de continuar.';
      this.fail(message, 'validation');
      throw new LocalDataValidationError([message]);
    }

    const authRecord = this.pocketBase.authStore.record;
    if (!this.pocketBase.authStore.isValid || !authRecord?.id || authRecord.id !== attempt.userId) {
      const message = 'A sessão atual não corresponde à tentativa de migração. Inicie sessão novamente.';
      this.fail(message, 'authentication');
      throw new Error(message);
    }

    this.patchState({ status: 'uploading', attempt, error: null, failureKind: null });
    try {
      const response = await this.pocketBase.send<unknown>(POCKETBASE_ENDPOINTS.data.replaceAll, {
        method: 'POST',
        body: {
          mode: 'migrate-empty',
          idempotencyKey: attempt.idempotencyKey,
          snapshotHash: attempt.snapshotHash,
          backup: validation.backup,
        },
      });
      const result = parseUploadResponse(response);
      await this.markMigrationCompleted(attempt, result);
      return result;
    } catch (error: unknown) {
      if (isErrorStatus(error, 404) || isErrorStatus(error, 501)) {
        const endpointError = new LocalMigrationEndpointUnavailableError(error.status as 404 | 501, { cause: error });
        this.fail(endpointError.message, 'endpoint-unavailable');
        throw endpointError;
      }
      if (isErrorStatus(error, 0)) {
        this.fail('Não foi possível contactar o servidor. Verifique a ligação e tente novamente.', 'network');
      } else if (isErrorStatus(error, 409)) {
        this.fail('A conta já contém dados financeiros. A migração local só pode ser feita para uma conta vazia e nunca substitui dados cloud.', 'account-not-empty');
      } else if (isErrorStatus(error, 400) || isErrorStatus(error, 413)) {
        this.fail('O servidor não aceitou os dados preparados. Confirme o ficheiro e os limites da importação.', 'validation');
      } else {
        this.fail('Não foi possível copiar os dados para a conta. Tente novamente.', 'unexpected');
      }
      throw error;
    }
  }

  getMigrationStatus(): LocalDataMigrationState {
    return this.stateState();
  }

  async markMigrationCompleted(attempt: LocalMigrationAttempt, result: MigrationUploadResponse): Promise<void> {
    const stored = await this.readMetadata();
    if (stored && stored.attempt.idempotencyKey !== attempt.idempotencyKey) {
      throw new Error('A tentativa de migração ativa foi substituída por uma tentativa mais recente.');
    }
    await this.database.metadata.put({
      key: MIGRATION_METADATA_KEY,
      value: {
        version: 1,
        attempt,
        completedAt: new Date().toISOString(),
        result,
      } satisfies MigrationMetadata,
    });
    this.patchState({ status: 'completed', attempt, result, error: null, failureKind: null });
  }

  async clearMigrationMetadata(): Promise<void> {
    await this.database.metadata.delete(MIGRATION_METADATA_KEY);
    const summary = this.stateState().summary;
    this.stateState.set({
      status: summary && summary.totalRecords > 0 ? 'available' : 'none',
      summary,
      attempt: null,
      result: null,
      error: null,
      failureKind: null,
    });
  }

  private async readLocalCollections(): Promise<LocalCollections> {
    return this.database.transaction(
      'r',
      [
        this.database.settings,
        this.database.categories,
        this.database.expenses,
        this.database.monthlyIncomes,
        this.database.savingsGoals,
        this.database.savingsTransactions,
        this.database.monthlyBudgets,
        this.database.recurrenceExceptions,
      ],
      async () => {
        const [
          settings,
          categories,
          expenses,
          monthlyIncomes,
          savingsGoals,
          savingsTransactions,
          monthlyBudgets,
          recurrenceExceptions,
        ] = await Promise.all([
          this.database.settings.get('app'),
          this.database.categories.toArray(),
          this.database.expenses.toArray(),
          this.database.monthlyIncomes.toArray(),
          this.database.savingsGoals.toArray(),
          this.database.savingsTransactions.toArray(),
          this.database.monthlyBudgets.toArray(),
          this.database.recurrenceExceptions.toArray(),
        ]);
        return {
          settings,
          categories,
          expenses,
          monthlyIncomes,
          savingsGoals,
          savingsTransactions,
          monthlyBudgets,
          recurrenceExceptions,
        };
      },
    );
  }

  private async readMetadata(): Promise<MigrationMetadata | undefined> {
    const record = await this.database.metadata.get(MIGRATION_METADATA_KEY);
    return isMigrationMetadata(record?.value) ? record.value : undefined;
  }

  private patchState(patch: Partial<LocalDataMigrationState>): void {
    this.stateState.update((state) => ({ ...state, ...patch }));
  }

  private fail(message: string, failureKind: LocalDataMigrationFailureKind): void {
    this.patchState({ status: 'failed', error: message, failureKind });
  }
}

function settingsFromRecord(record: SettingsRecord | undefined): AppBackup['settings'] {
  return {
    currency: record?.currency ?? DEFAULT_SETTINGS.currency,
    locale: record?.locale ?? DEFAULT_SETTINGS.locale,
    onboardingCompleted: record?.onboardingCompleted ?? DEFAULT_SETTINGS.onboardingCompleted,
    changesSinceExport: record?.changesSinceExport ?? DEFAULT_SETTINGS.changesSinceExport,
    ...(record?.lastExportAt ? { lastExportAt: record.lastExportAt } : {}),
  };
}

function createSnapshot(collections: LocalCollections, exportedAt: string): AppBackup {
  return {
    schemaVersion: 4,
    exportedAt,
    settings: settingsFromRecord(collections.settings),
    categories: sortBy(collections.categories, (item) => `${padNumber(item.order)}:${item.id}`),
    expenses: sortBy(collections.expenses, (item) => `${item.date}:${item.id}`),
    monthlyIncomes: sortBy(collections.monthlyIncomes, (item) => `${item.date}:${item.id}`),
    savingsGoals: sortBy(collections.savingsGoals, (item) => `${item.createdAt}:${item.id}`),
    savingsTransactions: sortBy(
      collections.savingsTransactions,
      (item) => `${item.effectiveDate}:${item.createdAt}:${item.id}`,
    ),
    monthlyBudgets: sortBy(collections.monthlyBudgets, (item) => `${item.month}:${item.categoryId}:${item.id}`),
    recurrenceExceptions: sortBy(
      collections.recurrenceExceptions,
      (item) => `${item.seriesType}:${item.seriesId}:${item.occurrenceDate}:${item.id}`,
    ),
  };
}

function createSummary(collections: Omit<LocalCollections, 'settings'>): LocalDataSummary {
  const counts: LocalDataCounts = {
    categories: collections.categories.length,
    expenses: collections.expenses.length,
    monthlyIncomes: collections.monthlyIncomes.length,
    savingsGoals: collections.savingsGoals.length,
    savingsTransactions: collections.savingsTransactions.length,
    monthlyBudgets: collections.monthlyBudgets.length,
    recurrenceExceptions: collections.recurrenceExceptions.length,
  };
  const dates = [
    ...collections.expenses.map((item) => item.date),
    ...collections.monthlyIncomes.map((item) => item.date),
    ...collections.savingsTransactions.map((item) => item.effectiveDate),
    ...collections.monthlyBudgets.map((item) => `${item.month}-01`),
    ...collections.recurrenceExceptions.map((item) => item.occurrenceDate),
  ].sort();
  return {
    counts,
    totalRecords: Object.values(counts).reduce((total, count) => total + count, 0),
    ...(dates[0] ? { firstDate: dates[0] } : {}),
    ...(dates.at(-1) ? { lastDate: dates.at(-1) } : {}),
  };
}

function sortBy<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((left, right) => key(left).localeCompare(key(right), 'en'));
}

function padNumber(value: number): string {
  return String(value).padStart(12, '0');
}

function parseUploadResponse(value: unknown): MigrationUploadResponse {
  if (!isRecord(value) || !['imported', 'already_imported'].includes(value['status'] as string) || !isRecord(value['counts'])) {
    throw new Error('O servidor devolveu uma resposta de migração inválida.');
  }
  const countKeys = [
    'categories',
    'expenses',
    'monthlyIncomes',
    'savingsGoals',
    'savingsTransactions',
    'monthlyBudgets',
    'recurrenceExceptions',
  ] as const;
  const counts = value['counts'];
  for (const key of countKeys) {
    if (!Number.isSafeInteger(counts[key]) || (counts[key] as number) < 0) {
      throw new Error('O servidor devolveu contagens de migração inválidas.');
    }
  }
  return {
    status: value['status'] as MigrationUploadResponse['status'],
    counts: {
      categories: counts['categories'] as number,
      expenses: counts['expenses'] as number,
      monthlyIncomes: counts['monthlyIncomes'] as number,
      savingsGoals: counts['savingsGoals'] as number,
      savingsTransactions: counts['savingsTransactions'] as number,
      monthlyBudgets: counts['monthlyBudgets'] as number,
      recurrenceExceptions: counts['recurrenceExceptions'] as number,
    },
  };
}

function isMigrationMetadata(value: unknown): value is MigrationMetadata {
  if (!isRecord(value) || value['version'] !== 1 || !isRecord(value['attempt'])) return false;
  const attempt = value['attempt'];
  return typeof attempt['idempotencyKey'] === 'string'
    && typeof attempt['snapshotHash'] === 'string'
    && typeof attempt['userId'] === 'string'
    && typeof attempt['createdAt'] === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorStatus(error: unknown, status: number): error is PocketBaseErrorLike {
  return isRecord(error) && error['status'] === status;
}
