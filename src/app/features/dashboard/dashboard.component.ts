import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../core/stores/app.store';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { formatCurrency } from '../../shared/utils/money.utils';
import {
  MONTH_NAMES,
  expensesForMonth,
  groupByCategory,
  groupBySubcategory,
  incomesForMonth,
  monthlyBalanceSeries,
  sumExpenses,
  sumIncomes,
} from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, ChartComponent],
  template: `
    <div class="page">
      <header class="page-header dashboard-header">
        <div>
          <p class="eyebrow">Visão geral</p>
          <h1>O seu dinheiro, explicado.</h1>
          <p class="page-intro">Veja quanto entrou, quanto saiu e o saldo real de cada mês.</p>
        </div>
        <div class="period-selectors" aria-label="Período do dashboard">
          <div class="field">
            <label for="dashboard-month">Mês</label>
            <select id="dashboard-month" [value]="selectedMonth()" (change)="setMonth($event)">
              @for (month of months; track $index) { <option [value]="$index + 1" [selected]="$index + 1 === selectedMonth()">{{ month }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="dashboard-year">Ano</label>
            <select id="dashboard-year" [value]="selectedYear()" (change)="setYear($event)">
              @for (year of availableYears(); track year) { <option [value]="year" [selected]="year === selectedYear()">{{ year }}</option> }
            </select>
          </div>
        </div>
      </header>

      <section class="metrics" aria-label="Resumo do período">
        <article class="metric-primary" [class.negative]="monthBalance() < 0">
          <div class="metric-core">
            <span>Saldo em {{ monthName() }}</span>
            <strong>{{ formatCurrency(monthBalance()) }}</strong>
            <small>Rendimentos menos despesas</small>
          </div>
        </article>
        <article class="metric">
          <div class="metric-core">
            <span>Rendimentos</span>
            <strong>{{ formatCurrency(monthIncomeTotal()) }}</strong>
            <small>{{ monthIncomes().length }} {{ monthIncomes().length === 1 ? 'rendimento' : 'rendimentos' }} no mês</small>
          </div>
        </article>
        <article class="metric">
          <div class="metric-core">
            <span>Despesas</span>
            <strong>{{ formatCurrency(monthExpenseTotal()) }}</strong>
            <small>{{ monthExpenses().length }} {{ monthExpenses().length === 1 ? 'despesa' : 'despesas' }} no mês</small>
          </div>
        </article>
      </section>

      @if (store.expenses().length === 0 && store.monthlyIncomes().length === 0) {
        <section class="empty-state dashboard-empty">
          <h2>A visão geral começa com o primeiro movimento</h2>
          <p>Adicione um rendimento ou uma despesa para começar a acompanhar o saldo mensal.</p>
          <div class="button-row empty-actions"><a class="btn btn-primary" routerLink="/poupancas">Adicionar rendimento</a><a class="btn btn-secondary" routerLink="/despesas" [queryParams]="{ nova: 1 }">Adicionar despesa</a></div>
        </section>
      } @else {
        <section class="chart-layout">
          <article class="card card-padding yearly-chart">
            <div class="section-heading">
              <div><h2>Saldo mensal</h2><p>{{ seriesPeriodLabel() }}</p></div>
            </div>
            @if (visiblePeriodHasData()) {
              <app-chart type="bar" [labels]="seriesLabels()" [values]="seriesValues()" [accessibleLabel]="'Saldo mensal em ' + selectedYear()" />
              <details class="data-alternative">
                <summary>Ver dados em tabela</summary>
                <table><thead><tr><th>Mês</th><th>Saldo</th></tr></thead><tbody>
                  @for (point of series(); track point.month) { <tr><td>{{ months[point.month - 1] }}</td><td>{{ formatCurrency(point.amountCents) }}</td></tr> }
                </tbody></table>
              </details>
            } @else {
              <p class="chart-empty">Ainda não existem movimentos neste ano.</p>
            }
          </article>

          <article class="card card-padding distribution-chart">
            <div class="section-heading"><div><h2>Por categoria</h2><p>{{ monthName() }} de {{ selectedYear() }}</p></div></div>
            @if (categoryGroups().length > 0) {
              <app-chart type="doughnut" [labels]="categoryLabels()" [values]="categoryValues()" [colors]="categoryColors()" accessibleLabel="Distribuição das despesas por categoria" />
              <details class="data-alternative">
                <summary>Ver dados em tabela</summary>
                <table><thead><tr><th>Categoria</th><th>Total</th></tr></thead><tbody>
                  @for (group of categoryGroups(); track group.id) { <tr><td>{{ group.name }}</td><td>{{ formatCurrency(group.amountCents) }}</td></tr> }
                </tbody></table>
              </details>
            } @else {
              <p class="chart-empty">Sem despesas no mês selecionado.</p>
            }
          </article>
        </section>

        <section class="rankings">
          <article class="card-flat ranking-block">
            <h2>Categorias com maior despesa</h2>
            @if (categoryGroups().length > 0) {
              <ol>
                @for (group of categoryGroups().slice(0, 5); track group.id) {
                  <li><span><i [style.background]="group.color"></i>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li>
                }
              </ol>
            } @else { <p class="muted">Sem informação para este mês.</p> }
          </article>
          <article class="card-flat ranking-block">
            <h2>Subcategorias com maior despesa</h2>
            @if (subcategoryGroups().length > 0) {
              <ol>
                @for (group of subcategoryGroups().slice(0, 5); track group.id) {
                  <li><span>{{ group.name }}</span><strong>{{ formatCurrency(group.amountCents) }}</strong></li>
                }
              </ol>
            } @else { <p class="muted">Sem informação para este mês.</p> }
          </article>
        </section>
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
    this.store.monthlyIncomes().forEach((income) => years.add(Number(income.receivedMonth.slice(0, 4))));
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  });
  readonly monthName = computed(() => this.months[this.selectedMonth() - 1]);
  readonly monthExpenses = computed(() => expensesForMonth(this.store.expenses(), this.selectedYear(), this.selectedMonth()));
  readonly monthIncomes = computed(() => incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), this.selectedMonth()));
  readonly monthExpenseTotal = computed(() => sumExpenses(this.monthExpenses()));
  readonly monthIncomeTotal = computed(() => sumIncomes(this.monthIncomes()));
  readonly monthBalance = computed(() => this.monthIncomeTotal() - this.monthExpenseTotal());
  readonly visibleMonthLimit = computed(() => {
    const now = new Date();
    if (this.selectedYear() < now.getFullYear()) return 12;
    if (this.selectedYear() > now.getFullYear()) return 0;
    return now.getMonth() + 1;
  });
  readonly series = computed(() => monthlyBalanceSeries(
    this.store.expenses(),
    this.store.monthlyIncomes(),
    this.selectedYear(),
    this.visibleMonthLimit(),
  ));
  readonly visiblePeriodHasData = computed(() => {
    const limit = this.visibleMonthLimit();
    return Array.from({ length: limit }, (_, index) => index + 1).some((month) =>
      expensesForMonth(this.store.expenses(), this.selectedYear(), month).length > 0
      || incomesForMonth(this.store.monthlyIncomes(), this.selectedYear(), month).length > 0,
    );
  });
  readonly seriesPeriodLabel = computed(() => {
    const limit = this.visibleMonthLimit();
    if (limit === 0) return `Ainda não existem meses decorridos em ${this.selectedYear()}`;
    if (limit === 12) return `Rendimentos menos despesas ao longo de ${this.selectedYear()}`;
    return `Rendimentos menos despesas até ${this.months[limit - 1]} de ${this.selectedYear()}`;
  });
  readonly seriesLabels = computed(() => this.series().map((point) => point.label));
  readonly seriesValues = computed(() => this.series().map((point) => point.amountCents));
  readonly categoryGroups = computed(() => groupByCategory(this.monthExpenses(), this.store.categories()));
  readonly subcategoryGroups = computed(() => groupBySubcategory(this.monthExpenses(), this.store.categories()));
  readonly categoryLabels = computed(() => this.categoryGroups().map((group) => group.name));
  readonly categoryValues = computed(() => this.categoryGroups().map((group) => group.amountCents));
  readonly categoryColors = computed(() => this.categoryGroups().map((group) => group.color ?? '#68727d'));
  setMonth(event: Event): void {
    this.selectedMonth.set(Number((event.target as HTMLSelectElement).value));
  }

  setYear(event: Event): void {
    this.selectedYear.set(Number((event.target as HTMLSelectElement).value));
  }
}
