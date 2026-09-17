import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppStore } from '../../core/stores/app.store';
import { StorageService } from '../../core/settings/storage.service';

@Component({
  selector: 'app-onboarding',
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
            <h1>Perceba para onde vai o seu dinheiro</h1>
            <p class="lead">Registe as suas despesas, organize-as por categorias e acompanhe a sua evolução mensal e anual.</p>
            <ul class="feature-list">
              <li><strong>Sem conta ou registo</strong><span>Comece sem fornecer dados pessoais.</span></li>
              <li><strong>Categorias personalizáveis</strong><span>Adapte a organização à sua vida.</span></li>
              <li><strong>Dados sob o seu controlo</strong><span>Exporte ou apague tudo quando quiser.</span></li>
            </ul>
          }
          @case (2) {
            <p class="eyebrow">Armazenamento local</p>
            <h1>As suas despesas ficam neste dispositivo</h1>
            <p class="lead">O OndeVai guarda a informação no IndexedDB deste browser. Não existe backend, conta ou sincronização cloud.</p>
            <div class="notice">
              <strong>O que isto significa</strong>
              <p>Os dados pertencem a este browser e perfil. Nunca são enviados para os nossos servidores porque não existem servidores de dados.</p>
            </div>
          }
          @case (3) {
            <p class="eyebrow">Cópia de segurança</p>
            <h1>Exporte um ficheiro para proteger os seus dados</h1>
            <p class="lead">Limpar os dados do browser pode apagar a informação. O JSON permite restaurar despesas, categorias e preferências noutro dispositivo.</p>
            <div class="notice warning">
              <strong>Guarde o ficheiro em segurança</strong>
              <p>O backup não está encriptado e pode ser lido por quem tiver acesso ao ficheiro.</p>
            </div>
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
            <button class="btn btn-primary" type="button" (click)="finish()" [disabled]="store.operationPending()">
              {{ store.operationPending() ? 'A preparar...' : 'Começar a usar' }}
            </button>
          }
        </footer>
      </section>
      <p class="privacy-note">O seu dinheiro, explicado. Os seus dados, no seu dispositivo.</p>
    </main>
  `,
  styleUrl: './onboarding.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OnboardingComponent {
  readonly store = inject(AppStore);
  private readonly router = inject(Router);
  private readonly storage = inject(StorageService);
  readonly step = signal(1);
  readonly useSuggested = signal(true);

  next(): void {
    this.step.update((value) => Math.min(4, value + 1));
  }

  previous(): void {
    this.step.update((value) => Math.max(1, value - 1));
  }

  async finish(): Promise<void> {
    try {
      await this.store.completeOnboarding(this.useSuggested());
      void this.storage.requestPersistence();
      await this.router.navigate(['/visao-geral']);
    } catch {
      // The store provides a visible error after navigation is still blocked.
    }
  }
}
