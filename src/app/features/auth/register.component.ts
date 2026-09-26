import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthPageComponent } from './auth-page.component';

export const passwordsMatchValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const password = control.get('password')?.value;
  const passwordConfirm = control.get('passwordConfirm')?.value;
  return password === passwordConfirm ? null : { passwordsMismatch: true };
};

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [AuthPageComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-page>
      <p class="eyebrow">Nova conta</p>
      <h1>Começar a organizar</h1>
      <p class="intro">Crie uma conta para guardar e consultar os seus dados no OndeVai.</p>

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset [disabled]="auth.loading()">
          <div class="field">
            <label for="register-email">Email</label>
            <input id="register-email" type="email" formControlName="email" autocomplete="email" inputmode="email"
              [attr.aria-invalid]="showError('email')" [attr.aria-describedby]="showError('email') ? 'register-email-error' : null">
            @if (showError('email')) { <p id="register-email-error" class="field-error">Introduza um email válido.</p> }
          </div>

          <div class="field">
            <label for="register-password">Palavra-passe</label>
            <input id="register-password" type="password" formControlName="password" autocomplete="new-password"
              [attr.aria-invalid]="showError('password')" [attr.aria-describedby]="showError('password') ? 'register-password-help register-password-error' : 'register-password-help'">
            <p id="register-password-help" class="helper">Utilize pelo menos 8 caracteres.</p>
            @if (showError('password')) { <p id="register-password-error" class="field-error">A palavra-passe deve ter pelo menos 8 caracteres.</p> }
          </div>

          <div class="field">
            <label for="register-password-confirm">Confirmar palavra-passe</label>
            <input id="register-password-confirm" type="password" formControlName="passwordConfirm" autocomplete="new-password"
              [attr.aria-invalid]="showMismatch()" [attr.aria-describedby]="showMismatch() ? 'register-password-confirm-error' : null">
            @if (showMismatch()) { <p id="register-password-confirm-error" class="field-error">As palavras-passe não coincidem.</p> }
          </div>

          <button class="btn btn-primary" type="submit" [disabled]="auth.loading()">
            {{ auth.loading() ? 'A criar conta...' : 'Criar conta' }}
          </button>
        </fieldset>
      </form>

      @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
      @if (auth.loading()) { <p class="helper" role="status">A criar a sua conta.</p> }
      <nav class="auth-links single" aria-label="Outras opções de autenticação"><a routerLink="/entrar">Já tenho conta</a></nav>
    </app-auth-page>
  `,
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterComponent {
  readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    passwordConfirm: ['', Validators.required],
  }, { validators: passwordsMatchValidator });

  showError(controlName: 'email' | 'password'): boolean {
    const control = this.form.controls[controlName];
    return control.invalid && (control.dirty || control.touched);
  }

  showMismatch(): boolean {
    const control = this.form.controls.passwordConfirm;
    return (control.invalid || this.form.hasError('passwordsMismatch')) && (control.dirty || control.touched);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password, passwordConfirm } = this.form.getRawValue();
    try {
      await this.auth.register(email, password, passwordConfirm);
      try {
        await this.auth.requestVerification();
      } catch {
        // The confirmation screen lets the user retry without creating another account.
      }
      await this.router.navigate(['/confirmar-email']);
    } catch {
      // AuthService exposes the translated error to the template.
    }
  }
}
