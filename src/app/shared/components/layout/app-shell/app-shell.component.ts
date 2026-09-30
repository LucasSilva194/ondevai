import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { UserSessionService } from '../../../../core/auth/user-session.service';
import { AppStore } from '../../../../core/stores/app.store';
import { PwaService } from '../../../../core/services/pwa.service';
import { IconComponent } from '../../common/icon/icon.component';
import { BrandMarkComponent } from '../../common/brand-mark.component';

@Component({
  selector: 'app-shell',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, IconComponent, BrandMarkComponent],
  template: `
    <a class="skip-link" href="#main-content">Saltar para o conteúdo</a>
    <div class="app-layout">
      <aside class="sidebar" aria-label="Navegação principal">
        <a class="brand" routerLink="/visao-geral" aria-label="OndeVai, visão geral">
          <app-brand-mark class="brand-mark" />
          <span>OndeVai</span>
        </a>
        <nav class="nav-list">
          @for (item of navigation; track item.path) {
            <a [routerLink]="item.path" routerLinkActive="active">
              <app-icon [name]="item.icon" />
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>
        <a class="btn btn-primary add-expense" routerLink="/despesas" [queryParams]="{ nova: 1 }">
          <span>Nova despesa</span><span class="action-symbol" aria-hidden="true">+</span>
        </a>
        <div class="account-panel">
          <a routerLink="/dados-e-privacidade" class="account-email">{{ auth.user()?.email }}</a>
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
            <app-brand-mark class="brand-mark" />
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
          <button class="mobile-menu-scrim" type="button" aria-label="Fechar menu" (click)="mobileMenuOpen.set(false)" animate.leave="mobile-menu-scrim-leave"></button>
          <nav class="mobile-more-menu" id="mobile-more-menu" aria-label="Mais opções" animate.leave="mobile-more-menu-leave">
            <span class="mobile-menu-kicker">Mais opções</span>
            <a routerLink="/dados-e-privacidade" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon" aria-hidden="true"><app-icon name="data" /></span>
              <span><strong>Dados e privacidade</strong><small>Conta, segurança e cópias de segurança</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <a routerLink="/a-caminho" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon"><app-icon name="calendar" /></span>
              <span><strong>A caminho</strong><small>Movimentos previstos nos próximos 30 dias</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <a routerLink="/relatorios" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon"><app-icon name="chart" /></span>
              <span><strong>Relatórios</strong><small>Tendências e exportação CSV</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <a routerLink="/categorias" routerLinkActive="active" (click)="mobileMenuOpen.set(false)">
              <span class="mobile-menu-icon"><app-icon name="categories" /></span>
              <span><strong>Categorias</strong><small>Gerir categorias e subcategorias</small></span>
              <app-icon class="mobile-menu-arrow" name="arrow-right" />
            </a>
            <button class="mobile-logout" type="button" (click)="logout()">
              <span>Terminar sessão</span>
            </button>
          </nav>
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

        <main id="main-content" tabindex="-1" [attr.aria-busy]="store.loading() || store.operationPending()">
          @if (store.loading() || store.operationPending()) {
            <div class="app-work-status" role="status" aria-live="polite">
              <span class="loading-indicator" aria-hidden="true"></span>
              {{ store.loading() ? 'A carregar os seus dados…' : 'A processar alterações…' }}
            </div>
          }
          <router-outlet />
        </main>

        <footer class="app-footer">
          <span>© {{ currentYear }} OndeVai</span>
          <span>Feito por <a href="https://lucas-silva.dev" target="_blank" rel="noopener noreferrer">Lucas Silva</a></span>
        </footer>

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
  readonly currentYear = new Date().getFullYear();
  readonly store = inject(AppStore);
  readonly pwa = inject(PwaService);
  readonly auth = inject(AuthService);
  private readonly session = inject(UserSessionService);
  readonly mobileMenuOpen = signal(false);
  readonly navigation = [
    { path: '/visao-geral', label: 'Visão geral', shortLabel: 'Resumo', icon: 'overview', primary: true },
    { path: '/despesas', label: 'Despesas', shortLabel: 'Despesas', icon: 'expenses', primary: true },
    { path: '/a-caminho', label: 'A caminho', shortLabel: 'A caminho', icon: 'calendar', primary: false },
    { path: '/relatorios', label: 'Relatórios', shortLabel: 'Relatórios', icon: 'chart', primary: false },
    { path: '/orcamentos', label: 'Orçamentos', shortLabel: 'Limites', icon: 'budgets', primary: true },
    { path: '/poupancas', label: 'Poupanças', shortLabel: 'Poupar', icon: 'savings', primary: true },
    { path: '/categorias', label: 'Categorias', shortLabel: 'Categorias', icon: 'categories', primary: false },
    { path: '/dados-e-privacidade', label: 'Dados e privacidade', shortLabel: 'Dados', icon: 'data', primary: false },
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

  async applyUpdate(): Promise<void> {
    await this.pwa.activateUpdate();
  }
}
