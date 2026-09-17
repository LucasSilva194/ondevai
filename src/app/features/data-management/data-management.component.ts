import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AppStore } from '../../core/stores/app.store';
import { StorageService } from '../../core/settings/storage.service';
import { AppBackup, ImportPreview, StorageStatus } from '../../models/domain.models';
import { formatDate } from '../../shared/utils/date.utils';

@Component({
  selector: 'app-data-management',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <header class="page-header">
        <p class="eyebrow">Dados e privacidade</p>
        <h1>Os seus dados são seus</h1>
        <p class="page-intro">O OndeVai funciona sem backend. Toda a informação financeira fica no IndexedDB deste browser.</p>
      </header>

      @if (successMessage()) {
        <div class="success-message" role="status">{{ successMessage() }}</div>
      }

      <section class="privacy-grid">
        <article class="local-card">
          <span class="local-symbol" aria-hidden="true">✓</span>
          <div><h2>Guardado localmente</h2><p>As despesas, categorias, rendimentos, poupanças e preferências nunca são enviadas para servidores.</p></div>
        </article>
        <article class="storage-card card-flat">
          <h2>Estado do armazenamento</h2>
          @if (storageStatus(); as status) {
            <dl>
              <div><dt>IndexedDB</dt><dd>Disponível</dd></div>
              <div><dt>Armazenamento persistente</dt><dd>{{ persistenceLabel(status) }}</dd></div>
              @if (status.usageBytes !== undefined) { <div><dt>Espaço utilizado</dt><dd>{{ formatBytes(status.usageBytes) }}</dd></div> }
            </dl>
          } @else {
            <p class="muted">A verificar o armazenamento do browser...</p>
          }
        </article>
      </section>

      <section class="data-section card card-padding">
        <div class="section-copy">
          <h2>Cópia de segurança JSON</h2>
          <p>O ficheiro inclui despesas, categorias, rendimentos, objetivos de poupança e preferências. Não inclui totais ou gráficos.</p>
          <p class="last-export"><strong>Última exportação:</strong> {{ lastExportLabel() }}</p>
        </div>
        <button class="btn btn-primary" type="button" (click)="exportData()" [disabled]="store.operationPending()">Exportar JSON</button>
      </section>

      <section class="data-section card-flat card-padding import-section">
        <div class="section-copy">
          <h2>Importar uma cópia de segurança</h2>
          <p>A importação substitui todos os dados locais. O ficheiro é validado antes de qualquer alteração.</p>
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
              <div><dt>Primeira data</dt><dd>{{ data.firstDate ? formatDate(data.firstDate) : 'Sem despesas' }}</dd></div>
              <div><dt>Última data</dt><dd>{{ data.lastDate ? formatDate(data.lastDate) : 'Sem despesas' }}</dd></div>
              <div><dt>Exportado em</dt><dd>{{ formatIsoDate(data.exportedAt) }}</dd></div>
            </dl>
            <div class="replace-warning"><strong>Os dados atuais serão substituídos.</strong><p>Esta ação não pode ser anulada sem outra cópia de segurança.</p></div>
            <div class="button-row"><button class="btn btn-danger" type="button" (click)="confirmImport()" [disabled]="store.operationPending()">Substituir dados locais</button><button class="btn btn-ghost" type="button" (click)="cancelImport()">Cancelar</button></div>
          </div>
        }
      </section>

      <section class="information-section">
        <h2>Como funciona a privacidade</h2>
        <div class="information-columns">
          <div><h3>Neste dispositivo</h3><p>O IndexedDB pertence a este browser e perfil. Atualizar ou fechar a aplicação não apaga os registos.</p></div>
          <div><h3>Sem rede de dados</h3><p>Não existe autenticação, sincronização, integração bancária, analytics ou telemetria.</p></div>
          <div><h3>Backup portátil</h3><p>O JSON pode ser importado noutro browser. Como não está encriptado, deve ser guardado em segurança.</p></div>
        </div>
      </section>

      <section class="secondary-actions card-flat card-padding">
        <div><h2>Rever a introdução</h2><p>Volte a consultar a explicação inicial sem alterar despesas ou categorias.</p></div>
        <button class="btn btn-secondary" type="button" (click)="repeatOnboarding()">Repetir onboarding</button>
      </section>

      <section class="danger-zone">
        <div><h2>Apagar todos os dados locais</h2><p>Remove despesas, categorias, rendimentos, poupanças e preferências deste browser. Exporte primeiro se quiser conservar uma cópia.</p></div>
        <button class="btn btn-danger" type="button" (click)="deleteDialogOpen.set(true)">Apagar dados</button>
      </section>
    </div>

    @if (deleteDialogOpen()) {
      <div class="modal-backdrop">
        <section class="modal delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <header class="modal-header"><div><h2 id="delete-title">Apagar tudo neste dispositivo?</h2><p>Esta ação remove permanentemente todos os dados locais.</p></div></header>
          <form [formGroup]="deleteForm" (ngSubmit)="deleteAll()">
            <div class="field"><label for="delete-confirmation">Escreva APAGAR para confirmar</label><input id="delete-confirmation" formControlName="confirmation" autocomplete="off"></div>
            <div class="button-row form-actions"><button class="btn btn-danger" type="submit" [disabled]="deleteForm.controls.confirmation.value !== 'APAGAR' || store.operationPending()">Apagar permanentemente</button><button class="btn btn-secondary" type="button" (click)="closeDeleteDialog()">Cancelar</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './data-management.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DataManagementComponent {
  readonly store = inject(AppStore);
  private readonly storage = inject(StorageService);
  private readonly router = inject(Router);
  private readonly formBuilder = inject(FormBuilder);
  readonly storageStatus = signal<StorageStatus | null>(null);
  readonly preview = signal<ImportPreview | null>(null);
  readonly pendingBackup = signal<AppBackup | null>(null);
  readonly importErrors = signal<string[]>([]);
  readonly successMessage = signal<string | null>(null);
  readonly deleteDialogOpen = signal(false);
  readonly deleteForm = this.formBuilder.nonNullable.group({ confirmation: ['', Validators.required] });
  readonly formatDate = formatDate;

  constructor() {
    void this.loadStorageStatus();
  }

  async exportData(): Promise<void> {
    this.successMessage.set(null);
    try {
      await this.store.exportBackup();
      this.successMessage.set('A cópia de segurança foi criada com sucesso.');
    } catch { /* Global error is visible. */ }
  }

  async selectFile(event: Event): Promise<void> {
    this.cancelImport();
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
    if (!backup) return;
    try {
      await this.store.importBackup(backup);
      this.cancelImport();
      this.successMessage.set('Os dados foram restaurados com sucesso.');
    } catch { /* Global error is visible. */ }
  }

  cancelImport(): void {
    this.preview.set(null);
    this.pendingBackup.set(null);
    this.importErrors.set([]);
  }

  async repeatOnboarding(): Promise<void> {
    try {
      await this.store.repeatOnboarding();
      await this.router.navigate(['/onboarding']);
    } catch { /* Global error is visible. */ }
  }

  closeDeleteDialog(): void {
    this.deleteDialogOpen.set(false);
    this.deleteForm.reset({ confirmation: '' });
  }

  async deleteAll(): Promise<void> {
    if (this.deleteForm.controls.confirmation.value !== 'APAGAR') return;
    try {
      await this.store.clearAll();
      this.closeDeleteDialog();
      await this.router.navigate(['/onboarding']);
    } catch { /* Global error is visible. */ }
  }

  lastExportLabel(): string {
    const value = this.store.settings().lastExportAt;
    return value ? this.formatIsoDate(value) : 'Nunca foi criada uma cópia de segurança';
  }

  formatIsoDate(value: string): string {
    return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  persistenceLabel(status: StorageStatus): string {
    if (!status.supported) return 'Não suportado pelo browser';
    if (status.persisted === true) return 'Protegido contra limpeza automática';
    if (status.persisted === false) return 'Gerido pelo browser';
    return 'Estado indisponível';
  }

  private async loadStorageStatus(): Promise<void> {
    this.storageStatus.set(await this.storage.requestPersistence());
  }
}
