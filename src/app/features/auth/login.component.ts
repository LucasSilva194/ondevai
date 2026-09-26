import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { UserSessionService } from '../../core/auth/user-session.service';
import { AuthPageComponent } from './auth-page.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [AuthPageComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-page>
      <p class="eyebrow">Bem-vindo de volta</p>
      <h1>Entrar no OndeVai</h1>
      <p class="intro">Aceda aos seus dados financeiros com o seu email e palavra-passe.</p>

      <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <fieldset [disabled]="auth.loading()">
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

          <button class="btn btn-primary" type="submit" [disabled]="auth.loading()">
            {{ auth.loading() ? 'A entrar...' : 'Entrar' }}
          </button>
        </fieldset>
      </form>

      @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
      @if (session.error()) { <p class="form-message error" role="alert">{{ session.error() }}</p> }
      @if (auth.loading()) { <p class="helper" role="status">A validar os seus dados.</p> }

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
  private readonly formBuilder = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  showEmailError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  showPasswordError(): boolean {
    const control = this.form.controls.password;
    return control.invalid && (control.dirty || control.touched);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { email, password } = this.form.getRawValue();
    try {
      const destination = await this.session.login(email, password);
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
    }
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    return returnUrl?.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/visao-geral';
  }
}
