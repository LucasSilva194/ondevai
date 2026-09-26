import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthPageComponent } from './auth-page.component';

@Component({
  selector: 'app-password-recovery',
  standalone: true,
  imports: [AuthPageComponent, ReactiveFormsModule, RouterLink],
  template: `
    <app-auth-page>
      <p class="eyebrow">Recuperar acesso</p>
      <h1>Redefinir a palavra-passe</h1>
      <p class="intro">Indique o email associado à conta. Enviaremos as instruções quando for possível.</p>

      @if (!submitted()) {
        <form class="auth-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <fieldset [disabled]="auth.loading()">
            <div class="field">
              <label for="recovery-email">Email</label>
              <input id="recovery-email" type="email" formControlName="email" autocomplete="email" inputmode="email"
                [attr.aria-invalid]="showEmailError()" [attr.aria-describedby]="showEmailError() ? 'recovery-email-error' : null">
              @if (showEmailError()) { <p id="recovery-email-error" class="field-error">Introduza um email válido.</p> }
            </div>
            <button class="btn btn-primary" type="submit" [disabled]="auth.loading()">
              {{ auth.loading() ? 'A enviar...' : 'Enviar instruções' }}
            </button>
          </fieldset>
        </form>
      } @else {
        <p class="form-message success" role="status">Se existir uma conta associada a esse email, receberá uma mensagem com os próximos passos.</p>
      }

      @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
      @if (auth.loading()) { <p class="helper" role="status">A processar o pedido.</p> }
      <nav class="auth-links single" aria-label="Outras opções de autenticação"><a routerLink="/entrar">Voltar ao início de sessão</a></nav>
    </app-auth-page>
  `,
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PasswordRecoveryComponent {
  readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);
  readonly submitted = signal(false);
  readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });

  showEmailError(): boolean {
    const control = this.form.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    try {
      await this.auth.requestPasswordReset(this.form.controls.email.value);
      this.submitted.set(true);
    } catch {
      // AuthService exposes network and service errors without revealing account existence.
    }
  }
}
