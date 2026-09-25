const POCKETBASE_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const POCKETBASE_ID_LENGTH = 15;
const MAX_UNBIASED_BYTE = Math.floor(256 / POCKETBASE_ID_ALPHABET.length) * POCKETBASE_ID_ALPHABET.length;

export function isPocketBaseId(value: string): boolean {
  return /^[a-z0-9]{15}$/.test(value);
}

export function createPocketBaseId(): string {
  const result: string[] = [];
  const randomBytes = new Uint8Array(POCKETBASE_ID_LENGTH * 2);

  while (result.length < POCKETBASE_ID_LENGTH) {
    crypto.getRandomValues(randomBytes);
    for (const byte of randomBytes) {
      if (byte >= MAX_UNBIASED_BYTE) continue;
      result.push(POCKETBASE_ID_ALPHABET[byte % POCKETBASE_ID_ALPHABET.length]);
      if (result.length === POCKETBASE_ID_LENGTH) break;
    }
  }

  return result.join('');
}

export function assertPocketBaseId(value: string): void {
  if (!isPocketBaseId(value)) {
    throw new Error('O identificador do registo não é compatível com o PocketBase.');
  }
}
