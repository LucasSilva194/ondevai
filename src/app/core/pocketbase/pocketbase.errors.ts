import { ClientResponseError } from 'pocketbase';

export type PocketBaseErrorCode = 'validation' | 'authentication' | 'authorization' | 'not-found' | 'conflict' | 'network' | 'remote';

export class PocketBaseRepositoryError extends Error {
  constructor(
    public readonly code: PocketBaseErrorCode,
    message: string,
    cause?: unknown,
  ) {
    super(message, { cause });
  }
}

export function isPocketBaseNotFound(error: unknown): boolean {
  return error instanceof ClientResponseError && error.status === 404;
}

export function translatePocketBaseError(error: unknown): Error {
  if (error instanceof PocketBaseRepositoryError) return error;

  if (error instanceof ClientResponseError) {
    if (error.status === 0) {
      return new PocketBaseRepositoryError('network', 'Não foi possível contactar o servidor. Verifique a ligação e tente novamente.', error);
    }

    const translated = new Map<number, readonly [PocketBaseErrorCode, string]>([
      [400, ['validation', 'Os dados enviados não são válidos. Reveja os campos e tente novamente.']],
      [401, ['authentication', 'A sessão terminou. Inicie sessão novamente.']],
      [403, ['authorization', 'Não tem permissão para realizar esta operação.']],
      [404, ['not-found', 'O registo pedido não foi encontrado.']],
      [409, ['conflict', 'Os dados entram em conflito com um registo existente.']],
    ]);
    const match = translated.get(error.status);
    if (match) return new PocketBaseRepositoryError(match[0], match[1], error);

    return new PocketBaseRepositoryError('remote', 'Não foi possível concluir a operação no servidor.', error);
  }

  if (error instanceof TypeError) {
    return new PocketBaseRepositoryError('network', 'Não foi possível contactar o servidor. Verifique a ligação e tente novamente.', error);
  }

  return error instanceof Error
    ? error
    : new PocketBaseRepositoryError('remote', 'Não foi possível concluir a operação no servidor.', error);
}

export async function withPocketBaseErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: unknown) {
    throw translatePocketBaseError(error);
  }
}
