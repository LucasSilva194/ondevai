import { TestBed } from '@angular/core/testing';
import PocketBase, { RecordModel } from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';
import { AuthService } from './auth.service';

type AuthStoreChange = (token: string, record: RecordModel | null) => void;

class FakeAuthStore {
  token = '';
  record: RecordModel | null = null;
  isValid = false;
  clearCalls = 0;
  private readonly callbacks = new Set<AuthStoreChange>();

  onChange(callback: AuthStoreChange, fireImmediately = false): () => void {
    this.callbacks.add(callback);
    if (fireImmediately) callback(this.token, this.record);
    return () => this.callbacks.delete(callback);
  }

  save(token: string, record: RecordModel): void {
    this.token = token;
    this.record = record;
    this.isValid = true;
    this.emit();
  }

  clear(): void {
    this.token = '';
    this.record = null;
    this.isValid = false;
    this.clearCalls += 1;
    this.emit();
  }

  expireWithoutClearing(): void {
    this.isValid = false;
    this.emit();
  }

  private emit(): void {
    for (const callback of this.callbacks) callback(this.token, this.record);
  }
}

function userRecord(overrides: Partial<RecordModel> = {}): RecordModel {
  return {
    id: 'user12345678901',
    collectionId: 'users_collection',
    collectionName: 'users',
    created: '2026-09-25 10:00:00.000Z',
    updated: '2026-09-25 10:00:00.000Z',
    email: 'pessoa@example.com',
    verified: true,
    ...overrides,
  };
}

describe('AuthService', () => {
  let authStore: FakeAuthStore;
  let collection: {
    create: ReturnType<typeof vi.fn>;
    authWithPassword: ReturnType<typeof vi.fn>;
    authRefresh: ReturnType<typeof vi.fn>;
    requestVerification: ReturnType<typeof vi.fn>;
    confirmVerification: ReturnType<typeof vi.fn>;
    requestPasswordReset: ReturnType<typeof vi.fn>;
    confirmPasswordReset: ReturnType<typeof vi.fn>;
  };
  let client: PocketBase;

  beforeEach(() => {
    authStore = new FakeAuthStore();
    collection = {
      create: vi.fn().mockResolvedValue(userRecord({ verified: false })),
      authWithPassword: vi.fn().mockImplementation(async () => {
        const record = userRecord();
        authStore.save('valid-token', record);
        return { token: 'valid-token', record };
      }),
      authRefresh: vi.fn().mockResolvedValue({ token: 'refreshed-token', record: userRecord() }),
      requestVerification: vi.fn().mockResolvedValue(true),
      confirmVerification: vi.fn().mockResolvedValue(true),
      requestPasswordReset: vi.fn().mockResolvedValue(true),
      confirmPasswordReset: vi.fn().mockResolvedValue(true),
    };
    client = {
      authStore,
      collection: vi.fn().mockReturnValue(collection),
    } as unknown as PocketBase;

    TestBed.configureTestingModule({
      providers: [
        AuthService,
        { provide: PocketBaseClientService, useValue: { client } },
      ],
    });
  });

  it('autentica com credenciais válidas e expõe apenas o utilizador seguro', async () => {
    const service = TestBed.inject(AuthService);

    await service.login(' Pessoa@Example.com ', 'password-123');

    expect(collection.authWithPassword).toHaveBeenCalledWith('pessoa@example.com', 'password-123');
    expect(service.authenticated()).toBe(true);
    expect(service.user()).toEqual({ id: 'user12345678901', email: 'pessoa@example.com', verified: true });
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.user()).not.toHaveProperty('token');
  });

  it('traduz um login inválido sem expor a resposta interna', async () => {
    collection.authWithPassword.mockRejectedValue({ status: 400, response: { message: 'internal' } });
    const service = TestBed.inject(AuthService);

    await expect(service.login('pessoa@example.com', 'errada')).rejects.toThrow(
      'O email ou a palavra-passe estão incorretos.',
    );
    expect(service.authenticated()).toBe(false);
    expect(service.error()).toBe('O email ou a palavra-passe estão incorretos.');
  });

  it('regista a conta com email normalizado e permite pedir a confirmação', async () => {
    const service = TestBed.inject(AuthService);

    await service.register(' Nova@Example.com ', 'password-123', 'password-123');
    await service.requestVerification();

    expect(collection.create).toHaveBeenCalledWith({
      email: 'nova@example.com',
      password: 'password-123',
      passwordConfirm: 'password-123',
    });
    expect(collection.requestVerification).toHaveBeenCalledWith('nova@example.com');
    expect(service.authenticated()).toBe(false);
  });

  it('refresca uma sessão válida no arranque', async () => {
    authStore.save('valid-token', userRecord());
    const service = TestBed.inject(AuthService);

    await service.initialize();

    expect(collection.authRefresh).toHaveBeenCalledOnce();
    expect(service.authenticated()).toBe(true);
    expect(authStore.clearCalls).toBe(0);
  });

  it('limpa uma sessão local expirada antes de tentar o refresh', async () => {
    authStore.save('expired-token', userRecord());
    authStore.expireWithoutClearing();
    const service = TestBed.inject(AuthService);

    await service.initialize();

    expect(collection.authRefresh).not.toHaveBeenCalled();
    expect(authStore.clearCalls).toBe(1);
    expect(service.authenticated()).toBe(false);
    expect(service.error()).toBe('A sua sessão expirou. Inicie sessão novamente.');
  });

  it('limpa a sessão quando o servidor rejeita o token', async () => {
    authStore.save('invalid-token', userRecord());
    collection.authRefresh.mockRejectedValue({ status: 401 });
    const service = TestBed.inject(AuthService);

    await expect(service.refreshSession()).rejects.toThrow('A sua sessão expirou.');

    expect(authStore.clearCalls).toBe(1);
    expect(service.authenticated()).toBe(false);
  });

  it('preserva a sessão local numa falha temporária de rede durante o refresh', async () => {
    authStore.save('valid-token', userRecord());
    collection.authRefresh.mockRejectedValue({ status: 0, originalError: new TypeError('offline') });
    const service = TestBed.inject(AuthService);

    await service.initialize();

    expect(authStore.clearCalls).toBe(0);
    expect(service.authenticated()).toBe(true);
    expect(service.user()?.email).toBe('pessoa@example.com');
    expect(service.error()).toContain('Não foi possível contactar o servidor');
  });

  it('termina a sessão limpando o auth store', async () => {
    const service = TestBed.inject(AuthService);
    await service.login('pessoa@example.com', 'password-123');

    service.logout();

    expect(authStore.clearCalls).toBe(1);
    expect(service.authenticated()).toBe(false);
    expect(service.user()).toBeNull();
  });

  it('não revela a existência do email na recuperação de palavra-passe', async () => {
    collection.requestPasswordReset.mockRejectedValue({ status: 400, response: { data: { email: 'missing' } } });
    const service = TestBed.inject(AuthService);

    await expect(service.requestPasswordReset('desconhecido@example.com')).resolves.toBeUndefined();

    expect(service.error()).toBeNull();
    expect(collection.requestPasswordReset).toHaveBeenCalledWith('desconhecido@example.com');
  });

  it('reporta falhas de rede na recuperação sem mencionar a existência da conta', async () => {
    collection.requestPasswordReset.mockRejectedValue({ status: 0 });
    const service = TestBed.inject(AuthService);

    await expect(service.requestPasswordReset('pessoa@example.com')).rejects.toThrow('Não foi possível contactar');
    expect(service.error()).not.toContain('existe');
    expect(service.error()).not.toContain('associado');
  });
});
