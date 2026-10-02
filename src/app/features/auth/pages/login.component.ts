import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { UserSessionService } from '../../../core/auth/user-session.service';
import { AuthPageComponent } from '../components/auth-page.component';
import { AppStore } from '../../../core/stores/app.store';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AuthPageComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-page>
      <p class="eyebrow">Bem-vindo de volta</p>
      <h1>Entrar no OndeVai</h1>
      <p class="intro">Aceda aos seus dados financeiros com o seu email e palavra-passe.</p>
      @if (passwordChanged()) { <p class="form-message success" role="status">A palavra-passe foi alterada. Inicie sessão novamente.</p> }

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset [disabled]="auth.loading() || submitting()">
          @if (!mfaPending()) {
          <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" type="email" formControlName="email" autocomplete="username" inputmode="email"
              [attr.aria-invalid]="showEmailError()" [attr.aria-describedby]="showEmailError() ? 'login-email-error' : null">
            @if (showEmailError()) { <p id="login-email-error" class="field-error">Introduza um email válido.</p> }
          </div>

          <div class="field">
            <label for="login-password">Palavra-passe</label>
            <input id="login-password" type="password" formControlName="password" autocomplete="current-password"
              [attr.aria-invalid]="showPasswordError()" [attr.aria-describedby]="showPasswordError() ? 'login-password-error' : null">
            @if (showPasswordError()) { <p id="login-password-error" class="field-error">Introduza a sua palavra-passe.</p> }
          </div>

          <button class="btn btn-primary" type="submit" [disabled]="auth.loading() || submitting()">
            {{ auth.loading() || submitting() ? 'A entrar...' : 'Entrar' }}
          </button>
          } @else {
            <p class="intro">Enviámos um código de segurança para o email da conta. Introduza o código para concluir a autenticação.</p>
            <div class="field">
              <label for="login-mfa-code">Código de segurança</label>
              <input id="login-mfa-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"
                formControlName="mfaCode" aria-describedby="login-mfa-help">
              <small id="login-mfa-help">O código tem 6 dígitos.</small>
            </div>
            <button class="btn btn-primary" type="submit" [disabled]="auth.loading() || submitting() || form.controls.mfaCode.invalid">
              {{ auth.loading() || submitting() ? 'A validar...' : 'Confirmar código' }}
            </button>
            <button class="btn btn-secondary" type="button" (click)="cancelMfa()" [disabled]="auth.loading() || submitting()">Voltar</button>
          }
        </fieldset>
      </form>

      @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
      @if (session.error()) { <p class="form-message error" role="alert">{{ session.error() }}</p> }
      @if (auth.loading() || submitting()) {
        <p class="auth-pending" role="status" aria-live="polite" [attr.aria-busy]="true">
          <span class="loading-indicator" aria-hidden="true"></span>
          {{ store.loading() ? 'A carregar os seus dados financeiros…' : 'A validar os seus dados…' }}
        </p>
      }

      <nav class="auth-links" aria-label="Outras opções de autenticação">
        <a routerLink="/recuperar-password">Esqueci-me da palavra-passe</a>
        <a routerLink="/registar">Criar conta</a>
      </nav>
    </app-auth-page>
  `,
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly session = inject(UserSessionService);
  readonly store = inject(AppStore);
  readonly submitting = signal(false);
  readonly mfaPending = this.auth.mfaRequired;
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
    mfaCode: ['', [Validators.pattern(/^\d{6}$/)]],
  });

  showEmailError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  passwordChanged(): boolean {
    return this.route.snapshot.queryParamMap.get('passwordChanged') === '1';
  }

  showPasswordError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  async submit(): Promise<void> {
    if (this.submitting()) return;
    if (this.mfaPending()) {
      if (this.form.controls.mfaCode.invalid) {
        this.form.controls.mfaCode.markAsTouched();
        return;
      }
    } else if (this.form.controls.email.invalid || this.form.controls.password.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      const destination = this.mfaPending()
        ? await this.session.completeMfaLogin(this.form.controls.mfaCode.value)
        : await this.session.login(this.form.controls.email.value, this.form.controls.password.value);
      if (destination === 'mfa-required') {
        this.form.controls.password.reset('');
        return;
      }
      if (destination === 'verification-required') {
        await this.router.navigate(['/confirmar-email']);
        return;
      }
      if (destination === 'migration') {
        await this.router.navigate(['/migrar-dados']);
        return;
      }
      await this.router.navigateByUrl(this.safeReturnUrl());
    } catch {
      // AuthService/UserSessionService expose the translated error to the template.
    } finally {
      this.submitting.set(false);
    }
  }

  cancelMfa(): void {
    this.auth.cancelMfaLogin();
    this.form.controls.mfaCode.reset('');
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/visao-geral';
  }
}
