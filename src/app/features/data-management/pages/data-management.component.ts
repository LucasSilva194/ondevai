import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { UserSessionService } from '../../../core/auth/user-session.service';
import { LocalDataMigrationService } from '../../../core/migration/local-data-migration.service';
import { PwaService } from '../../../core/services/pwa.service';
import { AppStore } from '../../../core/stores/app.store';
import { AppBackup, ImportPreview } from '../../../models/domain.models';
import { formatDate } from '../../../shared/utils/date.utils';
import { ModalShellComponent } from '../../../shared/components/common/modal-shell.component';
import { AccountService } from '../../account/services/account.service';

@Component({
  selector: 'app-data-management',
  imports: [ReactiveFormsModule, RouterLink, ModalShellComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <p class="eyebrow">Dados e privacidade</p>
        <h1>Dados, privacidade e acesso</h1>
        <p class="page-intro">Gira a sua conta, a segurança e os dados financeiros num só lugar.</p>
      </header>

      @if (successMessage()) {
        <div class="success-message" role="status">{{ successMessage() }}</div>
      }
      @if (operationError()) {
        <div class="validation-errors" role="alert">{{ operationError() }}</div>
      }

      <section class="privacy-grid">
        <article class="local-card">
          <span class="local-symbol" aria-hidden="true">✓</span>
          <div><h2>Guardado na sua conta</h2><p>As despesas, categorias, rendimentos, poupanças e preferências são armazenadas no PocketBase e ficam disponíveis entre dispositivos.</p></div>
        </article>
        <article class="storage-card card-flat">
          <h2>Estado cloud</h2>
          <dl>
            <div><dt>Sincronização</dt><dd>{{ store.syncing() ? 'Em curso' : store.connectionError() ? 'Com erro' : 'Ligada' }}</dd></div>
            <div><dt>Última sincronização</dt><dd>{{ lastSyncLabel() }}</dd></div>
          </dl>
          @if (store.connectionError()) { <p class="sync-warning" role="alert">{{ store.connectionError() }}</p> }
        </article>
      </section>

      @if (accountError()) { <div class="validation-errors account-feedback" role="alert" aria-live="assertive">{{ accountError() }}</div> }
      @if (accountPending()) { <p class="account-pending" role="status" aria-live="polite" aria-busy="true"><span class="loading-indicator" aria-hidden="true"></span>A atualizar a conta…</p> }

      <section class="account-summary card card-padding" aria-labelledby="account-summary-title">
        <div><p class="section-label">Sessão atual</p><h2 id="account-summary-title">{{ auth.user()?.email }}</h2></div>
        <span class="verification-badge" [class.verified]="auth.user()?.verified">{{ auth.user()?.verified ? 'Email verificado' : 'Email por verificar' }}</span>
      </section>

      <div class="account-grid">
        <section class="card-flat card-padding" aria-labelledby="email-title">
          <h2 id="email-title">Alterar email</h2>
          <p>Enviaremos um link de confirmação para o novo endereço. A alteração só fica concluída depois de abrir esse link.</p>
          <form [formGroup]="emailForm" (ngSubmit)="submitEmailChange()" novalidate>
            <div class="field"><label for="new-email">Novo email</label><input id="new-email" type="email" formControlName="email" autocomplete="email" [attr.aria-invalid]="emailInvalid()">@if (emailInvalid()) { <small class="field-error">Indique um endereço de email válido.</small> }</div>
            <button class="btn btn-primary" type="submit" [disabled]="accountPending() || pwa.offline()">Pedir alteração</button>
          </form>
        </section>
        <section class="card-flat card-padding" aria-labelledby="password-title">
          <h2 id="password-title">Alterar palavra-passe</h2>
          <p>A palavra-passe atual confirma a sua identidade. Depois da alteração, esta sessão é renovada automaticamente.</p>
          <form [formGroup]="passwordForm" (ngSubmit)="submitPasswordChange()" novalidate>
            <div class="field"><label for="current-password">Palavra-passe atual</label><input id="current-password" type="password" formControlName="currentPassword" autocomplete="current-password"></div>
            <div class="field"><label for="new-password">Nova palavra-passe</label><input id="new-password" type="password" formControlName="password" autocomplete="new-password" aria-describedby="password-help"><small id="password-help">Use pelo menos 8 caracteres.</small></div>
            <div class="field"><label for="confirm-password">Confirmar nova palavra-passe</label><input id="confirm-password" type="password" formControlName="passwordConfirm" autocomplete="new-password" [attr.aria-invalid]="passwordsMismatch()">@if (passwordsMismatch()) { <small class="field-error">As novas palavras-passe não coincidem.</small> }</div>
            <button class="btn btn-primary" type="submit" [disabled]="accountPending() || pwa.offline()">Alterar palavra-passe</button>
          </form>
        </section>
      </div>

      <section class="secondary-actions card-flat card-padding account-session">
        <div><h2>Terminar sessão</h2><p>Os dados antigos que possam existir no IndexedDB deste browser não são apagados.</p></div>
        <button class="btn btn-secondary" type="button" (click)="logout()" [disabled]="accountPending()">Sair da conta</button>
      </section>

      <section class="legacy-section card-flat card-padding">
        <div>
          <h2>Dados locais legados</h2>
          @if (migration.summary()?.totalRecords) {
            <p>Encontrámos {{ migration.summary()?.totalRecords }} registos antigos neste browser. Depois de os migrar, pode apagá-los deste dispositivo.</p>
          } @else {
            <p>Não foram encontrados dados financeiros da versão local neste browser.</p>
          }
        </div>
        @if (migration.summary()?.totalRecords && migration.status() !== 'completed') {
          <a class="btn btn-secondary" routerLink="/migrar-dados">Migrar para a conta</a>
        }
        @if (migration.summary()?.totalRecords) {
          <button class="btn btn-danger" type="button" (click)="clearLegacyData()" [disabled]="accountPending()">Apagar dados locais antigos</button>
        }
      </section>

      <section class="data-section card card-padding">
        <div class="section-copy">
          <h2>Cópia de segurança JSON</h2>
          <p>O ficheiro inclui os dados financeiros cifrados com uma senha definida por si. Guarde essa senha: não é possível recuperá-la.</p>
          <p class="last-export"><strong>Última exportação:</strong> {{ lastExportLabel() }}</p>
        </div>
        <button class="btn btn-primary" type="button" (click)="openBackupExport()" [disabled]="store.operationPending() || pwa.offline()">Exportar JSON cifrado</button>
      </section>

      <section class="data-section card-flat card-padding import-section">
        <div class="section-copy">
          <h2>Importar uma cópia de segurança</h2>
          <p>A importação substitui atomicamente todos os dados financeiros desta conta. O ficheiro é migrado e validado antes do envio; o IndexedDB legado não é alterado.</p>
        </div>
        <label class="btn btn-secondary file-button">
          Selecionar JSON
          <input type="file" accept="application/json,.json" (change)="selectFile($event)">
        </label>
        @if (importErrors().length > 0) {
          <div class="validation-errors" role="alert"><strong>Não foi possível validar o ficheiro:</strong><ul>@for (error of importErrors(); track error) { <li>{{ error }}</li> }</ul></div>
        }
        @if (preview(); as data) {
          <div class="import-preview">
            <h3>Pré-visualização</h3>
            <dl>
              <div><dt>Despesas</dt><dd>{{ data.expenseCount }}</dd></div>
              <div><dt>Categorias</dt><dd>{{ data.categoryCount }}</dd></div>
              <div><dt>Rendimentos</dt><dd>{{ data.incomeCount }}</dd></div>
              <div><dt>Objetivos</dt><dd>{{ data.savingsGoalCount }}</dd></div>
              <div><dt>Movimentos de poupança</dt><dd>{{ data.savingsTransactionCount }}</dd></div>
              <div><dt>Orçamentos</dt><dd>{{ data.budgetCount }}</dd></div>
              <div><dt>Exceções de recorrência</dt><dd>{{ data.recurrenceExceptionCount }}</dd></div>
              <div><dt>Primeira data</dt><dd>{{ data.firstDate ? formatDate(data.firstDate) : 'Sem movimentos' }}</dd></div>
              <div><dt>Última data</dt><dd>{{ data.lastDate ? formatDate(data.lastDate) : 'Sem movimentos' }}</dd></div>
              <div><dt>Exportado em</dt><dd>{{ formatIsoDate(data.exportedAt) }}</dd></div>
            </dl>
            <div class="replace-warning"><strong>Os dados atuais serão substituídos.</strong><p>Esta ação não pode ser anulada sem outra cópia de segurança.</p></div>
            <form [formGroup]="importForm" (ngSubmit)="confirmImport()">
              <div class="field"><label for="replace-confirmation">Escreva SUBSTITUIR para confirmar</label><input id="replace-confirmation" formControlName="confirmation" autocomplete="off"></div>
              <div class="button-row"><button class="btn btn-danger" type="submit" [disabled]="store.operationPending() || pwa.offline() || importForm.controls.confirmation.value !== 'SUBSTITUIR'">Substituir dados da conta</button><button class="btn btn-ghost" type="button" (click)="cancelImport()">Cancelar</button></div>
            </form>
          </div>
        }
      </section>

      <section class="information-section">
        <h2>Como funciona a privacidade</h2>
        <div class="information-columns">
          <div><h3>Na sua conta</h3><p>É necessária autenticação. O servidor associa os registos à sua conta e a aplicação sincroniza alterações em tempo real.</p></div>
          <div><h3>Sem fila offline</h3><p>Dados já carregados podem ficar visíveis sem rede, mas não garantimos leitura atualizada nem guardamos novas alterações offline.</p></div>
          <div><h3>Backup portátil</h3><p>As cópias são cifradas com AES-GCM. A senha não é guardada nem pode ser recuperada.</p></div>
        </div>
      </section>

      <section class="secondary-actions card-flat card-padding">
        <div><h2>Guia da aplicação</h2><p>Volte a consultar como registar movimentos, definir objetivos e explorar os seus dados.</p></div>
        <a class="btn btn-secondary" routerLink="/guia">Abrir guia</a>
      </section>

      <section class="danger-zone">
        <div><h2>Apagar dados financeiros cloud</h2><p>Remove despesas, categorias, rendimentos, poupanças e preferências da conta, mas mantém a sessão e não apaga dados antigos do IndexedDB.</p></div>
        <button class="btn btn-danger" type="button" (click)="deleteDialogOpen.set(true)">Apagar dados</button>
      </section>

      <section class="danger-zone account-danger-zone" aria-labelledby="delete-account-title">
        <div><h2 id="delete-account-title">Eliminar conta</h2><p>Elimina permanentemente a conta e os dados financeiros guardados na cloud. Dados legados no IndexedDB deste browser não são apagados automaticamente.</p></div>
        <button class="btn btn-danger" type="button" (click)="accountDeleteDialogOpen.set(true)" [disabled]="accountPending() || pwa.offline()">Eliminar conta</button>
      </section>
    </div>

    @if (deleteDialogOpen()) {
      <app-modal-shell panelClass="modal delete-modal" labelledBy="delete-title" (closeRequest)="deleteDialogOpen.set(false)">
          <header class="modal-header"><div><h2 id="delete-title">Apagar os dados financeiros cloud?</h2><p>A conta e os dados locais legados permanecem.</p></div></header>
          <form [formGroup]="deleteForm" (ngSubmit)="deleteAll()">
            <div class="field"><label for="delete-confirmation">Escreva APAGAR DADOS para confirmar</label><input id="delete-confirmation" formControlName="confirmation" autocomplete="off"></div>
            <div class="button-row form-actions"><button class="btn btn-danger" type="submit" [disabled]="deleteForm.controls.confirmation.value !== 'APAGAR DADOS' || store.operationPending() || pwa.offline()">Apagar permanentemente</button><button class="btn btn-secondary" type="button" (click)="closeDeleteDialog()">Cancelar</button></div>
          </form>
      </app-modal-shell>
    }

    @if (accountDeleteDialogOpen()) {
      <app-modal-shell panelClass="modal delete-modal" labelledBy="account-delete-title" (closeRequest)="accountDeleteDialogOpen.set(false)">
        <header class="modal-header"><div><h2 id="account-delete-title">Eliminar definitivamente a conta?</h2><p>Esta ação não pode ser anulada. O IndexedDB legado permanece neste browser.</p></div></header>
        <form [formGroup]="accountDeleteForm" (ngSubmit)="deleteAccount()" novalidate>
          <div class="field"><label for="account-delete-password">Palavra-passe atual</label><input id="account-delete-password" type="password" formControlName="password" autocomplete="current-password"></div>
          <div class="field"><label for="account-delete-confirmation">Escreva APAGAR CONTA para confirmar</label><input id="account-delete-confirmation" formControlName="confirmation" autocomplete="off"></div>
          <div class="button-row form-actions"><button class="btn btn-danger" type="submit" [disabled]="accountPending() || pwa.offline() || !accountDeleteConfirmationValid()">Eliminar permanentemente</button><button class="btn btn-secondary" type="button" (click)="closeAccountDeleteDialog()" [disabled]="accountPending()">Cancelar</button></div>
        </form>
      </app-modal-shell>
    }

    @if (backupPasswordDialogOpen()) {
      <app-modal-shell panelClass="modal delete-modal" labelledBy="backup-password-title" (closeRequest)="closeBackupPasswordDialog()">
        <header class="modal-header"><div><h2 id="backup-password-title">{{ backupPasswordPurpose() === 'export' ? 'Cifrar cópia de segurança' : 'Abrir cópia de segurança' }}</h2><p>{{ backupPasswordPurpose() === 'export' ? 'Use uma senha forte com pelo menos 12 caracteres. Sem ela, não poderá recuperar o ficheiro.' : 'A senha é usada apenas para decifrar o ficheiro neste dispositivo.' }}</p></div></header>
        <form [formGroup]="backupPasswordForm" (ngSubmit)="submitBackupPassword()" novalidate>
          <div class="field"><label for="backup-password">Senha da cópia</label><input id="backup-password" type="password" formControlName="password" [attr.autocomplete]="backupPasswordPurpose() === 'export' ? 'new-password' : 'current-password'" maxlength="1024">
            @if (backupPasswordForm.controls.password.touched && backupPasswordForm.controls.password.value.length < 12) { <small class="field-error">Use pelo menos 12 caracteres.</small> }
          </div>
          @if (backupPasswordPurpose() === 'export') {
            <div class="field"><label for="backup-password-confirm">Confirmar senha</label><input id="backup-password-confirm" type="password" formControlName="passwordConfirm" autocomplete="new-password" maxlength="1024">
              @if (backupPasswordForm.controls.passwordConfirm.touched && backupPasswordForm.controls.password.value !== backupPasswordForm.controls.passwordConfirm.value) { <small class="field-error">As senhas não coincidem.</small> }
            </div>
          }
          <div class="button-row form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="backupPending() || backupPasswordForm.invalid">{{ backupPasswordPurpose() === 'export' ? 'Exportar cifrado' : 'Abrir ficheiro' }}</button>
            <button class="btn btn-secondary" type="button" (click)="closeBackupPasswordDialog()" [disabled]="backupPending()">Cancelar</button>
          </div>
        </form>
      </app-modal-shell>
    }
  `,
  styleUrl: './data-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataManagementComponent implements OnInit {
  readonly store = inject(AppStore);
  readonly auth = inject(AuthService);
  readonly migration = inject(LocalDataMigrationService);
  readonly pwa = inject(PwaService);
  private readonly session = inject(UserSessionService);
  private readonly account = inject(AccountService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly preview = signal<ImportPreview | null>(null);
  readonly pendingBackup = signal<AppBackup | null>(null);
  readonly importErrors = signal<string[]>([]);
  readonly operationError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly deleteDialogOpen = signal(false);
  readonly accountDeleteDialogOpen = signal(false);
  readonly accountPending = signal(false);
  readonly backupPasswordDialogOpen = signal(false);
  readonly backupPasswordPurpose = signal<'export' | 'import'>('export');
  readonly backupPending = signal(false);
  private readonly pendingEncryptedContents = signal<string | null>(null);
  readonly accountError = signal<string | null>(null);
  readonly emailForm = this.formBuilder.nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  readonly passwordForm = this.formBuilder.nonNullable.group({ currentPassword: ['', Validators.required], password: ['', [Validators.required, Validators.minLength(8)]], passwordConfirm: ['', Validators.required] });
  readonly accountDeleteForm = this.formBuilder.nonNullable.group({ password: ['', Validators.required], confirmation: ['', Validators.required] });
  readonly importForm = this.formBuilder.nonNullable.group({ confirmation: ['', Validators.required] });
  readonly backupPasswordForm = this.formBuilder.nonNullable.group({
    password: ['', [Validators.required, Validators.maxLength(1024)]],
    passwordConfirm: ['', Validators.maxLength(1024)],
  });
  readonly deleteForm = this.formBuilder.nonNullable.group({ confirmation: ['', Validators.required] });
  readonly formatDate = formatDate;

  ngOnInit(): void {
    void this.migration.detectLocalData().catch(() => undefined);
  }

  emailInvalid(): boolean {
    const control = this.emailForm.controls.email;
    return control.invalid && (control.dirty || control.touched);
  }

  passwordsMismatch(): boolean {
    const { password, passwordConfirm } = this.passwordForm.getRawValue();
    return this.passwordForm.controls.passwordConfirm.touched && password !== passwordConfirm;
  }

  accountDeleteConfirmationValid(): boolean {
    const value = this.accountDeleteForm.getRawValue();
    return value.password.trim().length > 0 && value.confirmation === 'APAGAR CONTA';
  }

  async submitEmailChange(): Promise<void> {
    if (this.emailForm.invalid || this.accountPending() || this.pwa.offline()) { this.emailForm.markAllAsTouched(); return; }
    await this.runAccountAction(async () => {
      await this.auth.requestEmailChange(this.emailForm.controls.email.value);
      this.emailForm.reset({ email: '' });
      this.successMessage.set('Pedido enviado. Confirme a alteração através do link recebido no novo email.');
    });
  }

  async submitPasswordChange(): Promise<void> {
    const values = this.passwordForm.getRawValue();
    if (this.passwordForm.invalid || values.password !== values.passwordConfirm || this.accountPending() || this.pwa.offline()) { this.passwordForm.markAllAsTouched(); return; }
    await this.runAccountAction(async () => {
      await this.auth.changePassword(values.currentPassword, values.password, values.passwordConfirm);
      this.passwordForm.reset({ currentPassword: '', password: '', passwordConfirm: '' });
      await this.session.logout(true);
    });
  }

  async logout(): Promise<void> {
    if (this.accountPending()) return;
    await this.runAccountAction(() => this.session.logout());
  }

  async clearLegacyData(): Promise<void> {
    if (!window.confirm('Apagar permanentemente todos os dados locais antigos deste browser?')) return;
    try {
      await this.migration.clearLocalData();
      this.successMessage.set('Os dados locais antigos foram apagados deste dispositivo.');
    } catch {
      this.operationError.set('Não foi possível apagar os dados locais antigos.');
    }
  }

  closeAccountDeleteDialog(): void {
    if (this.accountPending()) return;
    this.accountDeleteDialogOpen.set(false);
    this.accountDeleteForm.reset({ password: '', confirmation: '' });
  }

  async deleteAccount(): Promise<void> {
    if (!this.accountDeleteConfirmationValid() || this.accountPending() || this.pwa.offline()) { this.accountDeleteForm.markAllAsTouched(); return; }
    const values = this.accountDeleteForm.getRawValue();
    await this.runAccountAction(async () => {
      await this.account.deleteAccount(values.password, values.confirmation);
      await this.session.logout();
    });
  }

  private async runAccountAction(action: () => Promise<void>): Promise<void> {
    this.accountPending.set(true);
    this.accountError.set(null);
    this.operationError.set(null);
    this.successMessage.set(null);
    try { await action(); }
    catch (error: unknown) { this.accountError.set(error instanceof Error ? error.message : 'Não foi possível concluir a operação.'); }
    finally { this.accountPending.set(false); }
  }

  openBackupExport(): void {
    this.successMessage.set(null);
    this.operationError.set(null);
    this.backupPasswordPurpose.set('export');
    this.pendingEncryptedContents.set(null);
    this.backupPasswordForm.reset({ password: '', passwordConfirm: '' });
    this.backupPasswordDialogOpen.set(true);
  }

  async submitBackupPassword(): Promise<void> {
    const { password, passwordConfirm } = this.backupPasswordForm.getRawValue();
    if (this.backupPending() || password.length < 12) {
      this.backupPasswordForm.controls.password.markAsTouched();
      return;
    }
    if (this.backupPasswordPurpose() === 'export' && password !== passwordConfirm) {
      this.backupPasswordForm.controls.passwordConfirm.markAsTouched();
      return;
    }
    this.backupPending.set(true);
    this.operationError.set(null);
    try {
      if (this.backupPasswordPurpose() === 'export') {
        await this.store.exportBackup(password);
        this.backupPasswordDialogOpen.set(false);
        this.successMessage.set('A cópia de segurança cifrada foi criada com sucesso.');
      } else {
        const contents = this.pendingEncryptedContents();
        if (!contents) return;
        await this.previewBackup(contents, password);
        this.backupPasswordDialogOpen.set(false);
      }
    } catch (error: unknown) { this.captureOperationError(error, 'Não foi possível exportar os dados.'); }
    finally {
      this.backupPending.set(false);
      this.backupPasswordForm.reset({ password: '', passwordConfirm: '' });
      this.pendingEncryptedContents.set(null);
    }
  }

  closeBackupPasswordDialog(): void {
    if (this.backupPending()) return;
    this.backupPasswordDialogOpen.set(false);
    this.pendingEncryptedContents.set(null);
    this.backupPasswordForm.reset({ password: '', passwordConfirm: '' });
  }

  async selectFile(event: Event): Promise<void> {
    this.cancelImport();
    this.operationError.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 29 * 1024 * 1024) {
      this.importErrors.set(['O ficheiro excede o limite de 29 MB.']);
      input.value = '';
      return;
    }
    try {
      const contents = await file.text();
      if (this.store.isEncryptedBackup(contents)) {
        this.pendingEncryptedContents.set(contents);
        this.backupPasswordPurpose.set('import');
        this.backupPasswordForm.reset({ password: '', passwordConfirm: '' });
        this.backupPasswordDialogOpen.set(true);
      } else {
        await this.previewBackup(contents);
      }
    } catch {
      this.importErrors.set(['Não foi possível ler o ficheiro selecionado.']);
    }
    input.value = '';
  }

  private async previewBackup(contents: string, passphrase?: string): Promise<void> {
    const validation = await this.store.parseBackup(contents, passphrase);
    if (!validation.valid) this.importErrors.set(validation.errors);
    else {
      this.pendingBackup.set(validation.backup);
      this.preview.set(validation.preview);
    }
  }

  async confirmImport(): Promise<void> {
    const backup = this.pendingBackup();
    if (!backup || this.importForm.controls.confirmation.value !== 'SUBSTITUIR' || this.pwa.offline()) return;
    this.operationError.set(null);
    this.successMessage.set(null);
    try {
      await this.store.importBackup(backup);
      this.cancelImport();
      this.successMessage.set('Os dados da conta foram substituídos com sucesso.');
    } catch (error: unknown) { this.captureOperationError(error, 'Não foi possível importar o ficheiro. Os dados anteriores foram preservados.'); }
  }

  cancelImport(): void {
    this.preview.set(null);
    this.pendingBackup.set(null);
    this.importErrors.set([]);
    this.importForm.reset({ confirmation: '' });
  }

  closeDeleteDialog(): void {
    this.deleteDialogOpen.set(false);
    this.deleteForm.reset({ confirmation: '' });
  }

  async deleteAll(): Promise<void> {
    if (this.deleteForm.controls.confirmation.value !== 'APAGAR DADOS' || this.pwa.offline()) return;
    this.operationError.set(null);
    this.successMessage.set(null);
    try {
      await this.store.clearAll();
      this.closeDeleteDialog();
      await this.router.navigate(['/onboarding']);
    } catch (error: unknown) { this.captureOperationError(error, 'Não foi possível apagar os dados. Nenhuma alteração parcial foi aplicada.'); }
  }

  lastExportLabel(): string {
    const value = this.store.settings().lastExportAt;
    return value ? this.formatIsoDate(value) : 'Nunca foi criada uma cópia de segurança';
  }

  formatIsoDate(value: string): string {
    return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  lastSyncLabel(): string {
    const value = this.store.lastSyncedAt();
    return value ? this.formatIsoDate(value) : 'Ainda não disponível';
  }

  private captureOperationError(error: unknown, fallback: string): void {
    this.operationError.set(error instanceof Error ? error.message : fallback);
  }
}
