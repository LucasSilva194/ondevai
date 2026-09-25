import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { LocalDataMigrationService } from '../../core/migration/local-data-migration.service';
import { AppStore } from '../../core/stores/app.store';
import { formatDate } from '../../shared/utils/date.utils';

@Component({
  selector: 'app-local-data-migration',
  standalone: true,
  template: `
    <div class="migration-page">
      <section class="migration-shell" aria-labelledby="migration-title">
        <header class="migration-header">
          <p class="eyebrow">Dados deste dispositivo</p>
          <h1 id="migration-title">Leve o seu histórico consigo</h1>
          <p>
            Encontrámos informação guardada localmente neste browser. Pode copiá-la para a sua conta sem
            alterar nem apagar o original.
          </p>
        </header>

        @switch (migration.status()) {
          @case ('checking') {
            <div class="state-card" role="status" aria-live="polite">
              <span class="spinner" aria-hidden="true"></span>
              <div><h2>A verificar este dispositivo</h2><p>Estamos a procurar dados criados antes da sincronização.</p></div>
            </div>
          }
          @case ('none') {
            <div class="state-card calm" role="status">
              <span class="state-symbol" aria-hidden="true">✓</span>
              <div><h2>Não existem dados locais para copiar</h2><p>Pode continuar a usar a sua conta normalmente.</p></div>
            </div>
            <div class="actions"><button class="btn btn-primary" type="button" (click)="continueWithoutImport()">Continuar</button></div>
          }
          @case ('completed') {
            <div class="state-card success" role="status" aria-live="polite">
              <span class="state-symbol" aria-hidden="true">✓</span>
              <div>
                <h2>Dados copiados para a conta</h2>
                <p>Os dados locais permanecem intactos neste dispositivo.</p>
              </div>
            </div>
            <div class="actions"><button class="btn btn-primary" type="button" (click)="continueWithoutImport()">Continuar</button></div>
          }
          @default {
            @if (migration.summary(); as summary) {
              <section class="preview-card" aria-labelledby="preview-title">
                <div class="preview-heading">
                  <div><p class="step-label">Pré-visualização</p><h2 id="preview-title">O que será copiado</h2></div>
                  <strong>{{ summary.totalRecords }} registos</strong>
                </div>
                <dl class="counts-grid">
                  <div><dt>Categorias</dt><dd>{{ summary.counts.categories }}</dd></div>
                  <div><dt>Despesas</dt><dd>{{ summary.counts.expenses }}</dd></div>
                  <div><dt>Rendimentos</dt><dd>{{ summary.counts.monthlyIncomes }}</dd></div>
                  <div><dt>Objetivos</dt><dd>{{ summary.counts.savingsGoals }}</dd></div>
                  <div><dt>Movimentos de poupança</dt><dd>{{ summary.counts.savingsTransactions }}</dd></div>
                  <div><dt>Orçamentos</dt><dd>{{ summary.counts.monthlyBudgets }}</dd></div>
                  <div><dt>Exceções de recorrência</dt><dd>{{ summary.counts.recurrenceExceptions }}</dd></div>
                </dl>
                <div class="date-range">
                  <span>Intervalo de datas</span>
                  <strong>
                    @if (summary.firstDate && summary.lastDate) {
                      {{ formatDate(summary.firstDate) }} — {{ formatDate(summary.lastDate) }}
                    } @else { Sem movimentos com data }
                  </strong>
                </div>
              </section>
            }

            <aside class="copy-note" aria-label="Como funciona a cópia">
              <span aria-hidden="true">↗</span>
              <div>
                <h2>Uma cópia, não uma mudança</h2>
                <p>O envio cria uma cópia na sua conta. Nada será removido do IndexedDB deste browser, mesmo se o pedido falhar.</p>
              </div>
            </aside>

            @if (migration.status() === 'preparing' || migration.status() === 'uploading') {
              <div class="progress-card" role="status" aria-live="polite">
                <p>{{ migration.status() === 'preparing' ? 'A preparar e validar os dados…' : 'A copiar os dados para a conta…' }}</p>
                <progress [attr.aria-label]="migration.status() === 'preparing' ? 'A preparar os dados' : 'A enviar os dados'"></progress>
              </div>
            }

            @if (migration.status() === 'failed') {
              <div class="error-card" role="alert" aria-live="assertive">
                <h2>
                  @if (migration.state().failureKind === 'endpoint-unavailable') { Importação ainda indisponível }
                  @else if (migration.state().failureKind === 'account-not-empty') { A conta já tem dados }
                  @else { Não foi possível concluir }
                </h2>
                <p>{{ migration.error() }}</p>
                <p class="error-assurance">Os dados locais não foram alterados.</p>
              </div>
            }

            @if (postImportError()) {
              <div class="error-card" role="alert"><h2>Os dados foram copiados</h2><p>{{ postImportError() }}</p></div>
            }

            <div class="actions">
              <button
                class="btn btn-primary"
                type="button"
                (click)="startMigration()"
                [disabled]="migration.status() === 'preparing' || migration.status() === 'uploading'"
              >
                {{ migration.status() === 'failed' ? 'Tentar novamente' : 'Copiar para a minha conta' }}
              </button>
              <button
                class="btn btn-ghost"
                type="button"
                (click)="continueWithoutImport()"
                [disabled]="migration.status() === 'preparing' || migration.status() === 'uploading'"
              >Continuar sem importar</button>
            </div>
          }
        }
      </section>
    </div>
  `,
  styleUrl: './local-data-migration.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocalDataMigrationComponent implements OnInit {
  readonly migration = inject(LocalDataMigrationService);
  private readonly auth = inject(AuthService);
  private readonly store = inject(AppStore);
  private readonly router = inject(Router);
  readonly formatDate = formatDate;
  readonly postImportError = signal<string | null>(null);

  ngOnInit(): void {
    void this.migration.detectLocalData().catch(() => undefined);
  }

  async startMigration(): Promise<void> {
    const user = this.auth.user();
    if (!user) return;
    this.postImportError.set(null);
    try {
      const snapshot = await this.migration.createLocalSnapshot();
      const attempt = await this.migration.createMigrationAttempt(user.id, snapshot);
      await this.migration.uploadMigration(snapshot, attempt);
      await this.store.loadAuthenticatedUser();
      if (!this.store.dataReady()) {
        this.postImportError.set('Não foi possível atualizar a vista da conta. Os dados locais continuam intactos; volte a entrar para carregar a cópia cloud.');
        return;
      }
      await this.navigateAfterMigration();
    } catch {
      // The service exposes a translated, recoverable error to the live region.
    }
  }

  async continueWithoutImport(): Promise<void> {
    await this.navigateAfterMigration();
  }

  private async navigateAfterMigration(): Promise<void> {
    await this.router.navigate([this.store.settings().onboardingCompleted ? '/visao-geral' : '/onboarding']);
  }
}
