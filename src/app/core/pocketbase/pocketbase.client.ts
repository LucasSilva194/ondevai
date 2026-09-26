import { Injectable, InjectionToken, inject } from '@angular/core';
import PocketBase from 'pocketbase';
import { environment } from '../../../environments/environment';

export const DEFAULT_POCKETBASE_URL = environment.pocketBaseUrl;

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
