import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppStore } from '../../../core/stores/app.store';
import { ExpenseOccurrence } from '../../../models/domain.models';
import { formatCurrency } from '../../../shared/utils/money.utils';
import { materializeExpenses, materializeIncomes, recurrenceLabel } from '../../../shared/utils/recurrence.utils';
import { todayDateString } from '../../../shared/utils/date.utils';
import { ChartComponent } from '../../../shared/components/chart/chart.component';
import { RouterLink } from '@angular/router';
import { MONTH_NAMES } from '../../../shared/utils/statistics.utils';
import { IconComponent } from '../../../shared/components/common/icon/icon.component';
import { expenseIconFor } from '../../../shared/utils/expense-icons';

@Component({
  selector: 'app-reports',
  imports: [ChartComponent, RouterLink, IconComponent],
  template: `
    <div class="page">
      <header class="page-header-row">
        <div><p class="eyebrow">Relatórios</p><h1>Veja as tendências.</h1><p class="page-intro">Explore as despesas registadas no período e exporte os movimentos para uma folha de cálculo.</p></div>
        <button class="btn btn-primary" type="button" (click)="exportCsv()" [disabled]="rows().length === 0">Exportar CSV</button>
      </header>

      <section class="report-filters card-flat" aria-label="Período do relatório">
        <div class="field"><label for="report-from">De</label><input id="report-from" type="date" [value]="from()" (change)="setBoundary('from', $event)"></div>
        <div class="field"><label for="report-to">Até</label><input id="report-to" type="date" [value]="to()" (change)="setBoundary('to', $event)"></div>
        <button class="btn btn-ghost btn-compact" type="button" (click)="setThisYear()">Este ano</button>
        <button class="btn btn-ghost btn-compact" type="button" (click)="setThisMonth()">Este mês</button>
      </section>
      <p class="report-period-note">Resumo até hoje. Movimentos futuros aparecem como previstos e ficam fora dos totais registados.</p>

      <section class="report-summary" aria-label="Resumo do período">
        <article><span>Despesas registadas</span><strong>{{ formatCurrency(total()) }}</strong><small>{{ rows().filter((row) => row.date <= today).length }} movimentos no período</small></article>
        <article><span>Comerciantes</span><strong>{{ merchantGroups().length }}</strong><small>comerciante identificado</small></article>
        <article><span>Etiquetas</span><strong>{{ tagGroups().length }}</strong><small>etiquetas utilizadas</small></article>
      </section>

      <section class="report-columns">
        <article class="card card-padding report-chart"><div class="report-section-heading"><div><h2>Despesas por mês</h2><p>Total de cada mês no intervalo selecionado.</p></div></div><app-chart type="bar" [labels]="monthLabels()" [values]="monthValues()" accessibleLabel="Despesas mensais no intervalo" /></article>
        <article class="card-flat report-breakdown"><h2>Por comerciante</h2>@if (merchantGroups().length) { <ol>@for (entry of merchantGroups().slice(0, 8); track entry.name) { <li><a routerLink="/despesas" [queryParams]="{ busca: entry.name }">{{ entry.name }}</a><strong>{{ formatCurrency(entry.amount) }}</strong></li> }</ol> } @else { <p>Adicione o comerciante ao registar despesas para comparar estes valores.</p> }</article>
        <article class="card-flat report-breakdown"><h2>Por etiqueta</h2>@if (tagGroups().length) { <ol>@for (entry of tagGroups().slice(0, 8); track entry.name) { <li><a routerLink="/despesas" [queryParams]="{ busca: entry.name }">{{ entry.name }}</a><strong>{{ formatCurrency(entry.amount) }}</strong></li> }</ol> } @else { <p>Etiquetas ajudam a criar relatórios personalizados sem alterar as categorias.</p> }</article>
        <article class="card-flat report-breakdown"><h2>Por categoria</h2>@if (categoryGroups().length) { <ol>@for (entry of categoryGroups().slice(0, 8); track entry.id) { <li><a routerLink="/despesas" [queryParams]="{ categoria: entry.id }">{{ entry.name }}</a><strong>{{ formatCurrency(entry.amount) }}</strong></li> }</ol> } @else { <p>Sem despesas registadas.</p> }</article>
        <article class="card-flat report-breakdown"><h2>Por subcategoria</h2>@if (subcategoryGroups().length) { <ol>@for (entry of subcategoryGroups().slice(0, 8); track entry.id) { <li><a routerLink="/despesas" [queryParams]="{ categoria: entry.categoryId, subcategoria: entry.id }">{{ entry.name }}</a><strong>{{ formatCurrency(entry.amount) }}</strong></li> }</ol> } @else { <p>Sem subcategorias nos movimentos deste período.</p> }</article>
        <article class="card-flat report-breakdown"><h2>Rendimentos e despesas</h2>@for (month of incomeExpenseMonths(); track month.key) { <div class="month-comparison"><span>{{ month.label }}</span><small>Entradas {{ formatCurrency(month.income) }}<br>Saídas {{ formatCurrency(month.expenses) }}</small></div> }</article>
        <article class="card-flat report-breakdown"><h2>Custo recorrente anual</h2>@if (recurringYearlyCost() > 0) { <strong class="annual-cost">{{ formatCurrency(recurringYearlyCost()) }}</strong><p>Estimativa das séries ativas de despesa, anualizadas pela frequência definida.</p> } @else { <p>Não há séries ativas de despesas para estimar.</p> }</article>
      </section>

      <section class="report-transactions">
        <div class="report-section-heading"><div><h2>Movimentos do período</h2><p>{{ rows().length }} registos e previsões entre {{ from() }} e {{ to() }}.</p></div></div>
        @if (rows().length) { <div class="report-row-list">@for (row of rows(); track row.occurrenceKey) { <article><span class="report-expense-icon" aria-hidden="true"><app-icon [name]="expenseIconFor(row.categoryId, row.subcategoryId)" /></span><time [attr.datetime]="row.date">{{ row.date }}</time><div><strong>{{ row.merchant || row.description || categoryName(row.categoryId) }}</strong><small>{{ categoryName(row.categoryId) }}{{ tagsLabel(row) }}</small></div><span class="status-badge" [class.projected]="row.date > today">{{ row.date > today ? 'Previsto' : 'Registado' }}</span><strong>{{ formatCurrency(row.amountCents) }}</strong></article> }</div> }
        @else { <section class="empty-state"><h2>Sem despesas neste período</h2><p>Altere as datas para consultar outro intervalo.</p></section> }
      </section>
      @if (message()) { <p role="status" class="report-message">{{ message() }}</p> }
    </div>
  `,
  styles: [`
    .report-filters { display: flex; align-items: end; gap: 10px; padding: 14px; margin-bottom: 8px; }
    .report-filters .field { min-width: 180px; }
    .report-period-note { margin: 0 0 18px; color: var(--text-muted); font-size: .72rem; }
    .report-summary { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-bottom: 22px; }
    .report-summary article { display: grid; gap: 8px; padding: 18px 20px; border: 1px solid var(--border); border-radius: 17px; background: var(--surface); }
    .report-summary span { color: var(--text-muted); font-size: .74rem; font-weight: 700; }
    .report-summary strong { font-size: 1.7rem; font-variant-numeric: tabular-nums; }
    .report-summary small { color: var(--text-muted); font-size: .67rem; }
    .report-columns { display: grid; grid-template-columns: 1.3fr 1fr; gap: 14px; align-items: stretch; }
    .report-chart { grid-row: span 2; min-width: 0; }
    .report-section-heading { margin-bottom: 14px; }
    .report-section-heading h2, .report-breakdown h2 { font-size: 1.15rem; }
    .report-section-heading p, .report-breakdown p { margin: 6px 0 0; color: var(--text-muted); font-size: .74rem; line-height: 1.5; }
    .report-breakdown { padding: 20px; }
    .report-breakdown ol { margin: 13px 0 0; padding: 0; list-style: none; }
    .report-breakdown li { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); font-size: .78rem; }
    .report-breakdown li strong { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .report-breakdown li a { overflow: hidden; color: var(--accent-strong); text-overflow: ellipsis; text-decoration: none; }
    .report-breakdown li a:hover { text-decoration: underline; text-underline-offset: 3px; }
    .annual-cost { display: block; margin-top: 14px; font-size: 1.8rem; font-variant-numeric: tabular-nums; }
    .month-comparison { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-top: 1px solid var(--border); font-size: .75rem; }
    .month-comparison small { color: var(--text-muted); text-align: right; line-height: 1.5; }
    .report-transactions { margin-top: 28px; }
    .report-row-list { border-top: 1px solid var(--border); }
    .report-row-list article { display: grid; grid-template-columns: 32px 92px minmax(0,1fr) auto 120px; align-items: center; gap: 14px; min-height: 60px; border-bottom: 1px solid var(--border); }
    .report-expense-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 10px; background: var(--accent-soft); color: var(--accent-strong); }
    .report-expense-icon app-icon { width: 17px; height: 17px; }
    .report-row-list time { color: var(--text-muted); font-size: .74rem; font-variant-numeric: tabular-nums; }
    .report-row-list article div { display: grid; gap: 3px; min-width: 0; }
    .report-row-list article div strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .83rem; }
    .report-row-list article div small { color: var(--text-muted); font-size: .68rem; }
    .report-row-list article > strong { text-align: right; font-size: .82rem; font-variant-numeric: tabular-nums; }
    .status-badge.projected { background: var(--warning-soft); color: var(--warning); }
    .report-message { color: var(--accent-strong); }
    @media (max-width: 760px) { .report-filters { display: grid; grid-template-columns: 1fr 1fr; } .report-filters .field { min-width: 0; } .report-summary { gap: 7px; } .report-summary article { padding: 13px; } .report-summary strong { font-size: 1.25rem; } .report-summary small { font-size: .6rem; } .report-columns { grid-template-columns: 1fr; } .report-chart { grid-row: auto; } .report-row-list article { grid-template-columns: 28px 64px minmax(0,1fr) auto; gap: 8px; padding: 9px 0; } .report-row-list .status-badge { display: none; } .report-row-list article > strong { grid-column: 4; grid-row: 1; font-size: .72rem; } }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportsComponent {
  readonly store = inject(AppStore);
  readonly formatCurrency = formatCurrency;
  readonly today = todayDateString();
  private readonly now = new Date();
  readonly from = signal(`${this.now.getFullYear()}-01-01`);
  readonly to = signal(this.today);
  readonly message = signal('');
  readonly rows = computed(() => this.from() <= this.to() ? materializeExpenses(this.store.expenses(), this.store.recurrenceExceptions(), this.from(), this.to()).sort((a, b) => b.date.localeCompare(a.date)) : []);
  readonly actualRows = computed(() => this.rows().filter((row) => row.date <= this.today));
  readonly total = computed(() => this.actualRows().reduce((sum, row) => sum + row.amountCents, 0));
  readonly merchantGroups = computed(() => groupAmounts(this.actualRows(), (row) => row.merchant));
  readonly tagGroups = computed(() => {
    const totals = new Map<string, number>();
    for (const row of this.actualRows()) for (const tag of row.tags ?? []) totals.set(tag, (totals.get(tag) ?? 0) + row.amountCents);
    return [...totals].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
  });
  readonly categoryGroups = computed(() => {
    const totals = new Map<string, number>();
    for (const row of this.actualRows()) totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0) + row.amountCents);
    return [...totals].map(([id, amount]) => ({ id, name: this.categoryName(id), amount })).sort((a, b) => b.amount - a.amount);
  });
  readonly subcategoryGroups = computed(() => {
    const totals = new Map<string, { categoryId: string; id: string; name: string; amount: number }>();
    for (const row of this.actualRows()) {
      if (!row.subcategoryId) continue;
      const key = `${row.categoryId}:${row.subcategoryId}`;
      const current = totals.get(key) ?? { categoryId: row.categoryId, id: row.subcategoryId, name: `${this.categoryName(row.categoryId)} · ${this.subcategoryName(row.categoryId, row.subcategoryId)}`, amount: 0 };
      current.amount += row.amountCents;
      totals.set(key, current);
    }
    return [...totals.values()].sort((a, b) => b.amount - a.amount);
  });
  readonly incomeExpenseMonths = computed(() => {
    const fromMonth = this.from().slice(0, 7);
    const toMonth = this.to().slice(0, 7);
    const keys: string[] = [];
    for (let cursor = fromMonth; cursor <= toMonth; cursor = shiftMonth(cursor, 1)) keys.push(cursor);
    const incomes = materializeIncomes(this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.from(), this.to());
    return keys.map((key) => ({
      key,
      label: `${MONTH_NAMES[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(2, 4)}`,
      income: incomes.filter((item) => item.date.startsWith(key) && item.date <= this.today).reduce((sum, item) => sum + item.amountCents, 0),
      expenses: this.actualRows().filter((item) => item.date.startsWith(key)).reduce((sum, item) => sum + item.amountCents, 0),
    }));
  });
  readonly monthValues = computed(() => {
    const first = this.from().slice(0, 7);
    const last = this.to().slice(0, 7);
    const keys: string[] = [];
    for (let cursor = first; cursor <= last; cursor = shiftMonth(cursor, 1)) keys.push(cursor);
    return keys.map((key) => this.actualRows().filter((row) => row.date.startsWith(key)).reduce((sum, row) => sum + row.amountCents, 0));
  });
  readonly monthLabels = computed(() => {
    const first = this.from().slice(0, 7);
    const last = this.to().slice(0, 7);
    const keys: string[] = [];
    for (let cursor = first; cursor <= last; cursor = shiftMonth(cursor, 1)) keys.push(cursor);
    return keys.map((key) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1].slice(0, 3)} ${key.slice(2, 4)}`);
  });
  readonly recurringYearlyCost = computed(() => {
    const [year, month, day] = this.today.split('-').map(Number);
    const end = new Date(Date.UTC(year, month - 1, day + 364)).toISOString().slice(0, 10);
    return materializeExpenses(this.store.expenses(), this.store.recurrenceExceptions(), this.today, end)
      .filter((item) => item.seriesId && item.recurrence?.status === 'active')
      .reduce((sum, item) => sum + item.amountCents, 0);
  });

  setBoundary(boundary: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) this[boundary].set(value);
  }
  setThisYear(): void { this.from.set(`${this.now.getFullYear()}-01-01`); this.to.set(this.today); }
  setThisMonth(): void { this.from.set(`${this.today.slice(0, 7)}-01`); this.to.set(this.today); }
  categoryName(id: string): string { return this.store.categories().find((item) => item.id === id)?.name ?? 'Categoria indisponível'; }
  expenseIconFor(categoryId: string, subcategoryId?: string) { return expenseIconFor(this.store.categories(), categoryId, subcategoryId); }
  tagsLabel(row: ExpenseOccurrence): string { return row.tags?.length ? ` · ${row.tags.join(', ')}` : ''; }

  exportCsv(): void {
    if (this.rows().length === 0) return;
    const expenses = this.rows().map((row) => [
      row.date,
      'Expense',
      row.date > this.today ? 'Projected' : 'Recorded',
      (row.amountCents / 100).toFixed(2),
      this.categoryName(row.categoryId),
      row.subcategoryId ? this.subcategoryName(row.categoryId, row.subcategoryId) : '',
      row.description ?? '',
      row.merchant ?? '',
      (row.tags ?? []).join('|'),
      recurrenceLabel(row.recurrence),
    ]);
    const incomes = materializeIncomes(this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.from(), this.to()).map((row) => [
      row.date, 'Income', row.date > this.today ? 'Projected' : 'Recorded', (row.amountCents / 100).toFixed(2), '', '', row.name, '', '', recurrenceLabel(row.recurrence),
    ]);
    const header = ['Date', 'Type', 'State', 'Amount (EUR)', 'Category', 'Subcategory', 'Description', 'Merchant or income name', 'Tags', 'Recurrence'];
    const lines = [...expenses, ...incomes].sort((a, b) => a[0].localeCompare(b[0]));
    const csv = [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ondevai-despesas-${this.from()}-a-${this.to()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.message.set('CSV exportado com datas ISO, valores em EUR e estado previsto/registado.');
  }

  private subcategoryName(categoryId: string, id: string): string { return this.store.categories().find((item) => item.id === categoryId)?.subcategories.find((item) => item.id === id)?.name ?? ''; }
}

function groupAmounts(rows: readonly ExpenseOccurrence[], getKey: (row: ExpenseOccurrence) => string | undefined): { name: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const row of rows) { const key = getKey(row)?.trim(); if (key) totals.set(key, (totals.get(key) ?? 0) + row.amountCents); }
  return [...totals].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

function csvCell(value: string): string { return `"${value.replaceAll('"', '""')}"`; }
function shiftMonth(value: string, delta: number): string {
  const [year, month] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`;
}
