import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '../../../shared/components/common/brand-mark.component';

@Component({
  selector: 'app-auth-page',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <main class="auth-shell">
      <header class="auth-header">
        <a class="auth-brand" routerLink="/" aria-label="OndeVai — página inicial">
          <app-brand-mark class="auth-mark" />
          <span>OndeVai</span>
        </a>
        <p>O seu dinheiro, explicado.</p>
      </header>

      <section class="auth-card">
        <ng-content />
      </section>

      <p class="privacy-note">Uma conta permite manter os seus dados disponíveis nos seus dispositivos.</p>
    </main>
  `,
  styleUrl: './auth-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPageComponent {}
