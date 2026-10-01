import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../../core/stores/app.store';
import { ChartComponent } from '../../../shared/components/chart/chart.component';
import { IconComponent } from '../../../shared/components/common/icon/icon.component';
import { generateInsights } from '../../../shared/utils/insights.utils';
import { formatCurrency } from '../../../shared/utils/money.utils';
import { todayDateString } from '../../../shared/utils/date.utils';
import { materializeExpenses, materializeIncomes } from '../../../shared/utils/recurrence.utils';
import {
  averagePreviousThreeMonths,
  calculateBudgetSummary,
  comparePeriods,
  expensesForMonth,
  groupByCategory,
  groupBySubcategory,
  incomesForMonth,
  MonthComparison,
  monthlyBalanceSeries,
  netSavingsContributionsForMonth,
  monthKey,
  MONTH_NAMES,
  sumExpenses,
  sumIncomes,
} from '../../../shared/utils/statistics.utils';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartComponent, IconComponent],
  template: `
    <div class="page">
      <header class="page-header dashboard-header">
        <div class="dashboard-heading"><p class="eyebrow">Visão geral</p><h1><span class="desktop-heading">O seu dinheiro, explicado.</span><span class="mobile-heading">Visão geral</span></h1><p class="page-intro">Veja quanto entrou, quanto saiu e o saldo real de cada mês.</p></div>
        <div class="dashboard-controls">
          <div class="period-selectors" aria-label="Período do dashboard">
            <button class="period-arrow" type="button" (click)="shiftPeriod(-1)" aria-label="Mês anterior"><app-icon name="arrow-up" /></button>
            <div class="field period-month-field"><label class="visually-hidden" for="dashboard-month">Mês</label><select id="dashboard-month" [value]="selectedMonth()" (change)="setMonth($event)">@for (month of months; track $index) { <option [value]="$index + 1" [selected]="$index + 1 === selectedMonth()">{{ month }}</option> }</select></div>
            <div class="field period-year-field"><label class="visually-hidden" for="dashboard-year">Ano</label><select id="dashboard-year" [value]="selectedYear()" (change)="setYear($event)">@for (year of availableYears(); track year) { <option [value]="year" [selected]="year === selectedYear()">{{ year }}</option> }</select></div>
            <button class="period-arrow period-next" type="button" (click)="shiftPeriod(1)" aria-label="Mês seguinte"><app-icon name="arrow-up" /></button>
            <button class="period-current" type="button" (click)="goToCurrentMonth()" aria-label="Ir para este mês"><app-icon name="refresh" /></button>
          </div>
          <button class="btn btn-ghost btn-compact widget-edit-toggle" type="button" (click)="toggleWidgetEditing()" [attr.aria-pressed]="editingWidgetOrder()" [attr.aria-label]="editingWidgetOrder() ? 'Concluir personalização' : 'Personalizar visão geral'">
            @if (editingWidgetOrder()) { <app-icon name="close" /><span>Concluir</span> } @else { <app-icon name="edit" /><span class="widget-edit-label-full">Personalizar visão geral</span><span class="widget-edit-label-short">Personalizar</span> }
          </button>
          @if (editingWidgetOrder()) { <p class="widget-edit-hint">Arraste os blocos ou foque um e use as setas do teclado.</p> }
        </div>
      </header>

      @if (isFuturePeriod()) { <p class="period-note" role="status"><span class="desktop-note">Período futuro: são mostrados apenas movimentos já planeados, sem comparações ou conclusões.</span><span class="mobile-note">Período futuro · apenas movimentos planeados</span></p> }
      @else if (isPartialPeriod()) { <p class="period-note" role="status"><span class="desktop-note">Mês em curso: os valores e comparações são parciais até hoje.</span><span class="mobile-note">Mês em curso · valores parciais</span></p> }

      <section class="metrics" aria-label="Resumo do período">
        <article class="metric-primary" [class.negative]="monthBalance() < 0"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="balance" /></span><span>Saldo em {{ monthName() }}</span></div><strong>{{ formatCurrency(monthBalance()) }}</strong><small>Rendimentos menos despesas e reforços</small></div></article>
        <a class="metric metric-action" routerLink="/poupancas" [queryParams]="{ nova: 1 }"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="income" /></span><span>Entradas</span><span class="metric-action-indicator" aria-hidden="true"><app-icon name="plus" /></span></div><strong>{{ formatCurrency(monthIncomeTotal()) }}</strong><small>{{ monthIncomes().length }} {{ monthIncomes().length === 1 ? 'rendimento' : 'rendimentos' }}</small></div></a>
        <article class="metric"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="expenses" /></span><span>Saídas</span></div><strong>{{ formatCurrency(monthExpenseTotal()) }}</strong><small>{{ monthExpenses().length }} {{ monthExpenses().length === 1 ? 'despesa' : 'despesas' }}</small></div></article>
      </section>

      <section class="dashboard-next card-flat" aria-label="Plano do mês e próximos movimentos">
        <div class="dashboard-allowance">
          <div><p class="eyebrow">Plano do mês</p><h2>Restante nos limites definidos</h2><p>Orçamentos por categoria menos despesas registadas nessas categorias. Não representa saldo bancário e exclui categorias sem limite.</p></div>
          @if (budgetSummary().totalBudgetedCents > 0) { <strong [class.negative-allowance]="plannedBudgetRemaining() < 0">{{ formatCurrency(plannedBudgetRemaining()) }}</strong> }
          @else { <a class="btn btn-secondary btn-compact" routerLink="/orcamentos">Definir limites</a> }
        </div>
        <div class="dashboard-coming">
          <div class="coming-heading"><div><h2>A caminho</h2><p>Previsões para os próximos 30 dias</p></div><a routerLink="/a-caminho">Ver agenda <app-icon name="arrow-right" /></a></div>
          @if (nextItems().length) {
            <ul>@for (item of nextItems(); track item.occurrenceKey) { <li><span class="coming-date">{{ shortDate(item.date) }}</span><span class="coming-name">{{ item.itemType === 'income' ? item.name : (item.description || categoryName(item.categoryId)) }}<small>{{ item.itemType === 'income' ? 'Entrada prevista' : 'Saída prevista' }}</small></span><strong [class.income-amount]="item.itemType === 'income'">{{ item.itemType === 'income' ? '+' : '−' }}{{ formatCurrency(item.amountCents) }}</strong></li> }</ul>
          } @else { <p class="coming-empty">Sem movimentos previstos nos próximos 30 dias.</p> }
        </div>
      </section>

      <div class="dashboard-widgets" [class.is-editing]="editingWidgetOrder()" aria-label="Widgets da visão geral" (dragstart)="startWidgetDrag($event)" (dragover)="allowWidgetDrop($event)" (drop)="dropWidget($event)" (dragend)="endWidgetDrag()" (keydown)="reorderWidgetWithKeyboard($event)">
      @if (!isFuturePeriod()) {
        <section class="dashboard-widget comparison-section" data-widget-id="comparison" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'comparison'" [style.--mobile-order]="widgetOrder('comparison')" aria-labelledby="comparison-title">
          <div class="section-title-row"><div><h2 id="comparison-title">Comparação com o mês anterior</h2><p>{{ isPartialPeriod() ? 'Comparação parcial, com os dados disponíveis.' : 'Diferença absoluta e percentual.' }}</p></div></div>
          <div class="comparison-grid">
            <article class="card-flat"><div class="comparison-label"><app-icon name="expenses" /><span>Despesas</span></div><strong>{{ signedCurrency(comparisons().expenses.differenceCents) }}</strong><small [class]="directionClass(comparisons().expenses)">{{ comparisonLabel(comparisons().expenses) }}</small></article>
            <article class="card-flat"><div class="comparison-label"><app-icon name="income" /><span>Rendimentos</span></div><strong>{{ signedCurrency(comparisons().incomes.differenceCents) }}</strong><small [class]="directionClass(comparisons().incomes)">{{ comparisonLabel(comparisons().incomes) }}</small></article>
            <article class="card-flat"><div class="comparison-label"><app-icon name="balance" /><span>Saldo</span></div><strong>{{ signedCurrency(comparisons().balance.differenceCents) }}</strong><small [class]="directionClass(comparisons().balance)">{{ comparisonLabel(comparisons().balance) }}</small></article>
          </div>
          @if (threeMonthAverage(); as average) {
            <p class="average-note">Média dos três meses anteriores: <strong>{{ formatCurrency(average.expensesCents) }}</strong> em despesas, <strong>{{ formatCurrency(average.incomesCents) }}</strong> em rendimentos e saldo médio de <strong>{{ formatCurrency(average.balanceCents) }}</strong>.</p>
          }
        </section>
      }

      <section class="dashboard-widget dashboard-budget card card-padding" data-widget-id="budget" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'budget'" [style.--mobile-order]="widgetOrder('budget')" aria-labelledby="budget-title">
        <div><h2 id="budget-title">Orçamento do mês</h2>@if (budgetSummary().totalBudgetedCents > 0) { <p>{{ budgetSummary().usedPercentage }}% utilizado · {{ formatCurrency(budgetSummary().remainingCents) }} restantes</p> } @else { <p>Ainda não definiu limites para este mês.</p> }</div>
        <div class="budget-mini-stats"><span><strong>{{ formatCurrency(budgetSummary().totalBudgetedCents) }}</strong> planeados</span><span><strong>{{ budgetSummary().nearLimit.length }}</strong> perto do limite</span><span><strong>{{ budgetSummary().exceeded.length }}</strong> excedidos</span></div>
        <a class="btn btn-secondary budget-link" routerLink="/orcamentos"><span>Gerir orçamentos</span><app-icon name="arrow-right" /></a>
      </section>

      @if (insights().length > 0 && !isFuturePeriod()) {
        <section class="dashboard-widget insights-section" data-widget-id="insights" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'insights'" [style.--mobile-order]="widgetOrder('insights')" aria-labelledby="insights-title">
          <div class="section-title-row"><div><p class="eyebrow">Insights</p><h2 id="insights-title">O que merece atenção</h2></div></div>
          <div class="insight-grid">@for (insight of insights(); track insight.id) { <article class="insight-card" [class]="'insight-card ' + insight.tone"><span>{{ insight.tone === 'positive' ? 'Evolução' : insight.tone === 'critical' ? 'Prioridade' : 'Contexto' }}</span><h3>{{ insight.title }}</h3><p>{{ insight.explanation }}</p></article> }</div>
        </section>
      }

      @if (store.expenses().length === 0 && store.monthlyIncomes().length === 0 && !hasSavingsCashFlow()) {
        <section class="empty-state dashboard-empty"><h2>A visão geral começa com o primeiro movimento</h2><p>Adicione um rendimento ou uma despesa para começar a acompanhar o saldo mensal.</p><div class="button-row empty-actions"><a class="btn btn-primary" routerLink="/poupancas">Adicionar rendimento</a><a class="btn btn-secondary" routerLink="/despesas" [queryParams]="{ nova: 1 }">Adicionar despesa</a></div></section>
      } @else {
        <section class="chart-layout">
          <article class="dashboard-widget card card-padding distribution-chart" data-widget-id="categories" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'categories'" [style.--mobile-order]="widgetOrder('categories')"><div class="section-heading"><div><h2>Por categoria</h2><p>{{ monthName() }} de {{ selectedYear() }}</p></div></div>@if (categoryGroups().length > 0) { <app-chart type="doughnut" [labels]="categoryLabels()" [values]="categoryValues()" [colors]="categoryColors()" accessibleLabel="Distribuição das despesas por categoria" /><details class="data-alternative"><summary>Ver dados em tabela</summary><table><thead><tr><th>Categoria</th><th>Total</th></tr></thead><tbody>@for (group of categoryGroups(); track group.id) { <tr><td>{{ group.name }}</td><td>{{ formatCurrency(group.amountCents) }}</td></tr> }</tbody></table></details> } @else { <p class="chart-empty">Sem despesas no mês selecionado.</p> }</article>
          <article class="dashboard-widget card card-padding yearly-chart" data-widget-id="yearly" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'yearly'" [style.--mobile-order]="widgetOrder('yearly')"><div class="section-heading"><div><h2>Saldo mensal</h2><p>{{ seriesPeriodLabel() }}</p></div></div>@if (visiblePeriodHasData()) { <app-chart type="bar" [labels]="seriesLabels()" [values]="seriesValues()" [accessibleLabel]="'Saldo mensal em ' + selectedYear()" /><details class="data-alternative"><summary>Ver dados em tabela</summary><table><thead><tr><th>Mês</th><th>Saldo</th></tr></thead><tbody>@for (point of series(); track point.month) { <tr><td>{{ months[point.month - 1] }}</td><td>{{ formatCurrency(point.amountCents) }}</td></tr> }</tbody></table></details> } @else { <p class="chart-empty">Ainda não existem movimentos neste ano.</p> }</article>
        </section>
        <section class="dashboard-widget rankings" data-widget-id="rankings" [attr.draggable]="editingWidgetOrder() ? 'true' : null" [attr.tabindex]="editingWidgetOrder() ? 0 : null" [class.widget-dragging]="draggedWidget() === 'rankings'" [style.--mobile-order]="widgetOrder('rankings')"><article class="card-flat ranking-block"><h2>Categorias com maior despesa</h2>@if (categoryGroups().length > 0) { <ol>@for (group of categoryGroups().slice(0, 5); track group.id) { <li><span><i [style.background]="group.color"></i>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li> }</ol> } @else { <p class="muted">Sem informação para este mês.</p> }</article><article class="card-flat ranking-block"><h2>Subcategorias com maior despesa</h2>@if (subcategoryGroups().length > 0) { <ol>@for (group of subcategoryGroups().slice(0, 5); track group.id) { <li><span>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li> }</ol> } @else { <p class="muted">Sem informação para este mês.</p> }</article></section>
      }
      </div>
      <p class="visually-hidden" aria-live="polite">{{ widgetOrderAnnouncement() }}</p>
    </div>
  `,
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly store = inject(AppStore);
  readonly formatCurrency = formatCurrency;
  readonly months = MONTH_NAMES;
  private readonly widgetStorageKey = 'ondevai.dashboard.widget-order';
  readonly widgetOrderIds = signal<string[]>(this.readWidgetOrder());
  readonly editingWidgetOrder = signal(false);
  readonly draggedWidget = signal<string | null>(null);
  readonly widgetOrderAnnouncement = signal('');
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = computed(() => {
    const years = new Set(this.store.expenses().map((expense) => Number(expense.date.slice(0, 4))));
    this.store.monthlyIncomes().forEach((income) => years.add(Number(income.date.slice(0, 4))));
    this.store.savingsTransactions().filter((item) => item.type !== 'opening').forEach((item) => years.add(Number(item.effectiveDate.slice(0, 4))));
    years.add(new Date().getFullYear());
    years.add(this.selectedYear());
    years.add(this.selectedYear() - 1);
    years.add(this.selectedYear() + 1);
    return [...years].sort((a, b) => b - a);
  });
  readonly selectedKey = computed(() => monthKey(this.selectedYear(), this.selectedMonth()));
  readonly todayKey = todayDateString().slice(0, 7);
  readonly isFuturePeriod = computed(() => this.selectedKey() > this.todayKey);
  readonly isPartialPeriod = computed(() => this.selectedKey() === this.todayKey);
  readonly monthName = computed(() => this.months[this.selectedMonth() - 1]);
  readonly monthExpenses = computed(() => expensesForMonth(this.store.expenses(), this.selectedYear(), this.selectedMonth(), this.store.recurrenceExceptions()).filter((item) => !this.isPartialPeriod() || item.date <= todayDateString()));
  readonly monthIncomes = computed(() => incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), this.selectedMonth(), this.store.recurrenceExceptions()).filter((item) => !this.isPartialPeriod() || item.date <= todayDateString()));
  readonly monthExpenseTotal = computed(() => sumExpenses(this.monthExpenses()));
  readonly monthIncomeTotal = computed(() => sumIncomes(this.monthIncomes()));
  readonly monthSavingsContributions = computed(() => netSavingsContributionsForMonth(this.store.savingsTransactions(), this.selectedYear(), this.selectedMonth(), this.isPartialPeriod() ? Number(todayDateString().slice(-2)) : undefined));
  readonly monthBalance = computed(() => this.monthIncomeTotal() - this.monthExpenseTotal() - this.monthSavingsContributions());
  readonly comparisons = computed(() => comparePeriods(this.store.expenses(), this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.selectedYear(), this.selectedMonth(), this.isPartialPeriod() ? Number(todayDateString().slice(-2)) : undefined, this.store.savingsTransactions()));
  readonly threeMonthAverage = computed(() => averagePreviousThreeMonths(this.store.expenses(), this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.selectedYear(), this.selectedMonth(), this.store.savingsTransactions()));
  readonly selectedBudgets = computed(() => this.store.monthlyBudgets().filter((budget) => budget.month === this.selectedKey()));
  readonly budgetSummary = computed(() => calculateBudgetSummary(this.selectedBudgets(), this.monthExpenses(), this.store.categories()));
  readonly plannedBudgetRemaining = computed(() => this.budgetSummary().rows.reduce((total, row) => total + row.remainingCents, 0));
  readonly nextItems = computed(() => {
    const today = todayDateString();
    const [year, month, day] = today.split('-').map(Number);
    const endDate = new Date(Date.UTC(year, month - 1, day + 29)).toISOString().slice(0, 10);
    return [
      ...materializeExpenses(this.store.expenses(), this.store.recurrenceExceptions(), today, endDate).map((item) => ({ ...item, itemType: 'expense' as const })),
      ...materializeIncomes(this.store.monthlyIncomes(), this.store.recurrenceExceptions(), today, endDate).map((item) => ({ ...item, itemType: 'income' as const })),
    ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  });
  readonly insights = computed(() => generateInsights({ year: this.selectedYear(), month: this.selectedMonth(), expenses: this.store.expenses(), incomes: this.store.monthlyIncomes(), categories: this.store.categories(), budgets: this.store.monthlyBudgets(), exceptions: this.store.recurrenceExceptions(), savingsGoals: this.store.savingsGoals(), savingsTransactions: this.store.savingsTransactions() }));
  readonly visibleMonthLimit = computed(() => { const now = new Date(); if (this.selectedYear() < now.getFullYear()) return 12; if (this.selectedYear() > now.getFullYear()) return 0; return now.getMonth() + 1; });
  readonly series = computed(() => monthlyBalanceSeries(this.store.expenses(), this.store.monthlyIncomes(), this.selectedYear(), this.visibleMonthLimit(), this.store.recurrenceExceptions(), this.selectedYear() === new Date().getFullYear() ? todayDateString() : undefined, this.store.savingsTransactions()));
  readonly hasSavingsCashFlow = computed(() => this.store.savingsTransactions().some((item) => item.type !== 'opening'));
  readonly visiblePeriodHasData = computed(() => { const limit = this.visibleMonthLimit(); return Array.from({ length: limit }, (_, index) => index + 1).some((month) => expensesForMonth(this.store.expenses(), this.selectedYear(), month, this.store.recurrenceExceptions()).length > 0 || incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), month, this.store.recurrenceExceptions()).length > 0 || this.store.savingsTransactions().some((item) => item.type !== 'opening' && item.effectiveDate.startsWith(`${this.selectedYear()}-${String(month).padStart(2, '0')}-`) && (!this.isPartialPeriod() || item.effectiveDate <= todayDateString()))); });
  readonly seriesPeriodLabel = computed(() => { const limit = this.visibleMonthLimit(); if (limit === 0) return `Ainda não existem meses decorridos em ${this.selectedYear()}`; if (limit === 12) return `Rendimentos, despesas e poupanças em ${this.selectedYear()}`; return `Rendimentos, despesas e poupanças até ${this.months[limit - 1]} de ${this.selectedYear()}`; });
  readonly seriesLabels = computed(() => this.series().map((point) => point.label));
  readonly seriesValues = computed(() => this.series().map((point) => point.amountCents));
  readonly categoryGroups = computed(() => groupByCategory(this.monthExpenses(), this.store.categories()));
  readonly subcategoryGroups = computed(() => groupBySubcategory(this.monthExpenses(), this.store.categories()));
  readonly categoryLabels = computed(() => this.categoryGroups().map((group) => group.name));
  readonly categoryValues = computed(() => this.categoryGroups().map((group) => group.amountCents));
  readonly categoryColors = computed(() => this.categoryGroups().map((group) => group.color ?? '#68727d'));
  widgetOrder(id: string): number { return this.widgetOrderIds().indexOf(id); }
  toggleWidgetEditing(): void {
    this.editingWidgetOrder.update((editing) => !editing);
    this.draggedWidget.set(null);
  }
  startWidgetDrag(event: DragEvent): void {
    if (!this.editingWidgetOrder()) return;
    const widget = this.widgetFromTarget(event.target);
    if (!widget) return;
    this.draggedWidget.set(widget.dataset['widgetId'] ?? null);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', widget.dataset['widgetId'] ?? '');
    }
  }
  allowWidgetDrop(event: DragEvent): void {
    if (this.editingWidgetOrder() && this.widgetFromTarget(event.target)) event.preventDefault();
  }
  dropWidget(event: DragEvent): void {
    if (!this.editingWidgetOrder()) return;
    event.preventDefault();
    const draggedId = this.draggedWidget() ?? event.dataTransfer?.getData('text/plain');
    const targetId = this.widgetFromTarget(event.target)?.dataset['widgetId'];
    if (draggedId && targetId) this.moveWidgetBefore(draggedId, targetId);
    this.draggedWidget.set(null);
  }
  endWidgetDrag(): void { this.draggedWidget.set(null); }
  reorderWidgetWithKeyboard(event: KeyboardEvent): void {
    if (!this.editingWidgetOrder() || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    const widget = this.widgetFromTarget(event.target);
    if (!widget || event.target !== widget) return;
    event.preventDefault();
    const id = widget.dataset['widgetId'];
    if (!id) return;
    const order = [...this.widgetOrderIds()];
    const index = order.indexOf(id);
    const targetIndex = index + (event.key === 'ArrowUp' ? -1 : 1);
    if (index < 0 || targetIndex < 0 || targetIndex >= order.length) return;
    [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
    this.saveWidgetOrder(order, id);
  }
  private moveWidgetBefore(id: string, targetId: string): void {
    if (id === targetId) return;
    const order = [...this.widgetOrderIds()];
    const from = order.indexOf(id);
    const to = order.indexOf(targetId);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(order.indexOf(targetId), 0, id);
    this.saveWidgetOrder(order, id);
  }
  private saveWidgetOrder(order: string[], id: string): void {
    this.widgetOrderIds.set(order);
    const labels: Record<string, string> = { categories: 'Por categoria', yearly: 'Saldo mensal', comparison: 'Comparação', budget: 'Orçamento do mês', insights: 'Insights', rankings: 'Rankings' };
    this.widgetOrderAnnouncement.set(`${labels[id] ?? 'Widget'} reposicionado.`);
    try { localStorage.setItem(this.widgetStorageKey, JSON.stringify(order)); } catch { /* Preference remains available for this session. */ }
  }
  private widgetFromTarget(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>('[data-widget-id]') : null;
  }
  private readWidgetOrder(): string[] {
    const defaults = ['categories', 'yearly', 'comparison', 'budget', 'insights', 'rankings'];
    try {
      const stored = JSON.parse(localStorage.getItem('ondevai.dashboard.widget-order') ?? 'null');
      if (Array.isArray(stored) && defaults.every((id) => stored.includes(id)) && stored.length === defaults.length) return stored;
    } catch { /* Use the default order when storage is unavailable. */ }
    return defaults;
  }
  setMonth(event: Event): void { this.selectedMonth.set(Number((event.target as HTMLSelectElement).value)); }
  setYear(event: Event): void { this.selectedYear.set(Number((event.target as HTMLSelectElement).value)); }
  shiftPeriod(delta: -1 | 1): void {
    const date = new Date(Date.UTC(this.selectedYear(), this.selectedMonth() - 1 + delta, 1));
    this.selectedYear.set(date.getUTCFullYear());
    this.selectedMonth.set(date.getUTCMonth() + 1);
  }
  goToCurrentMonth(): void { const now = new Date(); this.selectedYear.set(now.getFullYear()); this.selectedMonth.set(now.getMonth() + 1); }
  shortDate(date: string): string { return new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`)); }
  categoryName(id: string): string { return this.store.categories().find((category) => category.id === id)?.name ?? 'Despesa'; }
  signedCurrency(cents: number): string { return `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${formatCurrency(Math.abs(cents))}`; }
  comparisonLabel(comparison: MonthComparison): string { if (comparison.percentage === null) return 'Sem base de comparação'; if (comparison.direction === 'same') return 'Sem alteração'; return `${comparison.direction === 'up' ? 'Aumento' : 'Redução'} de ${Math.abs(comparison.percentage)}%`; }
  directionClass(comparison: MonthComparison): string { return `comparison-${comparison.direction}`; }
}
