import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { UserSessionService } from '../../core/auth/user-session.service';
import { PwaService } from '../../core/services/pwa.service';
import { AccountService } from './account.service';

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="page account-page">
      <header class="page-header">
        <p class="eyebrow">Conta</p>
        <h1>Segurança e acesso</h1>
        <p class="page-intro">Consulte a identidade ligada aos seus dados e mantenha as credenciais atualizadas.</p>
      </header>

      @if (successMessage()) {
        <div class="feedback success" role="status" aria-live="polite">{{ successMessage() }}</div>
      }
      @if (errorMessage()) {
        <div class="feedback error" role="alert" aria-live="assertive">{{ errorMessage() }}</div>
      }
      @if (pwa.offline()) {
        <div class="feedback warning" role="status">Estas operações precisam de ligação ao servidor.</div>
      }

      <section class="account-summary card card-padding" aria-labelledby="account-summary-title">
        <div>
          <p class="section-label">Sessão atual</p>
          <h2 id="account-summary-title">{{ auth.user()?.email }}</h2>
        </div>
        <span class="verification-badge" [class.verified]="auth.user()?.verified">
          {{ auth.user()?.verified ? 'Email verificado' : 'Email por verificar' }}
        </span>
      </section>

      <div class="account-grid">
        <section class="card-flat card-padding" aria-labelledby="email-title">
          <h2 id="email-title">Alterar email</h2>
          <p>Enviaremos um link de confirmação para o novo endereço. A alteração só fica concluída depois de abrir esse link.</p>
          <form [formGroup]="emailForm" (ngSubmit)="submitEmailChange()" novalidate>
            <div class="field">
              <label for="new-email">Novo email</label>
              <input id="new-email" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="emailInvalid()">
              @if (emailInvalid()) { <small class="field-error">Indique um endereço de email válido.</small> }
            </div>
            <button class="btn btn-primary" type="submit" [disabled]="pending() || pwa.offline()">Pedir alteração</button>
          </form>
        </section>

        <section class="card-flat card-padding" aria-labelledby="password-title">
          <h2 id="password-title">Alterar palavra-passe</h2>
          <p>A palavra-passe atual confirma a sua identidade. Depois da alteração, esta sessão é renovada automaticamente.</p>
          <form [formGroup]="passwordForm" (ngSubmit)="submitPasswordChange()" novalidate>
            <div class="field">
              <label for="current-password">Palavra-passe atual</label>
              <input id="current-password" type="password" formControlName="currentPassword" autocomplete="current-password">
            </div>
            <div class="field">
              <label for="new-password">Nova palavra-passe</label>
              <input id="new-password" type="password" formControlName="password" autocomplete="new-password" aria-describedby="password-help">
              <small id="password-help">Use pelo menos 8 caracteres.</small>
            </div>
            <div class="field">
              <label for="confirm-password">Confirmar nova palavra-passe</label>
              <input id="confirm-password" type="password" formControlName="passwordConfirm" autocomplete="new-password" [attr.aria-invalid]="passwordsMismatch()">
              @if (passwordsMismatch()) { <small class="field-error">As novas palavras-passe não coincidem.</small> }
            </div>
            <button class="btn btn-primary" type="submit" [disabled]="pending() || pwa.offline()">Alterar palavra-passe</button>
          </form>
        </section>
      </div>

      <section class="session-section card-flat card-padding">
        <div><h2>Terminar sessão</h2><p>Os dados antigos que possam existir no IndexedDB deste browser não são apagados.</p></div>
        <button class="btn btn-secondary" type="button" (click)="logout()" [disabled]="pending()">Sair da conta</button>
      </section>

      <section class="danger-zone" aria-labelledby="delete-account-title">
        <div>
          <h2 id="delete-account-title">Eliminar conta</h2>
          <p>Elimina permanentemente a conta e os dados financeiros guardados na cloud. Dados legados no IndexedDB deste browser não são apagados automaticamente.</p>
        </div>
        <button class="btn btn-danger" type="button" (click)="deleteDialogOpen.set(true)" [disabled]="pending() || pwa.offline()">Eliminar conta</button>
      </section>
    </div>

    @if (deleteDialogOpen()) {
      <div class="modal-backdrop">
        <section class="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title">
          <header class="modal-header">
            <div>
              <h2 id="delete-dialog-title">Eliminar definitivamente a conta?</h2>
              <p>Esta ação não pode ser anulada. O IndexedDB legado permanece neste browser.</p>
            </div>
          </header>
          <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()" novalidate>
            <div class="field">
              <label for="delete-password">Palavra-passe atual</label>
              <input id="delete-password" type="password" formControlName="password" autocomplete="current-password">
            </div>
            <div class="field">
              <label for="delete-confirmation">Escreva APAGAR CONTA para confirmar</label>
              <input id="delete-confirmation" formControlName="confirmation" autocomplete="off">
            </div>
            <div class="button-row form-actions">
              <button class="btn btn-danger" type="submit" [disabled]="pending() || pwa.offline() || !deleteConfirmationValid()">Eliminar permanentemente</button>
              <button class="btn btn-secondary" type="button" (click)="closeDeleteDialog()" [disabled]="pending()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './account.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountComponent {
  readonly auth = inject(AuthService);
  readonly pwa = inject(PwaService);
  private readonly session = inject(UserSessionService);
  private readonly account = inject(AccountService);
  private readonly formBuilder = inject(FormBuilder);

  readonly pending = signal(false);
  readonly successMessage = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly deleteDialogOpen = signal(false);

  readonly emailForm = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
  });
  readonly passwordForm = this.formBuilder.nonNullable.group({
    currentPassword: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8)]],
    passwordConfirm: ['', Validators.required],
  });
  readonly deleteForm = this.formBuilder.nonNullable.group({
    password: ['', Validators.required],
    confirmation: ['', Validators.required],
  });

  emailInvalid(): boolean {
    const control = this.emailForm.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  passwordsMismatch(): boolean {
    const { password, passwordConfirm } = this.passwordForm.getRawValue();
    return this.passwordForm.controls.passwordConfirm.touched && password !== passwordConfirm;
  }

  deleteConfirmationValid(): boolean {
    const value = this.deleteForm.getRawValue();
    return value.password.trim().length > 0 && value.confirmation === 'APAGAR CONTA';
  }

  async submitEmailChange(): Promise<void> {
    if (this.emailForm.invalid || this.pending() || this.pwa.offline()) {
      this.emailForm.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      await this.auth.requestEmailChange(this.emailForm.controls.email.value);
      this.emailForm.reset({ email: '' });
      this.successMessage.set('Pedido enviado. Confirme a alteração através do link recebido no novo email.');
    });
  }

  async submitPasswordChange(): Promise<void> {
    const values = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid || values.password !== values.passwordConfirm || this.pending() || this.pwa.offline()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    await this.run(async () => {
      await this.auth.changePassword(values.currentPassword, values.password, values.passwordConfirm);
      this.passwordForm.reset({ currentPassword: '', password: '', passwordConfirm: '' });
      this.successMessage.set('Palavra-passe alterada. A sessão foi renovada com segurança.');
    });
  }

  async logout(): Promise<void> {
    if (this.pending()) return;
    await this.run(() => this.session.logout());
  }

  closeDeleteDialog(): void {
    if (this.pending()) return;
    this.deleteDialogOpen.set(false);
    this.deleteForm.reset({ password: '', confirmation: '' });
  }

  async deleteAccount(): Promise<void> {
    if (!this.deleteConfirmationValid() || this.pending() || this.pwa.offline()) {
      this.deleteForm.markAllAsTouched();
      return;
    }
    const values = this.deleteForm.getRawValue();
    await this.run(async () => {
      await this.account.deleteAccount(values.password, values.confirmation);
      await this.session.logout();
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.pending.set(true);
    this.successMessage.set(null);
    this.errorMessage.set(null);
    try {
      await action();
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
    } finally {
      this.pending.set(false);
    }
  }
}
