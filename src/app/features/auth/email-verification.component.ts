import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { AuthPageComponent } from './auth-page.component';

@Component({
  selector: 'app-email-verification',
  standalone: true,
  imports: [AuthPageComponent, RouterLink],
  template: `
    <app-auth-page>
      @if (token) {
        @if (confirmed()) {
          <span class="notice-symbol" aria-hidden="true">✓</span>
          <p class="eyebrow">Email confirmado</p>
          <h1>A conta está pronta</h1>
          <p class="status-copy" role="status">O seu email foi confirmado com sucesso. Já pode iniciar sessão.</p>
          <div class="notice-actions"><a class="btn btn-primary" routerLink="/entrar">Iniciar sessão</a></div>
        } @else {
          <span class="notice-symbol" aria-hidden="true">@</span>
          <p class="eyebrow">A confirmar</p>
          <h1>Confirmação de email</h1>
          @if (auth.loading()) { <p class="status-copy" role="status">Estamos a validar o link de confirmação.</p> }
          @if (auth.error()) {
            <p class="form-message error" role="alert">{{ auth.error() }}</p>
            <div class="notice-actions"><a class="btn btn-secondary" routerLink="/entrar">Voltar ao início de sessão</a></div>
          }
        }
      } @else {
        <span class="notice-symbol" aria-hidden="true">@</span>
        <p class="eyebrow">Confirme o email</p>
        <h1>Veja a sua caixa de entrada</h1>
        <p class="status-copy">Enviámos uma mensagem com o link de confirmação. Consulte também a pasta de correio não solicitado.</p>
        @if (resent()) { <p class="form-message success" role="status">Foi enviado um novo email de confirmação.</p> }
        @if (auth.error()) { <p class="form-message error" role="alert">{{ auth.error() }}</p> }
        <div class="notice-actions">
          <button class="btn btn-secondary" type="button" (click)="resend()" [disabled]="auth.loading()">
            {{ auth.loading() ? 'A enviar...' : 'Reenviar email' }}
          </button>
          <a class="btn btn-ghost" routerLink="/entrar">Voltar ao início de sessão</a>
        </div>
      }
    </app-auth-page>
  `,
  styleUrl: './auth-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmailVerificationComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly token = this.route.snapshot.queryParamMap.get('token')?.trim() ?? '';
  readonly confirmed = signal(false);
  readonly resent = signal(false);

  ngOnInit(): void {
    if (this.token) void this.confirm();
  }

  async resend(): Promise<void> {
    this.resent.set(false);
    try {
      await this.auth.requestVerification();
      this.resent.set(true);
    } catch {
      // AuthService exposes the translated error to the template.
    }
  }

  private async confirm(): Promise<void> {
    try {
      await this.auth.confirmVerification(this.token);
      this.confirmed.set(true);
    } catch {
      // AuthService exposes the translated error to the template.
    }
  }
}
