import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService, AuthUser } from '../../core/auth/auth.service';
import { UserSessionService } from '../../core/auth/user-session.service';
import { PwaService } from '../../core/services/pwa.service';
import { AccountComponent } from './account.component';
import { AccountService } from './account.service';

describe('AccountComponent', () => {
  const user = signal<AuthUser | null>({ id: 'user12345678901', email: 'pessoa@example.com', verified: true });
  const offline = signal(false);
  const requestEmailChange = vi.fn().mockResolvedValue(undefined);
  const changePassword = vi.fn().mockResolvedValue(undefined);
  const deleteAccount = vi.fn().mockResolvedValue(undefined);
  const logout = vi.fn().mockResolvedValue(undefined);
  let fixture: ComponentFixture<AccountComponent>;

  beforeEach(async () => {
    offline.set(false);
    requestEmailChange.mockClear();
    changePassword.mockClear();
    deleteAccount.mockClear();
    logout.mockClear();
    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        { provide: AuthService, useValue: { user: user.asReadonly(), requestEmailChange, changePassword } },
        { provide: UserSessionService, useValue: { logout } },
        { provide: AccountService, useValue: { deleteAccount } },
        { provide: PwaService, useValue: { offline: offline.asReadonly() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
  });

  it('mostra email e estado de verificação', () => {
    expect(fixture.nativeElement.textContent).toContain('pessoa@example.com');
    expect(fixture.nativeElement.textContent).toContain('Email verificado');
  });

  it('pede a alteração de email e apresenta uma confirmação acessível', async () => {
    fixture.componentInstance.emailForm.setValue({ email: 'novo@example.com' });

    await fixture.componentInstance.submitEmailChange();
    fixture.detectChanges();

    expect(requestEmailChange).toHaveBeenCalledWith('novo@example.com');
    expect(fixture.nativeElement.querySelector('[role="status"]').textContent).toContain('Pedido enviado');
  });

  it('valida a palavra-passe e exige confirmação coincidente', async () => {
    fixture.componentInstance.passwordForm.setValue({
      currentPassword: 'atual', password: '12345678', passwordConfirm: 'diferente',
    });

    await fixture.componentInstance.submitPasswordChange();
    expect(changePassword).not.toHaveBeenCalled();

    fixture.componentInstance.passwordForm.setValue({
      currentPassword: 'atual', password: '12345678', passwordConfirm: '12345678',
    });
    await fixture.componentInstance.submitPasswordChange();
    expect(changePassword).toHaveBeenCalledWith('atual', '12345678', '12345678');
  });

  it('exige password e a frase exata antes de eliminar a conta', async () => {
    fixture.componentInstance.deleteForm.setValue({ password: '', confirmation: 'APAGAR CONTA' });
    await fixture.componentInstance.deleteAccount();
    fixture.componentInstance.deleteForm.setValue({ password: 'atual', confirmation: 'APAGAR' });
    await fixture.componentInstance.deleteAccount();
    expect(deleteAccount).not.toHaveBeenCalled();

    fixture.componentInstance.deleteForm.setValue({ password: 'atual', confirmation: 'APAGAR CONTA' });
    await fixture.componentInstance.deleteAccount();

    expect(deleteAccount).toHaveBeenCalledWith('atual', 'APAGAR CONTA');
    expect(logout).toHaveBeenCalledOnce();
  });

  it('usa UserSessionService para logout e não contém qualquer ação para apagar IndexedDB', async () => {
    await fixture.componentInstance.logout();

    expect(logout).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('não são apagados');
  });
});
