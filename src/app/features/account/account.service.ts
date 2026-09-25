import { Injectable, inject } from '@angular/core';
import { POCKETBASE_ENDPOINTS } from '../../core/pocketbase/pocketbase.endpoints';
import { PocketBaseClientService } from '../../core/pocketbase/pocketbase.client';

interface PocketBaseErrorLike {
  readonly status: number;
}

@Injectable({ providedIn: 'root' })
export class AccountService {
  private readonly client = inject(PocketBaseClientService).client;

  async deleteAccount(password: string, confirmation: string): Promise<void> {
    if (!this.client.authStore.isValid || !this.client.authStore.record?.id) {
      throw new Error('A sua sessão expirou. Inicie sessão novamente.');
    }

    try {
      await this.client.send<unknown>(POCKETBASE_ENDPOINTS.account.delete, {
        method: 'POST',
        body: { password, confirmation },
      });
    } catch (error: unknown) {
      throw new Error(accountDeletionErrorMessage(error), { cause: error });
    }
  }
}

function accountDeletionErrorMessage(error: unknown): string {
  if (!isPocketBaseError(error)) return 'Não foi possível eliminar a conta. Tente novamente.';
  if (error.status === 0) return 'Não foi possível contactar o servidor. Verifique a ligação e tente novamente.';
  if (error.status === 401 || error.status === 403) {
    return 'Não foi possível confirmar a sua identidade. Verifique a palavra-passe atual.';
  }
  if (error.status === 400 || error.status === 409) {
    return 'Não foi possível eliminar a conta. Confirme a palavra-passe e a frase de confirmação.';
  }
  if (error.status === 429) return 'Foram feitos demasiados pedidos. Aguarde um momento e tente novamente.';
  if (error.status >= 500) return 'O serviço está temporariamente indisponível. Tente novamente dentro de momentos.';
  return 'Não foi possível eliminar a conta. Tente novamente.';
}

function isPocketBaseError(error: unknown): error is PocketBaseErrorLike {
  return typeof error === 'object'
    && error !== null
    && 'status' in error
    && typeof error.status === 'number';
}
