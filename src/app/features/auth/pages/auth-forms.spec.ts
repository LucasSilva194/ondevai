import { FormControl, FormGroup } from '@angular/forms';
import { describe, expect, it } from 'vitest';
import { EmailVerificationComponent } from './email-verification.component';
import { LoginComponent } from './login.component';
import { PasswordRecoveryComponent } from './password-recovery.component';
import { PasswordResetComponent } from './password-reset.component';
import { passwordsMatchValidator } from './register.component';

describe('formulários de autenticação', () => {
  it('rejeita palavras-passe diferentes no registo e reset', () => {
    const form = new FormGroup({
      password: new FormControl('password-123', { nonNullable: true }),
      passwordConfirm: new FormControl('password-456', { nonNullable: true }),
    }, { validators: passwordsMatchValidator });

    expect(form.hasError('passwordsMismatch')).toBe(true);
  });

  it('aceita palavras-passe iguais', () => {
    const form = new FormGroup({
      password: new FormControl('password-123', { nonNullable: true }),
      passwordConfirm: new FormControl('password-123', { nonNullable: true }),
    }, { validators: passwordsMatchValidator });

    expect(form.errors).toBeNull();
  });

  it('mantém todos os ecrãs como componentes standalone importáveis', () => {
    expect(LoginComponent).toBeDefined();
    expect(PasswordRecoveryComponent).toBeDefined();
    expect(PasswordResetComponent).toBeDefined();
    expect(EmailVerificationComponent).toBeDefined();
  });
});
