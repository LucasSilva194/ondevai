import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

const GUIDE_STEPS = [
  {
    label: 'Visão geral',
    title: 'Comece pelo mês.',
    description: 'A visão geral reúne entradas, despesas e saldo. Escolha outro mês, compare com o anterior e reorganize os blocos para destacar o que consulta mais.',
    detail: 'Os gráficos mostram despesas por categoria e a evolução mensal. Os valores refletem os movimentos que registou.',
  },
  {
    label: 'Despesas',
    title: 'Registe cada saída.',
    description: 'Em Despesas ou no botão Nova despesa, indique data, valor e categoria. Pode acrescentar subcategoria, descrição, comerciante e etiquetas.',
    detail: 'Defina uma frequência para despesas recorrentes. Depois pesquise, filtre e ordene os registos; pode editar ou remover uma despesa ou uma ocorrência.',
  },
  {
    label: 'Rendimentos',
    title: 'Registe o que entra.',
    description: 'Em Poupanças, escolha Adicionar rendimento e indique o nome, tipo, data e valor. Rendimentos também podem ser pontuais ou recorrentes.',
    detail: 'Os totais mensais e as previsões incluem as entradas. Uma ocorrência recorrente pode ser ajustada ou omitida sem alterar a série toda.',
  },
  {
    label: 'Objetivos',
    title: 'Dê um destino à poupança.',
    description: 'Crie um objetivo com nome, montante pretendido e, se quiser, uma data e um reforço mensal planeado. O valor já poupado fica registado como saldo inicial.',
    detail: 'Use Movimentar para adicionar reforços ou levantamentos. O progresso e o histórico ajudam a acompanhar cada objetivo.',
  },
  {
    label: 'Orçamentos',
    title: 'Defina limites por categoria.',
    description: 'Em Orçamentos, escolha o mês, a categoria e o limite. Acompanhe o valor usado e o que resta à medida que regista despesas.',
    detail: 'Pode copiar limites do mês anterior e ajustar cada mês sem perder os valores já definidos noutros períodos. O restante é calculado pelas despesas registadas e exclui categorias sem limite.',
  },
  {
    label: 'Previsões e relatórios',
    title: 'Veja o que vem a seguir.',
    description: 'A caminho mostra entradas e saídas recorrentes previstas nos próximos 30 dias. Uma previsão não é um movimento confirmado; pode omitir uma ocorrência.',
    detail: 'Relatórios permitem escolher um período, comparar despesas por mês, categoria, comerciante ou etiqueta, consultar entradas e exportar despesas e rendimentos para CSV.',
  },
  {
    label: 'Categorias e conta',
    title: 'Adapte e proteja os seus dados.',
    description: 'Em Categorias, crie ou edite categorias e subcategorias, escolha cores e arquive o que já não usa. O histórico mantém as referências originais.',
    detail: 'Em Dados e privacidade pode alterar email ou palavra-passe, migrar dados locais, exportar ou importar uma cópia JSON e apagar dados ou a conta. A cópia não é encriptada. As alterações sincronizam com a conta e precisam de ligação.',
  },
] as const;

@Component({
  selector: 'app-guide',
  imports: [RouterLink],
  template: `
    <div class="page guide-page">
      <header class="guide-heading">
        <p class="eyebrow">Guia da aplicação</p>
        <a class="guide-skip" routerLink="/visao-geral">Saltar guia</a>
      </header>
      <div class="guide-progress" role="progressbar" aria-label="Progresso do guia" [attr.aria-valuenow]="step() + 1" aria-valuemin="1" [attr.aria-valuemax]="steps.length">
        <span [style.width.%]="((step() + 1) / steps.length) * 100"></span>
      </div>
      <section class="guide-card" aria-live="polite">
        <div class="guide-step-count">{{ step() + 1 }} <span>/ {{ steps.length }}</span></div>
        <p class="guide-label">{{ current().label }}</p>
        <h1>{{ current().title }}</h1>
        <p class="guide-description">{{ current().description }}</p>
        <p class="guide-detail">{{ current().detail }}</p>
        <footer class="guide-actions">
          @if (step() > 0) { <button class="btn btn-ghost" type="button" (click)="previous()">Anterior</button> }
          @else { <span></span> }
          @if (step() < steps.length - 1) {
            <button class="btn btn-primary" type="button" (click)="next()">Continuar</button>
          } @else {
            <button class="btn btn-primary" type="button" (click)="finish()">Começar a usar</button>
          }
        </footer>
      </section>
      <nav class="guide-dots" aria-label="Passos do guia">
        @for (item of steps; track item.label; let index = $index) {
          <button type="button" [class.active]="step() === index" [attr.aria-label]="'Passo ' + (index + 1) + ': ' + item.label" [attr.aria-current]="step() === index ? 'step' : null" (click)="step.set(index)"></button>
        }
      </nav>
    </div>
  `,
  styles: [`
    .guide-page { width: min(820px, 100%); min-height: min(680px, calc(100dvh - 80px)); margin-inline: auto; display: flex; flex-direction: column; justify-content: center; }
    .guide-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .guide-heading .eyebrow { margin: 0; }
    .guide-skip { color: var(--text-muted); font-size: .8rem; text-underline-offset: 3px; }
    .guide-progress { height: 6px; margin: 20px 0 26px; overflow: hidden; border-radius: 99px; background: var(--surface-subtle); }
    .guide-progress span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 220ms var(--ease-out); }
    .guide-card { position: relative; min-height: 410px; padding: clamp(28px, 7vw, 64px); border: 6px solid var(--bezel); border-radius: 30px; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--inner-stroke), var(--shadow); }
    .guide-step-count { color: var(--accent-strong); font-size: .75rem; font-weight: 800; letter-spacing: .08em; }
    .guide-step-count span { color: var(--text-muted); font-weight: 600; }
    .guide-label { margin: 34px 0 10px; color: var(--accent-strong); font-size: .75rem; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
    .guide-card h1 { max-width: 15ch; margin: 0; font-size: clamp(2.5rem, 6vw, 4.5rem); line-height: .98; letter-spacing: -.065em; text-wrap: balance; }
    .guide-description { max-width: 58ch; margin: 22px 0 0; color: var(--text-soft); font-size: 1rem; line-height: 1.7; }
    .guide-detail { max-width: 58ch; margin: 16px 0 0; padding: 16px 18px; border-radius: 14px; background: var(--accent-soft); color: var(--text-soft); font-size: .87rem; line-height: 1.6; }
    .guide-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 36px; }
    .guide-dots { display: flex; justify-content: center; gap: 8px; margin: 22px 0 0; }
    .guide-dots button { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 99px; background: var(--border-strong); cursor: pointer; transition: width 160ms var(--ease-out), background-color 160ms ease; }
    .guide-dots button.active { width: 24px; background: var(--accent); }
    .guide-dots button:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
    @media (max-width: 600px) { .guide-page { min-height: calc(100dvh - 110px); } .guide-card { min-height: 0; padding: 30px 22px; border-width: 5px; border-radius: 24px; } .guide-label { margin-top: 26px; } .guide-actions { margin-top: 28px; } }
    @media (prefers-reduced-motion: reduce) { .guide-progress span, .guide-dots button { transition: none; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideComponent {
  readonly steps = GUIDE_STEPS;
  readonly step = signal(0);
  readonly current = () => this.steps[this.step()];
  private readonly router = inject(Router);

  next(): void { this.step.update((value) => Math.min(this.steps.length - 1, value + 1)); }
  previous(): void { this.step.update((value) => Math.max(0, value - 1)); }
  finish(): void { void this.router.navigate(['/visao-geral']); }
}
