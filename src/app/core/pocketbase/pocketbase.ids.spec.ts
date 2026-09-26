import { describe, expect, it } from 'vitest';
import { assertPocketBaseId, createPocketBaseId, isPocketBaseId } from './pocketbase.ids';

describe('PocketBase IDs', () => {
  it('gera IDs criptograficamente aleatórios com 15 caracteres alfanuméricos', () => {
    const ids = Array.from({ length: 100 }, () => createPocketBaseId());
    expect(ids.every((id) => id.length === 15 && /^[a-z0-9]+$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('valida apenas o formato aceite para novos records', () => {
    expect(isPocketBaseId('abcdefghijk1234')).toBe(true);
    expect(isPocketBaseId('Abcdefghijk1234')).toBe(false);
    expect(isPocketBaseId('uuid-with-hyphens')).toBe(false);
    expect(() => assertPocketBaseId('uuid-with-hyphens')).toThrow(/não é compatível/);
  });
});
