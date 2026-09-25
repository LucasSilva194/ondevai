import { TestBed } from '@angular/core/testing';
import PocketBase from 'pocketbase';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PocketBaseClientService } from '../../core/pocketbase/pocketbase.client';
import { POCKETBASE_ENDPOINTS } from '../../core/pocketbase/pocketbase.endpoints';
import { AccountService } from './account.service';

describe('AccountService', () => {
  const send = vi.fn();
  const client = {
    authStore: { isValid: true, record: { id: 'user12345678901' } },
    send,
  } as unknown as PocketBase;

  beforeEach(() => {
    send.mockReset().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        AccountService,
        { provide: PocketBaseClientService, useValue: { client } },
      ],
    });
  });

  it('envia apenas password e confirmação para o endpoint de eliminação', async () => {
    await TestBed.inject(AccountService).deleteAccount('segredo', 'APAGAR CONTA');

    expect(send).toHaveBeenCalledWith(POCKETBASE_ENDPOINTS.account.delete, {
      method: 'POST',
      body: { password: 'segredo', confirmation: 'APAGAR CONTA' },
    });
    expect(send.mock.calls[0][1].body).not.toHaveProperty('userId');
  });

  it('traduz falhas sem revelar a resposta interna', async () => {
    send.mockRejectedValue({ status: 403, response: { message: 'password hash mismatch' } });

    await expect(TestBed.inject(AccountService).deleteAccount('errada', 'APAGAR CONTA'))
      .rejects.toThrow('Não foi possível confirmar a sua identidade');
  });
});
