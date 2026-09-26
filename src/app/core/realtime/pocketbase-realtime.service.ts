import { Injectable, inject } from '@angular/core';
import type { RecordSubscription, UnsubscribeFunc } from 'pocketbase';
import {
  Category,
  Expense,
  MonthlyBudget,
  MonthlyIncome,
  RecurrenceException,
  SavingsGoal,
  SavingsTransaction,
  Settings,
} from '../../models/domain.models';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import {
  budgetFromRecord,
  categoryFromRecord,
  expenseFromRecord,
  incomeFromRecord,
  recurrenceExceptionFromRecord,
  savingsGoalFromRecord,
  savingsTransactionFromRecord,
  settingsFromRecord,
} from '../pocketbase/pocketbase.mappers';
import { POCKETBASE_COLLECTIONS } from '../pocketbase/pocketbase.types';

export type RealtimeAction = 'create' | 'update' | 'delete';

export type AppRealtimeEvent =
  | RealtimeEvent<'settings', Settings>
  | RealtimeEvent<'categories', Category>
  | RealtimeEvent<'expenses', Expense>
  | RealtimeEvent<'monthlyIncomes', MonthlyIncome>
  | RealtimeEvent<'savingsGoals', SavingsGoal>
  | RealtimeEvent<'savingsTransactions', SavingsTransaction>
  | RealtimeEvent<'monthlyBudgets', MonthlyBudget>
  | RealtimeEvent<'recurrenceExceptions', RecurrenceException>;

interface RealtimeEvent<TCollection extends string, TRecord> {
  readonly collection: TCollection;
  readonly action: RealtimeAction;
  readonly owner: string;
  readonly record: TRecord;
}

export interface AppRealtimeHandlers {
  readonly onEvent: (event: AppRealtimeEvent) => void;
  readonly onConnectionError: (message: string | null) => void;
}

type DisconnectHook = (activeSubscriptions: string[]) => void;

@Injectable({ providedIn: 'root' })
export class PocketBaseRealtimeService {
  private readonly client = inject(PocketBaseClientService).client;
  private readonly unsubscribers: UnsubscribeFunc[] = [];
  private generation = 0;
  private currentUserId: string | null = null;
  private active = false;
  private startPromise: Promise<void> | null = null;
  private handlers: AppRealtimeHandlers | null = null;
  private previousDisconnectHook: DisconnectHook | undefined;
  private installedDisconnectHook: DisconnectHook | undefined;

  async start(userId: string, handlers: AppRealtimeHandlers): Promise<void> {
    if (this.currentUserId === userId && (this.active || this.startPromise)) {
      this.handlers = handlers;
      await (this.startPromise ?? Promise.resolve());
      return;
    }

    await this.stop();
    this.assertAuthenticatedOwner(userId);

    const generation = ++this.generation;
    this.currentUserId = userId;
    this.handlers = handlers;
    this.installDisconnectHook(generation);

    const startPromise = this.subscribeToAllCollections(userId, generation);
    this.startPromise = startPromise;
    try {
      await startPromise;
      if (this.isCurrent(userId, generation)) {
        this.active = true;
        this.handlers?.onConnectionError(null);
      }
    } catch (error: unknown) {
      if (this.isCurrent(userId, generation)) {
        this.handlers?.onConnectionError(realtimeErrorMessage(error));
        await this.stop();
      }
      throw error;
    } finally {
      if (this.startPromise === startPromise) this.startPromise = null;
    }
  }

  async stop(): Promise<void> {
    this.generation += 1;
    this.currentUserId = null;
    this.active = false;
    this.startPromise = null;
    this.handlers = null;
    this.restoreDisconnectHook();

    const unsubscribers = this.unsubscribers.splice(0);
    await Promise.allSettled(unsubscribers.map((unsubscribe) => unsubscribe()));
  }

  private async subscribeToAllCollections(userId: string, generation: number): Promise<void> {
    const ownerFilter = this.client.filter('owner = {:owner}', { owner: userId });
    await Promise.all([
      this.registerSubscription(
        this.client.realtime.subscribe('PB_CONNECT', () => {
          if (this.isCurrent(userId, generation)) this.handlers?.onConnectionError(null);
        }),
        generation,
      ),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.settings, 'settings', settingsFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.categories, 'categories', categoryFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.expenses, 'expenses', expenseFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.incomes, 'monthlyIncomes', incomeFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.savingsGoals, 'savingsGoals', savingsGoalFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(
        POCKETBASE_COLLECTIONS.savingsTransactions,
        'savingsTransactions',
        savingsTransactionFromRecord,
        ownerFilter,
        userId,
        generation,
      ),
      this.subscribeCollection(POCKETBASE_COLLECTIONS.budgets, 'monthlyBudgets', budgetFromRecord, ownerFilter, userId, generation),
      this.subscribeCollection(
        POCKETBASE_COLLECTIONS.recurrenceExceptions,
        'recurrenceExceptions',
        recurrenceExceptionFromRecord,
        ownerFilter,
        userId,
        generation,
      ),
    ]);
  }

  private subscribeCollection<TRecord extends { owner: string }, TDomain, TCollection extends AppRealtimeEvent['collection']>(
    collectionName: string,
    collection: TCollection,
    mapper: (record: TRecord) => TDomain,
    filter: string,
    userId: string,
    generation: number,
  ): Promise<void> {
    const subscription = this.client.collection<TRecord>(collectionName).subscribe('*', (event) => {
      if (!this.isCurrent(userId, generation) || event.record.owner !== userId) return;

      try {
        const action = parseRealtimeAction(event.action);
        const mappedEvent = {
          collection,
          action,
          owner: event.record.owner,
          record: mapper(event.record),
        } as AppRealtimeEvent;
        this.handlers?.onEvent(mappedEvent);
      } catch (error: unknown) {
        this.handlers?.onConnectionError(realtimeErrorMessage(error));
      }
    }, { filter });

    return this.registerSubscription(subscription, generation);
  }

  private async registerSubscription(subscription: Promise<UnsubscribeFunc>, generation: number): Promise<void> {
    const unsubscribe = await subscription;
    if (generation !== this.generation) {
      await unsubscribe();
      return;
    }
    this.unsubscribers.push(unsubscribe);
  }

  private installDisconnectHook(generation: number): void {
    this.previousDisconnectHook = this.client.realtime.onDisconnect;
    const hook: DisconnectHook = (activeSubscriptions) => {
      this.previousDisconnectHook?.(activeSubscriptions);
      if (generation === this.generation && activeSubscriptions.length > 0) {
        this.handlers?.onConnectionError('A sincronização em tempo real foi interrompida. A aplicação tentará restabelecer a ligação.');
      }
    };
    this.installedDisconnectHook = hook;
    this.client.realtime.onDisconnect = hook;
  }

  private restoreDisconnectHook(): void {
    if (this.client.realtime.onDisconnect === this.installedDisconnectHook) {
      this.client.realtime.onDisconnect = this.previousDisconnectHook;
    }
    this.previousDisconnectHook = undefined;
    this.installedDisconnectHook = undefined;
  }

  private assertAuthenticatedOwner(userId: string): void {
    const authRecord = this.client.authStore.record;
    if (
      !this.client.authStore.isValid
      || authRecord?.id !== userId
      || authRecord.collectionName !== POCKETBASE_COLLECTIONS.users
      || authRecord['verified'] !== true
    ) {
      throw new Error('É necessária uma sessão autenticada e verificada para iniciar a sincronização.');
    }
  }

  private isCurrent(userId: string, generation: number): boolean {
    return this.currentUserId === userId && this.generation === generation;
  }
}

function parseRealtimeAction(action: RecordSubscription['action']): RealtimeAction {
  if (action === 'create' || action === 'update' || action === 'delete') return action;
  throw new Error('O servidor enviou um evento de sincronização desconhecido.');
}

function realtimeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `Não foi possível sincronizar as alterações: ${error.message}`;
  }
  return 'Não foi possível sincronizar as alterações em tempo real.';
}
