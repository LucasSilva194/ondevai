import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AppStore } from '../../../core/stores/app.store';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <a class="skip-link" href="#main-content">Saltar para o conteúdo</a>
    <div class="app-layout">
      <aside class="sidebar" aria-label="Navegação principal">
        <a class="brand" routerLink="/visao-geral" aria-label="OndeVai, visão geral">
          <span class="brand-mark" aria-hidden="true">O</span>
          <span>OndeVai</span>
        </a>
        <nav class="nav-list">
          @for (item of navigation; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">{{ item.label }}</a>
          }
        </nav>
        <a class="btn btn-primary add-expense" routerLink="/despesas" [queryParams]="{ nova: 1 }">
          <span>Nova despesa</span><span class="action-symbol" aria-hidden="true">+</span>
        </a>
        <p class="local-note">Guardado localmente neste dispositivo</p>
      </aside>

      <div class="app-content">
        <header class="mobile-header">
          <a class="brand" routerLink="/visao-geral">
            <span class="brand-mark" aria-hidden="true">O</span>
            <span>OndeVai</span>
          </a>
          <a class="btn btn-primary btn-compact" routerLink="/despesas" [queryParams]="{ nova: 1 }"><span>Despesa</span><span class="action-symbol" aria-hidden="true">+</span></a>
        </header>

        @if (store.shouldRemindBackup() && !backupDismissed()) {
          <section class="backup-banner" aria-label="Lembrete de cópia de segurança">
            <div>
              <strong>Proteja os seus dados com uma cópia de segurança.</strong>
              <p>O ficheiro JSON permite recuperar a informação se perder os dados deste browser.</p>
            </div>
            <div class="button-row">
              <button class="btn btn-secondary" type="button" (click)="exportNow()" [disabled]="store.operationPending()">
                Exportar agora
              </button>
              <button class="btn btn-ghost" type="button" (click)="backupDismissed.set(true)">Lembrar mais tarde</button>
            </div>
          </section>
        }

        @if (store.error()) {
          <div class="global-error" role="alert">
            <span>{{ store.error() }}</span>
            <button type="button" class="text-button" (click)="store.clearError()">Fechar</button>
          </div>
        }

        <main id="main-content" tabindex="-1">
          <router-outlet />
        </main>

        <nav class="mobile-nav" aria-label="Navegação principal móvel">
          @for (item of navigation; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">{{ item.shortLabel }}</a>
          }
        </nav>
      </div>
    </div>
  `,
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppShellComponent {
  readonly store = inject(AppStore);
  readonly backupDismissed = signal(false);
  readonly navigation = [
    { path: '/visao-geral', label: 'Visão geral', shortLabel: 'Resumo' },
    { path: '/despesas', label: 'Despesas', shortLabel: 'Despesas' },
    { path: '/categorias', label: 'Categorias', shortLabel: 'Categorias' },
    { path: '/dados-e-privacidade', label: 'Dados e privacidade', shortLabel: 'Dados' },
  ];

  async exportNow(): Promise<void> {
    try {
      await this.store.exportBackup();
      this.backupDismissed.set(true);
    } catch {
      // The store exposes the contextual error to the global alert.
    }
  }
}
