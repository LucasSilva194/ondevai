import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LocalDataMigrationService } from '../../core/migration/local-data-migration.service';
import { PwaService } from '../../core/services/pwa.service';
import { AppStore } from '../../core/stores/app.store';
import { SUGGESTED_CATEGORIES } from '../../models/suggested-categories';

@Component({
  selector: 'app-onboarding',
  imports: [RouterLink],
  template: `
    <main class="onboarding-shell">
      <header class="onboarding-header">
        <a class="onboarding-brand" href="/onboarding" aria-label="OndeVai">
          <span class="onboarding-mark" aria-hidden="true">O</span>
          <span>OndeVai</span>
        </a>
        <p>Passo {{ step() }} de 4</p>
      </header>

      <div class="progress" role="progressbar" aria-label="Progresso do onboarding" [attr.aria-valuenow]="step()" aria-valuemin="1" aria-valuemax="4">
        <span [style.width.%]="step() * 25"></span>
      </div>

      <section class="onboarding-card">
        @switch (step()) {
          @case (1) {
            <p class="eyebrow">Bem-vindo</p>
            <h1>Perceba para onde vai o seu dinheiro.</h1>
            <p class="lead">Registe as suas despesas, organize-as por categorias e acompanhe a sua evolução mensal e anual.</p>
            <ul class="feature-list">
              <li><strong>Conta protegida</strong><span>O email verificado dá acesso aos seus dados.</span></li>
              <li><strong>Categorias personalizáveis</strong><span>Adapte a organização à sua vida.</span></li>
              <li><strong>Dados sob o seu controlo</strong><span>Exporte ou apague tudo quando quiser.</span></li>
            </ul>
          }
          @case (2) {
            <p class="eyebrow">Conta cloud</p>
            <h1>Os seus dados acompanham-no.</h1>
            <p class="lead">As despesas, categorias, rendimentos e poupanças ficam guardados na sua conta e podem ser consultados noutros dispositivos com ligação.</p>
            <div class="notice">
              <strong>O que isto significa</strong>
              <p>As alterações são enviadas ao PocketBase. Sem ligação pode continuar a ver informação já carregada, mas não garantimos leitura atualizada nem escrita offline.</p>
            </div>
          }
          @case (3) {
            <p class="eyebrow">Controlo e portabilidade</p>
            <h1>Exporte ou elimine quando quiser.</h1>
            <p class="lead">Pode descarregar uma cópia JSON, apagar os dados financeiros cloud ou eliminar a conta. O ficheiro não é encriptado e deve ser guardado em segurança.</p>
            @if (migration.summary()?.totalRecords) {
              <div class="notice legacy-notice">
                <strong>Encontrámos dados da versão local</strong>
                <p>Pode copiá-los opcionalmente para esta conta. O original no IndexedDB não será apagado.</p>
                <a class="text-link" routerLink="/migrar-dados">Rever migração local</a>
              </div>
            } @else {
              <div class="notice">
                <strong>Migração opcional</strong>
                <p>Se este browser contiver dados antigos guardados localmente, poderá copiá-los para a conta sem apagar o original.</p>
              </div>
            }
          }
          @case (4) {
            <p class="eyebrow">Ponto de partida</p>
            <h1>Como quer organizar as suas despesas?</h1>
            <p class="lead">Pode começar com uma estrutura completa e alterá-la depois, ou criar tudo à sua medida.</p>
            <fieldset class="choice-list">
              <legend class="visually-hidden">Escolha as categorias iniciais</legend>
              <label [class.selected]="useSuggested()">
                <input type="radio" name="category-choice" [checked]="useSuggested()" (change)="useSuggested.set(true)">
                <span><strong>Usar categorias sugeridas</strong><small>16 categorias com subcategorias comuns.</small></span>
              </label>
              <details class="suggested-categories">
                <summary>
                  <span>Ver as categorias incluídas</span>
                  <small>{{ suggestedCategories.length }} categorias</small>
                </summary>
                <ul class="suggested-category-list">
                  @for (category of suggestedCategories; track category.id) {
                    <li>
                      <span class="category-dot" [style.background-color]="category.color" aria-hidden="true"></span>
                      <span>
                        <strong>{{ category.name }}</strong>
                        <small>{{ category.subcategoryNames }}</small>
                      </span>
                    </li>
                  }
                </ul>
              </details>
              <label [class.selected]="!useSuggested()">
                <input type="radio" name="category-choice" [checked]="!useSuggested()" (change)="useSuggested.set(false)">
                <span><strong>Criar as minhas categorias</strong><small>Começar sem categorias e construir a estrutura.</small></span>
              </label>
            </fieldset>
          }
        }

        <footer class="onboarding-actions">
          @if (step() > 1) {
            <button class="btn btn-ghost" type="button" (click)="previous()">Voltar</button>
          } @else {
            <span></span>
          }
          @if (step() < 4) {
            <button class="btn btn-primary" type="button" (click)="next()">Continuar</button>
          } @else {
            <button class="btn btn-primary" type="button" (click)="finish()" [disabled]="store.operationPending() || pwa.offline()">
              {{ store.operationPending() ? 'A preparar...' : pwa.offline() ? 'Ligação necessária' : 'Começar a usar' }}
            </button>
          }
        </footer>
      </section>
      <p class="privacy-note">O seu dinheiro, explicado. Os seus dados, sob o seu controlo.</p>
    </main>
  `,
  styleUrl: './onboarding.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent implements OnInit {
  readonly store = inject(AppStore);
  readonly pwa = inject(PwaService);
  readonly migration = inject(LocalDataMigrationService);
  private readonly router = inject(Router);
  readonly step = signal(1);
  readonly useSuggested = signal(true);
  readonly suggestedCategories = SUGGESTED_CATEGORIES.map((category) => ({
    ...category,
    subcategoryNames: category.subcategories.map((subcategory) => subcategory.name).join(', '),
  }));

  ngOnInit(): void {
    void this.migration.detectLocalData().catch(() => undefined);
  }

  next(): void {
    this.step.update((value) => Math.min(4, value + 1));
  }

  previous(): void {
    this.step.update((value) => Math.max(1, value - 1));
  }

  async finish(): Promise<void> {
    try {
      await this.store.completeOnboarding(this.useSuggested());
      await this.router.navigate(['/visao-geral']);
    } catch {
      // The store provides a visible error after navigation is still blocked.
    }
  }
}
