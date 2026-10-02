import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../../core/stores/app.store';
import { ExpenseOccurrence, IncomeOccurrence } from '../../../models/domain.models';
import { formatCurrency } from '../../../shared/utils/money.utils';
import { materializeExpenses, materializeIncomes, recurrenceLabel } from '../../../shared/utils/recurrence.utils';
import { todayDateString } from '../../../shared/utils/date.utils';
import { IconComponent } from '../../../shared/components/common/icon/icon.component';
import { expenseIconFor } from '../../../shared/utils/expense-icons';

type UpcomingItem = (ExpenseOccurrence & { itemType: 'expense' }) | (IncomeOccurrence & { itemType: 'income' });

@Component({
  selector: 'app-upcoming',
  imports: [RouterLink, IconComponent],
  template: `
    <div class="page">
      <header class="page-header-row upcoming-header">
        <div><p class="eyebrow">Previsão</p><h1>O que vem a seguir.</h1><p class="page-intro">Movimentos previstos para os próximos 30 dias, a partir de hoje. Não são movimentos confirmados.</p></div>
        <a class="btn btn-secondary" routerLink="/despesas">Gerir despesas e recorrências</a>
      </header>

      <section class="upcoming-summary" aria-label="Resumo da previsão">
        <article><span>Saídas previstas</span><strong>{{ formatCurrency(outgoingTotal()) }}</strong><small>{{ expenses().length }} movimentos · próximos 30 dias</small></article>
        <article><span>Entradas previstas</span><strong>{{ formatCurrency(incomingTotal()) }}</strong><small>{{ incomes().length }} movimentos · próximos 30 dias</small></article>
        <article><span>Saldo previsto</span><strong>{{ formatCurrency(incomingTotal() - outgoingTotal()) }}</strong><small>Entradas menos saídas previstas</small></article>
      </section>

      <div class="upcoming-filter" role="group" aria-label="Filtrar previsão">
        <button class="filter-choice" type="button" [class.active]="filter() === 'all'" (click)="filter.set('all')">Tudo <span>{{ items().length }}</span></button>
        <button class="filter-choice" type="button" [class.active]="filter() === 'expense'" (click)="filter.set('expense')">Saídas <span>{{ expenses().length }}</span></button>
        <button class="filter-choice" type="button" [class.active]="filter() === 'income'" (click)="filter.set('income')">Entradas <span>{{ incomes().length }}</span></button>
      </div>

      @if (visibleItems().length) {
        <section class="agenda" aria-label="Movimentos previstos por data">
          @for (group of groups(); track group.date) {
            <section class="agenda-day">
              <header><div><span>{{ weekday(group.date) }}</span><h2>{{ dateLabel(group.date) }}</h2></div><span>{{ group.items.length }} {{ group.items.length === 1 ? 'movimento' : 'movimentos' }}</span></header>
              @for (item of group.items; track item.occurrenceKey) {
                <article class="agenda-item" [class.income]="item.itemType === 'income'">
                  <span class="agenda-mark" [style.--expense-category-color]="item.itemType === 'expense' ? categoryColor(item.categoryId) : null" aria-hidden="true">@if (item.itemType === 'income') { ＋ } @else { <app-icon [name]="expenseIconFor(item.categoryId, item.subcategoryId)" /> }</span>
                  <div class="agenda-main"><strong>{{ item.itemType === 'income' ? item.name : (item.description || categoryName(item.categoryId)) }}</strong><span>{{ item.itemType === 'income' ? 'Rendimento' : categoryName(item.categoryId) }} · {{ recurrenceLabel(item.recurrence) }}</span></div>
                  <strong class="agenda-amount">{{ item.itemType === 'income' ? '+' : '−' }}{{ formatCurrency(item.amountCents) }}</strong>
                  <span class="status-badge projected">Previsto</span>
                  @if (item.seriesId) {
                    <button class="text-button omit-action" type="button" (click)="skip(item)" [disabled]="store.operationPending()">Omitir</button>
                  }
                </article>
              }
            </section>
          }
        </section>
      } @else {
        <section class="empty-state"><h2>Sem movimentos previstos</h2><p>Não há movimentos nos próximos 30 dias. As despesas e rendimentos recorrentes aparecem aqui automaticamente.</p><a class="btn btn-primary" routerLink="/despesas">Ver despesas</a></section>
      }
      @if (notice()) { <p class="upcoming-notice" role="status">{{ notice() }}</p> }
    </div>
  `,
  styles: [`
    .upcoming-header { align-items: end; }
    .upcoming-summary { display: grid; grid-template-columns: 1.25fr 1fr 1fr; gap: 12px; margin: 0 0 28px; }
    .upcoming-summary article { display: grid; gap: 8px; padding: 20px 22px; border: 1px solid var(--border); border-radius: 18px; background: var(--surface); }
    .upcoming-summary article:first-child { border-color: var(--accent-border); background: var(--accent-soft); }
    .upcoming-summary span { color: var(--text-soft); font-size: .76rem; font-weight: 700; }
    .upcoming-summary strong { font-size: clamp(1.4rem, 3vw, 2rem); font-variant-numeric: tabular-nums; letter-spacing: -.04em; }
    .upcoming-summary small { color: var(--text-muted); font-size: .72rem; }
    .upcoming-filter { display: flex; gap: 6px; width: max-content; max-width: 100%; margin-bottom: 22px; padding: 5px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); }
    .filter-choice { display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 12px; border: 0; border-radius: 999px; background: transparent; color: var(--text-soft); font: inherit; font-size: .78rem; font-weight: 700; cursor: pointer; }
    .filter-choice span { color: var(--text-muted); font-size: .69rem; font-variant-numeric: tabular-nums; }
    .filter-choice.active { background: var(--accent); color: var(--on-accent); }
    .filter-choice.active span { color: inherit; opacity: .75; }
    .agenda { display: grid; gap: 22px; }
    .agenda-day { border-bottom: 1px solid var(--border); padding-bottom: 16px; }
    .agenda-day > header { display: flex; align-items: end; justify-content: space-between; gap: 12px; margin-bottom: 9px; }
    .agenda-day > header div { display: flex; align-items: baseline; gap: 10px; }
    .agenda-day > header div > span, .agenda-day > header > span { color: var(--text-muted); font-size: .74rem; }
    .agenda-day h2 { font-family: var(--display-font); font-size: 1.45rem; font-weight: 500; }
    .agenda-item { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto auto auto; align-items: center; gap: 12px; min-height: 68px; padding: 10px 12px; border-radius: 14px; }
    .agenda-item:hover { background: var(--surface); }
    .agenda-mark { width: 32px; height: 32px; display: grid; place-items: center; border-radius: 11px; background: color-mix(in srgb, var(--expense-category-color, var(--danger)) 14%, var(--surface)); color: var(--expense-category-color, var(--danger)); font-size: 1.12rem; }
    .agenda-mark app-icon { width: 17px; height: 17px; }
    .agenda-item.income .agenda-mark { background: var(--accent-soft); color: var(--accent-strong); }
    .agenda-main { display: grid; gap: 4px; min-width: 0; }
    .agenda-main strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .88rem; }
    .agenda-main span { color: var(--text-muted); font-size: .72rem; }
    .agenda-amount { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .agenda-item.income .agenda-amount { color: var(--accent-strong); }
    .status-badge.projected { background: var(--surface-subtle); }
    .omit-action { font-size: .73rem; }
    .upcoming-notice { margin: 14px 0; color: var(--accent-strong); }
    @media (max-width: 700px) {
      .upcoming-header { gap: 16px; }
      .upcoming-header > a { width: 100%; }
      .upcoming-summary { grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; }
      .upcoming-summary article { padding: 15px; }
      .upcoming-summary article:first-child { grid-column: 1 / -1; }
      .upcoming-summary small { font-size: .66rem; }
      .agenda-item { grid-template-columns: 32px minmax(0,1fr) auto; gap: 9px; padding: 10px 4px; }
      .agenda-item .status-badge { display: none; }
      .omit-action { grid-column: 2 / 4; justify-self: start; }
    }
    @media (prefers-reduced-motion: reduce) { .agenda-item:hover { background: transparent; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpcomingComponent {
  readonly store = inject(AppStore);
  readonly formatCurrency = formatCurrency;
  readonly recurrenceLabel = recurrenceLabel;
  readonly filter = signal<'all' | 'expense' | 'income'>('all');
  readonly notice = signal('');
  readonly today = todayDateString();
  readonly until = addDays(this.today, 30);
  readonly expenses = computed(() => materializeExpenses(this.store.expenses(), this.store.recurrenceExceptions(), this.today, this.until).filter((item) => item.seriesId));
  readonly incomes = computed(() => materializeIncomes(this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.today, this.until).filter((item) => item.seriesId));
  readonly outgoingTotal = computed(() => this.expenses().reduce((total, item) => total + item.amountCents, 0));
  readonly incomingTotal = computed(() => this.incomes().reduce((total, item) => total + item.amountCents, 0));
  readonly items = computed<UpcomingItem[]>(() => [
    ...this.expenses().map((item) => ({ ...item, itemType: 'expense' as const })),
    ...this.incomes().map((item) => ({ ...item, itemType: 'income' as const })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.itemType.localeCompare(b.itemType)));
  readonly visibleItems = computed(() => this.items().filter((item) => this.filter() === 'all' || item.itemType === this.filter()));
  readonly groups = computed(() => {
    const byDate = new Map<string, UpcomingItem[]>();
    for (const item of this.visibleItems()) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
    return [...byDate].map(([date, items]) => ({ date, items }));
  });

  categoryName(id: string): string { return this.store.categories().find((item) => item.id === id)?.name ?? 'Despesa'; }
  categoryColor(id: string): string { return this.store.categories().find((item) => item.id === id)?.color ?? '#68727d'; }
  expenseIconFor(categoryId: string, subcategoryId?: string) { return expenseIconFor(this.store.categories(), categoryId, subcategoryId); }
  weekday(date: string): string { return new Intl.DateTimeFormat('pt-PT', { weekday: 'long' }).format(new Date(`${date}T12:00:00`)); }
  dateLabel(date: string): string { return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'long' }).format(new Date(`${date}T12:00:00`)); }

  async skip(item: UpcomingItem): Promise<void> {
    if (!item.seriesId) return;
    const occurrenceDate = item.occurrenceKey.slice(-10);
    try {
      if (item.itemType === 'expense') await this.store.skipExpenseOccurrence(item.seriesId, occurrenceDate);
      else await this.store.skipIncomeOccurrence(item.seriesId, occurrenceDate);
      this.notice.set('Ocorrência omitida. A previsão foi atualizada.');
    } catch { this.notice.set('Não foi possível omitir esta ocorrência. Consulte a mensagem de erro.'); }
  }
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}
