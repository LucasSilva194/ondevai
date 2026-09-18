import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../core/stores/app.store';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { IconComponent } from '../../shared/components/icon/icon.component';
import { generateInsights } from '../../shared/utils/insights.utils';
import { formatCurrency } from '../../shared/utils/money.utils';
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
  monthKey,
  MONTH_NAMES,
  sumExpenses,
  sumIncomes,
} from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartComponent, IconComponent],
  template: `
    <div class="page">
      <header class="page-header dashboard-header">
        <div class="dashboard-heading"><p class="eyebrow">Visão geral</p><h1><span class="desktop-heading">O seu dinheiro, explicado.</span><span class="mobile-heading">Visão geral</span></h1><p class="page-intro">Veja quanto entrou, quanto saiu e o saldo real de cada mês.</p></div>
        <div class="period-selectors" aria-label="Período do dashboard">
          <span class="period-symbol" aria-hidden="true"><app-icon name="calendar" /></span>
          <div class="field"><label for="dashboard-month">Mês</label><select id="dashboard-month" [value]="selectedMonth()" (change)="setMonth($event)">@for (month of months; track $index) { <option [value]="$index + 1" [selected]="$index + 1 === selectedMonth()">{{ month }}</option> }</select></div>
          <div class="field"><label for="dashboard-year">Ano</label><select id="dashboard-year" [value]="selectedYear()" (change)="setYear($event)">@for (year of availableYears(); track year) { <option [value]="year" [selected]="year === selectedYear()">{{ year }}</option> }</select></div>
        </div>
      </header>

      @if (isFuturePeriod()) { <p class="period-note" role="status"><span class="desktop-note">Período futuro: são mostrados apenas movimentos já planeados, sem comparações ou conclusões.</span><span class="mobile-note">Período futuro · apenas movimentos planeados</span></p> }
      @else if (isPartialPeriod()) { <p class="period-note" role="status"><span class="desktop-note">Mês em curso: os valores e comparações são parciais até hoje.</span><span class="mobile-note">Mês em curso · valores parciais</span></p> }

      <section class="metrics" aria-label="Resumo do período">
        <article class="metric-primary" [class.negative]="monthBalance() < 0"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="balance" /></span><span>Saldo em {{ monthName() }}</span></div><strong>{{ formatCurrency(monthBalance()) }}</strong><small>Rendimentos menos despesas</small></div></article>
        <article class="metric"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="income" /></span><span>Entradas</span></div><strong>{{ formatCurrency(monthIncomeTotal()) }}</strong><small>{{ monthIncomes().length }} {{ monthIncomes().length === 1 ? 'rendimento' : 'rendimentos' }}</small></div></article>
        <article class="metric"><div class="metric-core"><div class="metric-label"><span class="metric-icon" aria-hidden="true"><app-icon name="expenses" /></span><span>Saídas</span></div><strong>{{ formatCurrency(monthExpenseTotal()) }}</strong><small>{{ monthExpenses().length }} {{ monthExpenses().length === 1 ? 'despesa' : 'despesas' }}</small></div></article>
      </section>

      @if (!isFuturePeriod()) {
        <section class="comparison-section" aria-labelledby="comparison-title">
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

      <section class="dashboard-budget card card-padding" aria-labelledby="budget-title">
        <div><h2 id="budget-title">Orçamento do mês</h2>@if (budgetSummary().totalBudgetedCents > 0) { <p>{{ budgetSummary().usedPercentage }}% utilizado · {{ formatCurrency(budgetSummary().remainingCents) }} restantes</p> } @else { <p>Ainda não definiu limites para este mês.</p> }</div>
        <div class="budget-mini-stats"><span><strong>{{ formatCurrency(budgetSummary().totalBudgetedCents) }}</strong> planeados</span><span><strong>{{ budgetSummary().nearLimit.length }}</strong> perto do limite</span><span><strong>{{ budgetSummary().exceeded.length }}</strong> excedidos</span></div>
        <a class="btn btn-secondary budget-link" routerLink="/orcamentos"><span>Gerir orçamentos</span><app-icon name="arrow-right" /></a>
      </section>

      @if (insights().length > 0 && !isFuturePeriod()) {
        <section class="insights-section" aria-labelledby="insights-title">
          <div class="section-title-row"><div><p class="eyebrow">Insights</p><h2 id="insights-title">O que merece atenção</h2></div></div>
          <div class="insight-grid">@for (insight of insights(); track insight.id) { <article class="insight-card" [class]="'insight-card ' + insight.tone"><span>{{ insight.tone === 'positive' ? 'Evolução' : insight.tone === 'critical' ? 'Prioridade' : 'Contexto' }}</span><h3>{{ insight.title }}</h3><p>{{ insight.explanation }}</p></article> }</div>
        </section>
      }

      @if (store.expenses().length === 0 && store.monthlyIncomes().length === 0) {
        <section class="empty-state dashboard-empty"><h2>A visão geral começa com o primeiro movimento</h2><p>Adicione um rendimento ou uma despesa para começar a acompanhar o saldo mensal.</p><div class="button-row empty-actions"><a class="btn btn-primary" routerLink="/poupancas">Adicionar rendimento</a><a class="btn btn-secondary" routerLink="/despesas" [queryParams]="{ nova: 1 }">Adicionar despesa</a></div></section>
      } @else {
        <section class="chart-layout">
          <article class="card card-padding yearly-chart"><div class="section-heading"><div><h2>Saldo mensal</h2><p>{{ seriesPeriodLabel() }}</p></div></div>@if (visiblePeriodHasData()) { <app-chart type="bar" [labels]="seriesLabels()" [values]="seriesValues()" [accessibleLabel]="'Saldo mensal em ' + selectedYear()" /><details class="data-alternative"><summary>Ver dados em tabela</summary><table><thead><tr><th>Mês</th><th>Saldo</th></tr></thead><tbody>@for (point of series(); track point.month) { <tr><td>{{ months[point.month - 1] }}</td><td>{{ formatCurrency(point.amountCents) }}</td></tr> }</tbody></table></details> } @else { <p class="chart-empty">Ainda não existem movimentos neste ano.</p> }</article>
          <article class="card card-padding distribution-chart"><div class="section-heading"><div><h2>Por categoria</h2><p>{{ monthName() }} de {{ selectedYear() }}</p></div></div>@if (categoryGroups().length > 0) { <app-chart type="doughnut" [labels]="categoryLabels()" [values]="categoryValues()" [colors]="categoryColors()" accessibleLabel="Distribuição das despesas por categoria" /><details class="data-alternative"><summary>Ver dados em tabela</summary><table><thead><tr><th>Categoria</th><th>Total</th></tr></thead><tbody>@for (group of categoryGroups(); track group.id) { <tr><td>{{ group.name }}</td><td>{{ formatCurrency(group.amountCents) }}</td></tr> }</tbody></table></details> } @else { <p class="chart-empty">Sem despesas no mês selecionado.</p> }</article>
        </section>
        <section class="rankings"><article class="card-flat ranking-block"><h2>Categorias com maior despesa</h2>@if (categoryGroups().length > 0) { <ol>@for (group of categoryGroups().slice(0, 5); track group.id) { <li><span><i [style.background]="group.color"></i>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li> }</ol> } @else { <p class="muted">Sem informação para este mês.</p> }</article><article class="card-flat ranking-block"><h2>Subcategorias com maior despesa</h2>@if (subcategoryGroups().length > 0) { <ol>@for (group of subcategoryGroups().slice(0, 5); track group.id) { <li><span>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li> }</ol> } @else { <p class="muted">Sem informação para este mês.</p> }</article></section>
      }
    </div>
  `,
  styleUrl: './dashboard.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent {
  readonly store = inject(AppStore);
  readonly formatCurrency = formatCurrency;
  readonly months = MONTH_NAMES;
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = computed(() => {
    const years = new Set(this.store.expenses().map((expense) => Number(expense.date.slice(0, 4))));
    this.store.monthlyIncomes().forEach((income) => years.add(Number(income.date.slice(0, 4))));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  });
  readonly selectedKey = computed(() => monthKey(this.selectedYear(), this.selectedMonth()));
  readonly todayKey = new Date().toISOString().slice(0, 7);
  readonly isFuturePeriod = computed(() => this.selectedKey() > this.todayKey);
  readonly isPartialPeriod = computed(() => this.selectedKey() === this.todayKey);
  readonly monthName = computed(() => this.months[this.selectedMonth() - 1]);
  readonly monthExpenses = computed(() => expensesForMonth(this.store.expenses(), this.selectedYear(), this.selectedMonth(), this.store.recurrenceExceptions()));
  readonly monthIncomes = computed(() => incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), this.selectedMonth(), this.store.recurrenceExceptions()));
  readonly monthExpenseTotal = computed(() => sumExpenses(this.monthExpenses()));
  readonly monthIncomeTotal = computed(() => sumIncomes(this.monthIncomes()));
  readonly monthBalance = computed(() => this.monthIncomeTotal() - this.monthExpenseTotal());
  readonly comparisons = computed(() => comparePeriods(this.store.expenses(), this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.selectedYear(), this.selectedMonth()));
  readonly threeMonthAverage = computed(() => averagePreviousThreeMonths(this.store.expenses(), this.store.monthlyIncomes(), this.store.recurrenceExceptions(), this.selectedYear(), this.selectedMonth()));
  readonly selectedBudgets = computed(() => this.store.monthlyBudgets().filter((budget) => budget.month === this.selectedKey()));
  readonly budgetSummary = computed(() => calculateBudgetSummary(this.selectedBudgets(), this.monthExpenses(), this.store.categories()));
  readonly insights = computed(() => generateInsights({ year: this.selectedYear(), month: this.selectedMonth(), expenses: this.store.expenses(), incomes: this.store.monthlyIncomes(), categories: this.store.categories(), budgets: this.store.monthlyBudgets(), exceptions: this.store.recurrenceExceptions(), savingsGoals: this.store.savingsGoals() }));
  readonly visibleMonthLimit = computed(() => { const now = new Date(); if (this.selectedYear() < now.getFullYear()) return 12; if (this.selectedYear() > now.getFullYear()) return 0; return now.getMonth() + 1; });
  readonly series = computed(() => monthlyBalanceSeries(this.store.expenses(), this.store.monthlyIncomes(), this.selectedYear(), this.visibleMonthLimit(), this.store.recurrenceExceptions()));
  readonly visiblePeriodHasData = computed(() => { const limit = this.visibleMonthLimit(); return Array.from({ length: limit }, (_, index) => index + 1).some((month) => expensesForMonth(this.store.expenses(), this.selectedYear(), month, this.store.recurrenceExceptions()).length > 0 || incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), month, this.store.recurrenceExceptions()).length > 0); });
  readonly seriesPeriodLabel = computed(() => { const limit = this.visibleMonthLimit(); if (limit === 0) return `Ainda não existem meses decorridos em ${this.selectedYear()}`; if (limit === 12) return `Rendimentos menos despesas ao longo de ${this.selectedYear()}`; return `Rendimentos menos despesas até ${this.months[limit - 1]} de ${this.selectedYear()}`; });
  readonly seriesLabels = computed(() => this.series().map((point) => point.label));
  readonly seriesValues = computed(() => this.series().map((point) => point.amountCents));
  readonly categoryGroups = computed(() => groupByCategory(this.monthExpenses(), this.store.categories()));
  readonly subcategoryGroups = computed(() => groupBySubcategory(this.monthExpenses(), this.store.categories()));
  readonly categoryLabels = computed(() => this.categoryGroups().map((group) => group.name));
  readonly categoryValues = computed(() => this.categoryGroups().map((group) => group.amountCents));
  readonly categoryColors = computed(() => this.categoryGroups().map((group) => group.color ?? '#68727d'));
  setMonth(event: Event): void { this.selectedMonth.set(Number((event.target as HTMLSelectElement).value)); }
  setYear(event: Event): void { this.selectedYear.set(Number((event.target as HTMLSelectElement).value)); }
  signedCurrency(cents: number): string { return `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${formatCurrency(Math.abs(cents))}`; }
  comparisonLabel(comparison: MonthComparison): string { if (comparison.percentage === null) return 'Sem base de comparação'; if (comparison.direction === 'same') return 'Sem alteração'; return `${comparison.direction === 'up' ? 'Aumento' : 'Redução'} de ${Math.abs(comparison.percentage)}%`; }
  directionClass(comparison: MonthComparison): string { return `comparison-${comparison.direction}`; }
}
