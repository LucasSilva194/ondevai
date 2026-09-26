import { ClientResponseError } from 'pocketbase';
import { describe, expect, it } from 'vitest';
import { PocketBaseRepositoryError, translatePocketBaseError } from './pocketbase.errors';

describe('translatePocketBaseError', () => {
  it.each([
    [400, 'validation'],
    [401, 'authentication'],
    [403, 'authorization'],
    [404, 'not-found'],
    [409, 'conflict'],
  ] as const)('traduz a resposta HTTP %s', (status, code) => {
    const translated = translatePocketBaseError(new ClientResponseError({ status, response: {} }));
    expect(translated).toBeInstanceOf(PocketBaseRepositoryError);
    expect((translated as PocketBaseRepositoryError).code).toBe(code);
    expect(translated.message).not.toContain('token');
  });

  it('traduz falhas de rede sem expor detalhes internos', () => {
    const responseError = translatePocketBaseError(new ClientResponseError({ status: 0, originalError: new TypeError('fetch failed') }));
    const fetchError = translatePocketBaseError(new TypeError('fetch failed'));
    expect((responseError as PocketBaseRepositoryError).code).toBe('network');
    expect((fetchError as PocketBaseRepositoryError).code).toBe('network');
    expect(fetchError.message).not.toContain('fetch failed');
  });
});
