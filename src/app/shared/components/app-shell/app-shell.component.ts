import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { UserSessionService } from '../../../core/auth/user-session.service';
import { AppStore } from '../../../core/stores/app.store';
import { PwaService } from '../../../core/services/pwa.service';
import { IconComponent } from '../icon/icon.component';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent],
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
        <div class="account-panel">
          <a routerLink="/conta" class="account-email">{{ auth.user()?.email }}</a>
          <p class="sync-state" role="status">
            @if (store.syncing()) { A sincronizar… }
            @else if (store.lastSyncedAt()) { Sincronizado {{ lastSyncLabel() }} }
            @else { Dados guardados na sua conta }
          </p>
          <button class="text-button logout-button" type="button" (click)="logout()">Terminar sessão</button>
        </div>
      </aside>

      <div class="app-content">
        <header class="mobile-header">
          <a class="brand" routerLink="/visao-geral">
            <span class="brand-mark" aria-hidden="true">O</span>
            <span>OndeVai</span>
          </a>
          <div class="mobile-header-actions">
            <a class="btn btn-primary btn-compact mobile-add-expense" routerLink="/despesas" [queryParams]="{ nova: 1 }" aria-label="Adicionar despesa">
              <span class="mobile-action-label">Despesa</span><span class="action-symbol" aria-hidden="true"><app-icon name="plus" /></span>
            </a>
            <button class="mobile-menu-toggle" type="button" (click)="mobileMenuOpen.set(!mobileMenuOpen())" [attr.aria-expanded]="mobileMenuOpen()" aria-controls="mobile-more-menu" [attr.aria-label]="mobileMenuOpen() ? 'Fechar menu' : 'Abrir menu'">
              <app-icon [name]="mobileMenuOpen() ? 'close' : 'menu'" />
            </button>
          </div>
        </header>

        @if (mobileMenuOpen()) {
          <button class="mobile-menu-scrim" type="button" aria-label="Fechar menu" (click)="mobileMenuOpen.set(false)"></button>
          <nav class="mobile-more-menu" id="mobile-more-menu" aria-label="Mais opções">
            <span class="mobile-menu-kicker">Mais opções</span>
            <a routerLink="/dados-e-privacidade" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon" aria-hidden="true"><app-icon name="data" /></span>
              <span><strong>Dados e privacidade</strong><small>Backup, importação e armazenamento</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <a routerLink="/conta" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon account-glyph" aria-hidden="true">@</span>
              <span><strong>Conta</strong><small>{{ auth.user()?.email }}</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <button class="mobile-logout" type="button" (click)="logout()">
              <span>Terminar sessão</span>
            </button>
          </nav>
        }

        @if (store.shouldRemindBackup() && !backupDismissed()) {
          <section class="backup-banner" aria-label="Lembrete de cópia de segurança">
            <span class="backup-symbol" aria-hidden="true"><app-icon name="backup" /></span>
            <div class="backup-copy">
              <strong><span class="desktop-backup-copy">Proteja os seus dados com uma cópia de segurança.</span><span class="mobile-backup-copy">Backup pendente</span></strong>
              <p>O ficheiro JSON permite recuperar a informação da sua conta.</p>
            </div>
            <div class="button-row">
              <button class="btn btn-secondary backup-export" type="button" (click)="exportNow()" [disabled]="store.operationPending()" aria-label="Exportar cópia de segurança">
                <app-icon name="backup" /><span>Exportar agora</span>
              </button>
              <button class="btn btn-ghost backup-dismiss" type="button" (click)="backupDismissed.set(true)" aria-label="Lembrar mais tarde"><app-icon name="close" /><span>Lembrar mais tarde</span></button>
            </div>
          </section>
        }

        @if (store.error()) {
          <div class="global-error" role="alert">
            <span>{{ store.error() }}</span>
            <button type="button" class="text-button" (click)="store.clearError()">Fechar</button>
          </div>
        }

        @if (store.connectionError()) {
          <div class="connection-error" role="alert">
            <span>{{ store.connectionError() }} Os dados já carregados continuam visíveis.</span>
          </div>
        }

        @if (pwa.offline()) {
          <div class="offline-banner" role="status">Está sem ligação. Os dados já apresentados podem continuar visíveis, mas não é possível garantir informação atualizada nem guardar alterações. Tentaremos restabelecer a ligação.</div>
        }
        @if (pwa.updateReady()) {
          <div class="update-banner" role="status"><span>Está disponível uma nova versão do OndeVai.</span><button class="btn btn-secondary btn-compact" type="button" (click)="applyUpdate()">Atualizar agora</button></div>
        }

        <main id="main-content" tabindex="-1">
          <router-outlet />
        </main>

        <nav class="mobile-nav" aria-label="Navegação principal móvel">
          @for (item of navigation; track item.path) {
            @if (item.primary) {
              <a [routerLink]="item.path" routerLinkActive="active" [attr.aria-label]="item.label">
                <app-icon [name]="item.icon" />
                <span>{{ item.shortLabel }}</span>
              </a>
            }
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
  readonly pwa = inject(PwaService);
  readonly auth = inject(AuthService);
  private readonly session = inject(UserSessionService);
  readonly backupDismissed = signal(false);
  readonly mobileMenuOpen = signal(false);
  readonly navigation = [
    { path: '/visao-geral', label: 'Visão geral', shortLabel: 'Resumo', icon: 'overview', primary: true },
    { path: '/despesas', label: 'Despesas', shortLabel: 'Despesas', icon: 'expenses', primary: true },
    { path: '/orcamentos', label: 'Orçamentos', shortLabel: 'Limites', icon: 'budgets', primary: true },
    { path: '/poupancas', label: 'Poupanças', shortLabel: 'Poupar', icon: 'savings', primary: true },
    { path: '/categorias', label: 'Categorias', shortLabel: 'Categorias', icon: 'categories', primary: true },
    { path: '/dados-e-privacidade', label: 'Dados e privacidade', shortLabel: 'Dados', icon: 'data', primary: false },
    { path: '/conta', label: 'Conta', shortLabel: 'Conta', icon: 'data', primary: false },
  ] as const;

  async logout(): Promise<void> {
    this.mobileMenuOpen.set(false);
    await this.session.logout();
  }

  lastSyncLabel(): string {
    const value = this.store.lastSyncedAt();
    if (!value) return '';
    return new Intl.DateTimeFormat('pt-PT', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
  }

  async exportNow(): Promise<void> {
    try {
      await this.store.exportBackup();
      this.backupDismissed.set(true);
    } catch {
      // The store exposes the contextual error to the global alert.
    }
  }

  async applyUpdate(): Promise<void> {
    await this.pwa.activateUpdate();
  }
}
