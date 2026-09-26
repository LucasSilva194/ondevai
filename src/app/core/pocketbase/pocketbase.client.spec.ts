import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { DEFAULT_POCKETBASE_URL, POCKETBASE_URL, PocketBaseClientService } from './pocketbase.client';

describe('PocketBaseClientService', () => {
  it('usa a origem do ambiente por omissão', () => {
    TestBed.configureTestingModule({ providers: [PocketBaseClientService] });
    expect(TestBed.inject(PocketBaseClientService).client.baseURL).toBe(DEFAULT_POCKETBASE_URL);
  });

  it('permite substituir a origem local através do InjectionToken', () => {
    TestBed.configureTestingModule({ providers: [PocketBaseClientService, { provide: POCKETBASE_URL, useValue: 'http://localhost:9080' }] });
    expect(TestBed.inject(PocketBaseClientService).client.baseURL).toBe('http://localhost:9080');
  });
});
