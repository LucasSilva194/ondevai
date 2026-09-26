import { TestBed } from '@angular/core/testing';
import PocketBase from 'pocketbase';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import { POCKETBASE_COLLECTIONS } from '../pocketbase/pocketbase.types';
import { AppRealtimeEvent, PocketBaseRealtimeService } from './pocketbase-realtime.service';

type SubscriptionCallback = (event: { action: string; record: Record<string, unknown> }) => void;
type TestUnsubscribe = () => Promise<void>;

const owner = 'user12345678901';
const otherOwner = 'other1234567890';
const expenseId = 'expense12345678';

function expenseRecord(recordOwner = owner): Record<string, unknown> {
  return {
    id: expenseId,
    collectionId: POCKETBASE_COLLECTIONS.expenses,
    collectionName: POCKETBASE_COLLECTIONS.expenses,
    owner: recordOwner,
    date: '2026-09-25',
    amountCents: 1250,
    category: 'category1234567',
    created: '2026-09-25 10:00:00.000Z',
    updated: '2026-09-25 11:00:00.000Z',
  };
}

describe('PocketBaseRealtimeService', () => {
  let callbacks: Map<string, SubscriptionCallback>;
  let unsubscribe: Mock<TestUnsubscribe>;
  let collectionSubscribe: Mock<(collection: string, callback: SubscriptionCallback) => Promise<TestUnsubscribe>>;
  let connectSubscribe: Mock<(_topic: string, callback: SubscriptionCallback) => Promise<TestUnsubscribe>>;
  let realtime: {
    subscribe: ReturnType<typeof vi.fn>;
    onDisconnect?: (activeSubscriptions: string[]) => void;
  };
  let client: PocketBase;

  beforeEach(() => {
    callbacks = new Map();
    unsubscribe = vi.fn().mockResolvedValue(undefined);
    collectionSubscribe = vi.fn(async (collection: string, callback: SubscriptionCallback) => {
      callbacks.set(collection, callback);
      return unsubscribe;
    });
    connectSubscribe = vi.fn(async (_topic: string, callback: SubscriptionCallback) => {
      callbacks.set('PB_CONNECT', callback);
      return unsubscribe;
    });
    realtime = { subscribe: connectSubscribe };
    client = {
      authStore: {
        isValid: true,
        record: { id: owner, collectionName: POCKETBASE_COLLECTIONS.users, verified: true },
      },
      filter: vi.fn().mockReturnValue(`owner = "${owner}"`),
      realtime,
      collection: vi.fn((name: string) => ({
        subscribe: (topic: string, callback: SubscriptionCallback, options: object) => {
          expect(topic).toBe('*');
          expect(options).toEqual({ filter: `owner = "${owner}"` });
          return collectionSubscribe(name, callback);
        },
      })),
    } as unknown as PocketBase;

    TestBed.configureTestingModule({
      providers: [
        PocketBaseRealtimeService,
        { provide: PocketBaseClientService, useValue: { client } },
      ],
    });
  });

  it('subscreve tipadamente as oito coleções e mapeia create, update e delete', async () => {
    const events: AppRealtimeEvent[] = [];
    const service = TestBed.inject(PocketBaseRealtimeService);

    await service.start(owner, { onEvent: (event) => events.push(event), onConnectionError: vi.fn() });

    expect([...callbacks.keys()]).toEqual(expect.arrayContaining([
      'PB_CONNECT',
      ...Object.values(POCKETBASE_COLLECTIONS).filter((name) => name !== POCKETBASE_COLLECTIONS.users),
    ]));
    const emitExpense = callbacks.get(POCKETBASE_COLLECTIONS.expenses);
    expect(emitExpense).toBeDefined();
    emitExpense?.({ action: 'create', record: expenseRecord() });
    emitExpense?.({ action: 'update', record: { ...expenseRecord(), amountCents: 1700 } });
    emitExpense?.({ action: 'delete', record: expenseRecord() });

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({ collection: 'expenses', action: 'create', record: { id: expenseId, amountCents: 1250 } });
    expect(events[1]).toMatchObject({ collection: 'expenses', action: 'update', record: { amountCents: 1700 } });
    expect(events[2]).toMatchObject({ collection: 'expenses', action: 'delete', record: { id: expenseId } });
  });

  it('ignora records de outro owner mesmo que as rules do servidor já filtrem', async () => {
    const onEvent = vi.fn();
    const service = TestBed.inject(PocketBaseRealtimeService);
    await service.start(owner, { onEvent, onConnectionError: vi.fn() });

    callbacks.get(POCKETBASE_COLLECTIONS.expenses)?.({ action: 'create', record: expenseRecord(otherOwner) });

    expect(onEvent).not.toHaveBeenCalled();
  });

  it('não duplica subscrições ao reiniciar realtime para a mesma sessão', async () => {
    const service = TestBed.inject(PocketBaseRealtimeService);
    const handlers = { onEvent: vi.fn(), onConnectionError: vi.fn() };

    await service.start(owner, handlers);
    await service.start(owner, handlers);

    expect(collectionSubscribe).toHaveBeenCalledTimes(8);
    expect(connectSubscribe).toHaveBeenCalledOnce();
  });

  it('reporta desconexão temporária, aceita reconnect do SDK e não elimina subscrições', async () => {
    const onConnectionError = vi.fn();
    const service = TestBed.inject(PocketBaseRealtimeService);
    await service.start(owner, { onEvent: vi.fn(), onConnectionError });

    realtime.onDisconnect?.(['expenses/*']);
    expect(onConnectionError).toHaveBeenLastCalledWith(expect.stringMatching(/interrompida/));

    callbacks.get('PB_CONNECT')?.({ action: '', record: {} });
    expect(onConnectionError).toHaveBeenLastCalledWith(null);
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('cancela completamente as nove subscrições no logout', async () => {
    const service = TestBed.inject(PocketBaseRealtimeService);
    await service.start(owner, { onEvent: vi.fn(), onConnectionError: vi.fn() });

    await service.stop();

    expect(unsubscribe).toHaveBeenCalledTimes(9);
  });

  it('rejeita o arranque sem uma sessão autenticada e verificada', async () => {
    (client.authStore as { isValid: boolean }).isValid = false;
    const service = TestBed.inject(PocketBaseRealtimeService);

    await expect(service.start(owner, { onEvent: vi.fn(), onConnectionError: vi.fn() })).rejects.toThrow(/sessão autenticada/);
    expect(collectionSubscribe).not.toHaveBeenCalled();
  });
});
