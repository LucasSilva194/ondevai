import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { LocalDataMigrationService } from '../../core/migration/local-data-migration.service';
import { PwaService } from '../../core/services/pwa.service';
import { AppStore } from '../../core/stores/app.store';
import { AppBackup, ImportPreview } from '../../models/domain.models';
import { formatDate } from '../../shared/utils/date.utils';

@Component({
  selector: 'app-data-management',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="page">
      <header class="page-header">
        <p class="eyebrow">Dados e privacidade</p>
        <h1>Os seus dados são seus</h1>
        <p class="page-intro">A informação financeira é guardada na sua conta cloud. Pode exportá-la, substituí-la ou apagá-la quando quiser.</p>
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

      <section class="legacy-section card-flat card-padding">
        <div>
          <h2>Dados locais legados</h2>
          @if (migration.summary()?.totalRecords) {
            <p>Encontrámos {{ migration.summary()?.totalRecords }} registos no IndexedDB antigo. Permanecem neste browser até existir uma ação separada para os remover.</p>
          } @else {
            <p>Não foram encontrados dados financeiros da versão local neste browser.</p>
          }
        </div>
        @if (migration.summary()?.totalRecords && migration.status() !== 'completed') {
          <a class="btn btn-secondary" routerLink="/migrar-dados">Migrar para a conta</a>
        }
      </section>

      <section class="data-section card card-padding">
        <div class="section-copy">
          <h2>Cópia de segurança JSON</h2>
          <p>O ficheiro inclui despesas, recorrências e exceções, orçamentos, rendimentos, objetivos, movimentos de poupança e preferências. Não inclui totais ou gráficos.</p>
          <p class="last-export"><strong>Última exportação:</strong> {{ lastExportLabel() }}</p>
        </div>
        <button class="btn btn-primary" type="button" (click)="exportData()" [disabled]="store.operationPending() || pwa.offline()">Exportar JSON</button>
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
          <div><h3>Backup portátil</h3><p>O JSON pode ser reimportado por substituição. Como não está encriptado, deve ser guardado em segurança.</p></div>
        </div>
      </section>

      <section class="secondary-actions card-flat card-padding">
        <div><h2>Rever a introdução</h2><p>Volte a consultar a explicação inicial sem alterar despesas ou categorias.</p></div>
        <button class="btn btn-secondary" type="button" (click)="repeatOnboarding()">Repetir onboarding</button>
      </section>

      <section class="secondary-actions card-flat card-padding">
        <div><h2>Eliminar a conta</h2><p>A eliminação da conta é uma operação separada, exige a sua palavra-passe e está disponível na página Conta.</p></div>
        <a class="btn btn-secondary" routerLink="/conta">Gerir conta</a>
      </section>

      <section class="danger-zone">
        <div><h2>Apagar dados financeiros cloud</h2><p>Remove despesas, categorias, rendimentos, poupanças e preferências da conta, mas mantém a sessão e não apaga dados antigos do IndexedDB.</p></div>
        <button class="btn btn-danger" type="button" (click)="deleteDialogOpen.set(true)">Apagar dados</button>
      </section>
    </div>

    @if (deleteDialogOpen()) {
      <div class="modal-backdrop">
        <section class="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <header class="modal-header"><div><h2 id="delete-title">Apagar os dados financeiros cloud?</h2><p>A conta e os dados locais legados permanecem.</p></div></header>
          <form [formGroup]="deleteForm" (ngSubmit)="deleteAll()">
            <div class="field"><label for="delete-confirmation">Escreva APAGAR DADOS para confirmar</label><input id="delete-confirmation" formControlName="confirmation" autocomplete="off"></div>
            <div class="button-row form-actions"><button class="btn btn-danger" type="submit" [disabled]="deleteForm.controls.confirmation.value !== 'APAGAR DADOS' || store.operationPending() || pwa.offline()">Apagar permanentemente</button><button class="btn btn-secondary" type="button" (click)="closeDeleteDialog()">Cancelar</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './data-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataManagementComponent implements OnInit {
  readonly store = inject(AppStore);
  readonly migration = inject(LocalDataMigrationService);
  readonly pwa = inject(PwaService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly preview = signal<ImportPreview | null>(null);
  readonly pendingBackup = signal<AppBackup | null>(null);
  readonly importErrors = signal<string[]>([]);
  readonly operationError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly deleteDialogOpen = signal(false);
  readonly importForm = this.formBuilder.nonNullable.group({ confirmation: ['', Validators.required] });
  readonly deleteForm = this.formBuilder.nonNullable.group({ confirmation: ['', Validators.required] });
  readonly formatDate = formatDate;

  ngOnInit(): void {
    void this.migration.detectLocalData().catch(() => undefined);
  }

  async exportData(): Promise<void> {
    this.successMessage.set(null);
    this.operationError.set(null);
    try {
      await this.store.exportBackup();
      this.successMessage.set('A cópia de segurança foi criada com sucesso.');
    } catch (error: unknown) { this.captureOperationError(error, 'Não foi possível exportar os dados.'); }
  }

  async selectFile(event: Event): Promise<void> {
    this.cancelImport();
    this.operationError.set(null);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      this.importErrors.set(['O ficheiro excede o limite de 20 MB.']);
      input.value = '';
      return;
    }
    try {
      const validation = this.store.parseBackup(await file.text());
      if (!validation.valid) this.importErrors.set(validation.errors);
      else {
        this.pendingBackup.set(validation.backup);
        this.preview.set(validation.preview);
      }
    } catch {
      this.importErrors.set(['Não foi possível ler o ficheiro selecionado.']);
    }
    input.value = '';
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

  async repeatOnboarding(): Promise<void> {
    try {
      await this.store.repeatOnboarding();
      await this.router.navigate(['/onboarding']);
    } catch (error: unknown) { this.captureOperationError(error, 'Não foi possível abrir o onboarding.'); }
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
