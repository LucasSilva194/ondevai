import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandMarkComponent } from '../../../shared/components/common/brand-mark.component';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [RouterLink, BrandMarkComponent],
  template: `
    <main class="landing-shell">
      <header class="landing-nav">
        <a class="landing-brand" routerLink="/" aria-label="OndeVai, página inicial">
          <app-brand-mark class="brand-mark" /><span>OndeVai</span>
        </a>
        <nav aria-label="Navegação principal">
          <a class="nav-feature-link" href="#funcionalidades">Funcionalidades</a>
          <a class="btn btn-secondary nav-login" routerLink="/entrar">Entrar</a>
          <a class="btn btn-primary nav-signup" routerLink="/registar">Criar conta <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="eyebrow">Finanças pessoais, com clareza</p>
          <h1 id="hero-title">Perceba para onde vai o seu dinheiro.</h1>
          <p class="hero-intro">Junte despesas, rendimentos e objetivos num só lugar. O OndeVai transforma os movimentos do dia a dia numa visão simples para decidir com confiança.</p>
          <div class="hero-actions">
            <a class="btn btn-primary hero-primary" routerLink="/registar">Começar gratuitamente <span aria-hidden="true">↗</span></a>
            <a class="text-link" routerLink="/entrar">Já tem conta? <strong>Entrar</strong></a>
          </div>
          <div class="hero-trust"><span class="trust-mark" aria-hidden="true">✓</span><span>Sem ligação a bancos. Sem anúncios. Os seus dados ficam sob o seu controlo.</span></div>
        </div>

        <div class="preview-wrap" aria-label="Exemplo ilustrativo do resumo financeiro OndeVai">
          <article class="preview-card">
            <div class="preview-heading"><div><span class="preview-kicker">A sua visão geral</span><h2>Este mês</h2></div><span class="preview-period">Junho <span aria-hidden="true">⌄</span></span></div>
            <div class="balance-block"><span>Saldo disponível</span><strong>1 248,60 <small>€</small></strong><p><span aria-hidden="true">↗</span> 8,4% <span class="balance-caption">face ao mês passado</span></p></div>
            <div class="preview-chart" aria-label="Gráfico ilustrativo de despesas ao longo do mês">
              <div class="chart-axis"><span>600 €</span><span>400 €</span><span>200 €</span><span>0 €</span></div>
              <div class="chart-area"><div class="chart-grid"></div><svg viewBox="0 0 420 124" role="img" aria-label="As despesas mantêm-se dentro do orçamento"><defs><linearGradient id="area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><path class="chart-fill" d="M0 92 C28 82 37 66 67 74 S108 89 136 62 S177 69 205 53 S247 63 274 47 S317 59 343 31 S390 42 420 17 V124 H0Z"/><path class="chart-line" d="M0 92 C28 82 37 66 67 74 S108 89 136 62 S177 69 205 53 S247 63 274 47 S317 59 343 31 S390 42 420 17"/><circle cx="343" cy="31" r="5"/></svg><div class="chart-months"><span>1 jun</span><span>10 jun</span><span>20 jun</span><span>30 jun</span></div></div>
            </div>
            <div class="preview-bottom"><span><i class="legend-dot expenses-dot"></i>Despesas <strong>842,30 €</strong></span><span><i class="legend-dot income-dot"></i>Rendimentos <strong>2 090,90 €</strong></span></div>
          </article>
          <aside class="insight-float"><span class="insight-icon" aria-hidden="true">↗</span><span><small>Bom ritmo</small><strong>Dentro do orçamento</strong></span><span class="float-check" aria-hidden="true">✓</span></aside>
          <span class="preview-note">Um exemplo do que pode acompanhar</span>
        </div>
      </section>

      <section class="feature-section" id="funcionalidades" aria-labelledby="features-title">
        <div class="section-heading"><div><p class="eyebrow">Tudo ligado</p><h2 id="features-title">Uma visão mais clara começa com pequenos hábitos.</h2></div><p>Registe o essencial. O OndeVai organiza o resto para que saiba o que está a acontecer e o que pode fazer a seguir.</p></div>
        <div class="feature-grid">
          <article class="feature-item"><span class="feature-number">01</span><div class="feature-icon expenses-icon" aria-hidden="true">↘</div><h3>Despesas e rendimentos</h3><p>Registe movimentos pontuais ou recorrentes e organize-os com categorias suas.</p></article>
          <article class="feature-item"><span class="feature-number">02</span><div class="feature-icon budget-icon" aria-hidden="true"><span></span><span></span><span></span></div><h3>Orçamentos que fazem sentido</h3><p>Defina limites mensais por categoria e acompanhe como evoluem ao longo do mês.</p></article>
          <article class="feature-item"><span class="feature-number">03</span><div class="feature-icon savings-icon" aria-hidden="true">◎</div><h3>Objetivos para o que importa</h3><p>Acompanhe metas de poupança e os movimentos que o aproximam delas.</p></article>
        </div>
      </section>

      <section class="privacy-band" aria-label="Privacidade e segurança">
        <div><span class="privacy-symbol" aria-hidden="true">⌑</span><span><strong>Os seus dados, sob o seu controlo.</strong><small>Sem contas bancárias ligadas, anúncios ou telemetria.</small></span></div>
        <span class="privacy-divider" aria-hidden="true"></span>
        <div><span class="privacy-symbol export-symbol" aria-hidden="true">↓</span><span><strong>Leve uma cópia consigo.</strong><small>Exporte os seus dados sempre que quiser.</small></span></div>
        <a routerLink="/registar">Começar agora <span aria-hidden="true">→</span></a>
      </section>

      <footer class="landing-footer"><a class="landing-brand footer-brand" routerLink="/" aria-label="OndeVai, página inicial"><app-brand-mark class="brand-mark" /><span>OndeVai</span></a><p>O seu dinheiro, explicado.</p><a routerLink="/entrar">Já tem conta? Entrar</a></footer>
    </main>
  `,
  styleUrl: './landing.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingComponent {}
