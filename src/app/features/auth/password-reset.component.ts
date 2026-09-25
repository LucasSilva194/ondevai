import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthPageComponent } from './auth-page.component';
import { passwordsMatchValidator } from './register.component';

@Component({
  selector: 'app-password-reset',
  standalone: true,
  imports: [AuthPageComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-page>
      <p class="eyebrow">Nova palavra-passe</p>
      <h1>Recuperar a conta</h1>

      @if (!token) {
        <p class="form-message error" role="alert">Este link de recuperação não é válido. Peça um novo email de recuperação.</p>
        <nav class="auth-links single"><a routerLink="/recuperar-password">Pedir novo link</a></nav>
      } @else if (completed()) {
        <p class="form-message success" role="status">A palavra-passe foi alterada. Já pode iniciar sessão com os novos dados.</p>
        <nav class="auth-links single"><a routerLink="/entrar">Iniciar sessão</a></nav>
      } @else {
        <p class="intro">Escolha uma palavra-passe nova para proteger a sua conta.</p>
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <fieldset [disabled]="auth.loading()">
            <div class="field">
              <label for="reset-password">Nova palavra-passe</label>
              <input id="reset-password" type="password" formControlName="password" autocomplete="new-password"
                [attr.aria-invalid]="showPasswordError()" [attr.aria-describedby]="showPasswordError() ? 'reset-password-help reset-password-error' : 'reset-password-help'">
              <p id="reset-password-help" class="helper">Utilize pelo menos 8 caracteres.</p>
              @if (showPasswordError()) { <p id="reset-password-error" class="field-error">A palavra-passe deve ter pelo menos 8 caracteres.</p> }
            </div>

            <div class="field">
              <label for="reset-password-confirm">Confirmar palavra-passe</label>
              <input id="reset-password-confirm" type="password" formControlName="passwordConfirm" autocomplete="new-password"
                [attr.aria-invalid]="showMismatch()" [attr.aria-describedby]="showMismatch() ? 'reset-password-confirm-error' : null">
              @if (showMismatch()) { <p id="reset-password-confirm-error" class="field-error">As palavras-passe não coincidem.</p> }
            </div>

            <button class="btn btn-primary" type="submit" [disabled]="auth.loading()">
              {{ auth.loading() ? 'A alterar...' : 'Alterar palavra-passe' }}
            </button>
          </fieldset>
        </form>
        @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
        @if (auth.loading()) { <p class="helper" role="status">A confirmar a nova palavra-passe.</p> }
      }
    </app-auth-page>
  `,
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordResetComponent {
  readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  readonly token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
  readonly completed = signal(false);
  readonly form = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required, Validators.minLength(8)]],
    passwordConfirm: ['', Validators.required],
  }, { validators: passwordsMatchValidator });

  showPasswordError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  showMismatch(): boolean {
    const control = this.form.controls.passwordConfirm;
    return (control.invalid || this.form.hasError('passwordsMismatch')) && (control.dirty || control.touched);
  }

  async submit(): Promise<void> {
    if (!this.token || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { password, passwordConfirm } = this.form.getRawValue();
    try {
      await this.auth.confirmPasswordReset(this.token, password, passwordConfirm);
      this.form.reset();
      this.completed.set(true);
    } catch {
      // AuthService exposes the translated error to the template.
    }
  }
}
