import { Injectable, InjectionToken, inject } from '@angular/core';
import PocketBase from 'pocketbase';

export const DEFAULT_POCKETBASE_URL = 'http://127.0.0.1:8090';

export const POCKETBASE_URL = new InjectionToken<string>('POCKETBASE_URL', {
  providedIn: 'root',
  factory: () => DEFAULT_POCKETBASE_URL,
});

@Injectable({ providedIn: 'root' })
export class PocketBaseClientService {
  public readonly client: PocketBase;

  constructor() {
    this.client = new PocketBase(inject(POCKETBASE_URL));
  }
}
