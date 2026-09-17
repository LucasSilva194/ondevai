import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AppStore } from '../../core/stores/app.store';
import { ChartComponent } from '../../shared/components/chart/chart.component';
import { formatCurrency } from '../../shared/utils/money.utils';
import {
  MONTH_NAMES,
  annualTotal,
  compareWithPreviousMonth,
  expensesForMonth,
  expensesForYear,
  groupByCategory,
  groupBySubcategory,
  monthlySeries,
  sumExpenses,
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
          <p class="page-intro">Acompanhe o mês, compare períodos e veja as categorias com maior peso.</p>
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
        <article class="metric-primary">
          <div class="metric-core">
            <span>Total em {{ monthName() }}</span>
            <strong>{{ formatCurrency(monthTotal()) }}</strong>
            <small>{{ monthExpenses().length }} {{ monthExpenses().length === 1 ? 'despesa' : 'despesas' }}</small>
          </div>
        </article>
        <article class="metric">
          <div class="metric-core">
            <span>Total em {{ selectedYear() }}</span>
            <strong>{{ formatCurrency(yearTotal()) }}</strong>
          </div>
        </article>
        <article class="metric">
          <div class="metric-core">
            <span>Comparação mensal</span>
            <strong class="comparison" [class.more]="comparison().direction === 'up'">{{ comparisonLabel() }}</strong>
            <small>{{ formatCurrency(comparison().previousCents) }} no mês anterior</small>
          </div>
        </article>
      </section>

      @if (store.expenses().length === 0) {
        <section class="empty-state dashboard-empty">
          <h2>A visão geral começa com a primeira despesa</h2>
          <p>Registe um valor real para começar a acompanhar a evolução. O OndeVai não adiciona dados de exemplo.</p>
          <a class="btn btn-primary" routerLink="/despesas" [queryParams]="{ nova: 1 }">Adicionar despesa</a>
        </section>
      } @else {
        <section class="chart-layout">
          <article class="card card-padding yearly-chart">
            <div class="section-heading">
              <div><h2>Evolução mensal</h2><p>Despesas ao longo de {{ selectedYear() }}</p></div>
            </div>
            @if (yearExpenses().length > 0) {
              <app-chart type="bar" [labels]="seriesLabels()" [values]="seriesValues()" [accessibleLabel]="'Despesas mensais em ' + selectedYear()" />
              <details class="data-alternative">
                <summary>Ver dados em tabela</summary>
                <table><thead><tr><th>Mês</th><th>Total</th></tr></thead><tbody>
                  @for (point of series(); track point.month) { <tr><td>{{ months[point.month - 1] }}</td><td>{{ formatCurrency(point.amountCents) }}</td></tr> }
                </tbody></table>
              </details>
            } @else {
              <p class="chart-empty">Ainda não existem despesas neste ano.</p>
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
    years.add(new Date().getFullYear());
    return [...years].sort((a, b) => b - a);
  });
  readonly monthName = computed(() => this.months[this.selectedMonth() - 1]);
  readonly monthExpenses = computed(() => expensesForMonth(this.store.expenses(), this.selectedYear(), this.selectedMonth()));
  readonly yearExpenses = computed(() => expensesForYear(this.store.expenses(), this.selectedYear()));
  readonly monthTotal = computed(() => sumExpenses(this.monthExpenses()));
  readonly yearTotal = computed(() => annualTotal(this.store.expenses(), this.selectedYear()));
  readonly comparison = computed(() => compareWithPreviousMonth(this.store.expenses(), this.selectedYear(), this.selectedMonth()));
  readonly series = computed(() => monthlySeries(this.store.expenses(), this.selectedYear()));
  readonly seriesLabels = computed(() => this.series().map((point) => point.label));
  readonly seriesValues = computed(() => this.series().map((point) => point.amountCents));
  readonly categoryGroups = computed(() => groupByCategory(this.monthExpenses(), this.store.categories()));
  readonly subcategoryGroups = computed(() => groupBySubcategory(this.monthExpenses(), this.store.categories()));
  readonly categoryLabels = computed(() => this.categoryGroups().map((group) => group.name));
  readonly categoryValues = computed(() => this.categoryGroups().map((group) => group.amountCents));
  readonly categoryColors = computed(() => this.categoryGroups().map((group) => group.color ?? '#68727d'));
  readonly comparisonLabel = computed(() => {
    const comparison = this.comparison();
    if (comparison.direction === 'no-baseline') return 'Sem base de comparação';
    if (comparison.direction === 'same') return 'Sem alteração';
    const prefix = comparison.direction === 'up' ? '+' : '';
    return `${prefix}${comparison.percentage}%`;
  });

  setMonth(event: Event): void {
    this.selectedMonth.set(Number((event.target as HTMLSelectElement).value));
  }

  setYear(event: Event): void {
    this.selectedYear.set(Number((event.target as HTMLSelectElement).value));
  }
}
