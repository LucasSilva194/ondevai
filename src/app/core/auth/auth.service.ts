import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { RecordModel } from 'pocketbase';
import { PocketBaseClientService } from '../pocketbase/pocketbase.client';

export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly verified: boolean;
}

interface AuthUserRecord extends RecordModel {
  email: string;
  verified: boolean;
}

type AuthOperation =
  | 'login'
  | 'register'
  | 'refresh'
  | 'request-verification'
  | 'confirm-verification'
  | 'request-password-reset'
  | 'confirm-password-reset';

interface PocketBaseErrorLike {
  readonly status: number;
  readonly isAbort?: boolean;
  readonly originalError?: unknown;
}

class AuthMessageError extends Error {}
class SessionExpiredError extends Error {}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly pocketBase = inject(PocketBaseClientService).client;
  private readonly userState = signal<AuthUser | null>(null);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private initialization: Promise<void> | null = null;
  private pendingVerificationEmail: string | null = null;

  readonly user = this.userState.asReadonly();
  readonly authenticated = computed(() => this.user() !== null);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    const unsubscribe = this.pocketBase.authStore.onChange(
      (_token, record) => this.syncUser(record),
      true,
    );
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  initialize(): Promise<void> {
    this.initialization ??= this.run('refresh', () => this.validateCurrentSession()).catch(() => undefined);
    return this.initialization;
  }

  async register(email: string, password: string, passwordConfirm: string): Promise<void> {
    const normalizedEmail = normalizeEmail(email);
    await this.run('register', async () => {
      await this.pocketBase.collection('users').create<AuthUserRecord>({
        email: normalizedEmail,
        password,
        passwordConfirm,
      });
      this.pendingVerificationEmail = normalizedEmail;
    });
  }

  async login(email: string, password: string): Promise<void> {
    await this.run('login', async () => {
      await this.pocketBase.collection('users').authWithPassword<AuthUserRecord>(normalizeEmail(email), password);
      this.pendingVerificationEmail = null;
      this.syncUser(this.pocketBase.authStore.record);
    });
  }

  logout(): void {
    this.errorState.set(null);
    this.pendingVerificationEmail = null;
    this.pocketBase.authStore.clear();
    this.userState.set(null);
  }

  async refreshSession(): Promise<void> {
    await this.run('refresh', () => this.validateCurrentSession());
  }

  async requestVerification(): Promise<void> {
    await this.run('request-verification', async () => {
      const email = this.user()?.email ?? this.pendingVerificationEmail;
      if (!email) {
        throw new AuthMessageError('Não existe um email pendente de confirmação. Registe-se ou inicie sessão novamente.');
      }
      await this.pocketBase.collection('users').requestVerification(email);
    });
  }

  async confirmVerification(token: string): Promise<void> {
    await this.run('confirm-verification', async () => {
      const normalizedToken = token.trim();
      if (!normalizedToken) {
        throw new AuthMessageError('O link de confirmação não é válido.');
      }
      await this.pocketBase.collection('users').confirmVerification(normalizedToken);
      this.pendingVerificationEmail = null;
      this.syncUser(this.pocketBase.authStore.record);
    });
  }

  async requestPasswordReset(email: string): Promise<void> {
    this.errorState.set(null);
    this.loadingState.set(true);
    try {
      await this.pocketBase.collection('users').requestPasswordReset(normalizeEmail(email));
    } catch (error: unknown) {
      if (!isNonEnumeratingPasswordResetResponse(error)) {
        const message = authErrorMessage(error, 'request-password-reset');
        this.errorState.set(message);
        throw new Error(message, { cause: error });
      }
    } finally {
      this.loadingState.set(false);
    }
  }

  async confirmPasswordReset(token: string, password: string, passwordConfirm: string): Promise<void> {
    await this.run('confirm-password-reset', async () => {
      const normalizedToken = token.trim();
      if (!normalizedToken) {
        throw new AuthMessageError('O link de recuperação não é válido.');
      }
      await this.pocketBase.collection('users').confirmPasswordReset(
        normalizedToken,
        password,
        passwordConfirm,
      );
    });
  }

  private async validateCurrentSession(): Promise<void> {
    const { authStore } = this.pocketBase;
    if (!authStore.token || !authStore.record) {
      if (authStore.token || authStore.record) authStore.clear();
      this.userState.set(null);
      return;
    }

    if (!authStore.isValid) {
      authStore.clear();
      this.userState.set(null);
      throw new SessionExpiredError('A sua sessão expirou. Inicie sessão novamente.');
    }

    try {
      await this.pocketBase.collection('users').authRefresh<AuthUserRecord>();
      this.syncUser(authStore.record);
    } catch (error: unknown) {
      if (isInvalidSessionError(error)) {
        authStore.clear();
        this.userState.set(null);
      }
      throw error;
    }
  }

  private async run(operation: AuthOperation, action: () => Promise<void>): Promise<void> {
    this.errorState.set(null);
    this.loadingState.set(true);
    try {
      await action();
    } catch (error: unknown) {
      const message = authErrorMessage(error, operation);
      this.errorState.set(message);
      throw new Error(message, { cause: error });
    } finally {
      this.loadingState.set(false);
    }
  }

  private syncUser(record: RecordModel | null): void {
    if (!record || !this.pocketBase.authStore.isValid || record.collectionName !== 'users') {
      this.userState.set(null);
      return;
    }

    const email = record['email'];
    this.userState.set({
      id: record.id,
      email: typeof email === 'string' ? email : '',
      verified: record['verified'] === true,
    });
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLocaleLowerCase('pt-PT');
}

function isPocketBaseError(error: unknown): error is PocketBaseErrorLike {
  return typeof error === 'object'
    && error !== null
    && 'status' in error
    && typeof error.status === 'number';
}

function isInvalidSessionError(error: unknown): boolean {
  return isPocketBaseError(error) && (error.status === 401 || error.status === 403);
}

function isNonEnumeratingPasswordResetResponse(error: unknown): boolean {
  return isPocketBaseError(error) && [400, 401, 403, 404].includes(error.status);
}

function authErrorMessage(error: unknown, operation: AuthOperation): string {
  if (error instanceof AuthMessageError || error instanceof SessionExpiredError) return error.message;

  if (!isPocketBaseError(error)) {
    return 'Ocorreu um erro inesperado. Tente novamente.';
  }
  if (error.isAbort) return 'O pedido foi interrompido. Tente novamente.';
  if (error.status === 0) return 'Não foi possível contactar o servidor. Verifique a ligação e tente novamente.';
  if (error.status === 429) return 'Foram feitos demasiados pedidos. Aguarde um momento e tente novamente.';
  if (error.status >= 500) return 'O serviço está temporariamente indisponível. Tente novamente dentro de momentos.';

  if (operation === 'login' && (error.status === 400 || error.status === 401)) {
    return 'O email ou a palavra-passe estão incorretos.';
  }
  if (operation === 'register' && (error.status === 400 || error.status === 409)) {
    return 'Não foi possível criar a conta. Confirme os dados ou utilize outro email.';
  }
  if (operation === 'refresh' && isInvalidSessionError(error)) {
    return 'A sua sessão expirou. Inicie sessão novamente.';
  }
  if (operation === 'confirm-password-reset' && (error.status === 400 || error.status === 404)) {
    return 'O link de recuperação é inválido ou expirou.';
  }
  if (operation === 'confirm-verification' && (error.status === 400 || error.status === 404)) {
    return 'O link de confirmação é inválido ou expirou.';
  }
  if (error.status === 401) return 'A sua sessão expirou. Inicie sessão novamente.';
  if (error.status === 403) return 'Não tem permissão para concluir esta operação.';

  return 'Não foi possível concluir o pedido. Tente novamente.';
}
