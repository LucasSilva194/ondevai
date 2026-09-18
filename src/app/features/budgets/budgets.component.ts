import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/stores/app.store';
import { Category, MonthlyBudget } from '../../models/domain.models';
import { centsToInputValue, formatCurrency, parseMoneyToCents } from '../../shared/utils/money.utils';
import { calculateBudgetSummary, expensesForMonth, MONTH_NAMES } from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-budgets',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <header class="page-header-row">
        <div>
          <p class="eyebrow">Orçamentos</p>
          <h1>Planeie antes de gastar.</h1>
          <p class="page-intro">Defina limites mensais por categoria e acompanhe o progresso sem perder o histórico.</p>
        </div>
        <div class="period-actions">
          <div class="field"><label for="budget-month">Mês</label><input id="budget-month" type="month" [value]="selectedMonth()" (change)="setMonth($event)"></div>
          <button class="btn btn-secondary" type="button" (click)="copyPrevious()" [disabled]="store.operationPending()">Copiar mês anterior</button>
          <button class="btn btn-primary" type="button" (click)="openCreate()"><span>Novo limite</span><span class="button-symbol" aria-hidden="true">+</span></button>
        </div>
      </header>

      @if (feedback()) { <p class="feedback" role="status">{{ feedback() }}</p> }

      <section class="budget-metrics" aria-label="Resumo do orçamento">
        <article class="card-flat"><span>Orçamentado</span><strong>{{ formatCurrency(summary().totalBudgetedCents) }}</strong></article>
        <article class="card-flat"><span>Gasto</span><strong>{{ formatCurrency(summary().totalSpentCents) }}</strong></article>
        <article class="card-flat" [class.negative]="summary().remainingCents < 0"><span>Restante</span><strong>{{ formatCurrency(summary().remainingCents) }}</strong></article>
        <article class="card-flat"><span>Utilizado</span><strong>{{ summary().usedPercentage }}%</strong></article>
      </section>

      <section class="status-grid" aria-label="Estado dos orçamentos">
        <article><strong>{{ summary().categoriesWithoutBudget.length }}</strong><span>categorias ativas sem orçamento</span></article>
        <article class="attention"><strong>{{ summary().nearLimit.length }}</strong><span>perto do limite</span></article>
        <article class="exceeded"><strong>{{ summary().exceeded.length }}</strong><span>acima do limite</span></article>
      </section>

      @if (summary().rows.length === 0) {
        <section class="empty-state">
          <h2>Sem limites definidos para {{ selectedMonthLabel() }}</h2>
          <p>Crie um orçamento por categoria ou copie os limites do mês anterior.</p>
          <button class="btn btn-primary" type="button" (click)="openCreate()">Definir primeiro limite</button>
        </section>
      } @else {
        <section class="budget-list" aria-label="Orçamentos por categoria">
          @for (row of summary().rows; track row.budget.id) {
            <article class="budget-row card-flat" [class.attention]="row.status === 'attention'" [class.exceeded]="row.status === 'exceeded'">
              <header>
                <div class="category-name"><i [style.background]="row.categoryColor"></i><div><h2>{{ row.categoryName }}</h2>@if (row.categoryArchived) { <span class="status-badge archived">Categoria arquivada</span> }</div></div>
                <div class="row-actions"><button class="btn btn-ghost btn-compact" type="button" (click)="openEdit(row.budget)">Editar</button><button class="btn btn-ghost btn-compact danger-text" type="button" (click)="remove(row.budget)">Remover</button></div>
              </header>
              <div class="progress-track" role="progressbar" [attr.aria-label]="'Orçamento utilizado em ' + row.categoryName" [attr.aria-valuenow]="Math.min(row.usedPercentage, 100)" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuetext]="row.usedPercentage + '% utilizado, ' + formatCurrency(row.spentCents) + ' de ' + formatCurrency(row.budget.amountCents)">
                <span [style.width.%]="Math.min(row.usedPercentage, 100)"></span>
              </div>
              <div class="budget-values"><span><strong>{{ formatCurrency(row.spentCents) }}</strong> gastos</span><span><strong>{{ formatCurrency(row.budget.amountCents) }}</strong> de limite</span><span [class.negative]="row.remainingCents < 0"><strong>{{ formatCurrency(row.remainingCents) }}</strong> {{ row.remainingCents < 0 ? 'acima' : 'restantes' }}</span></div>
              <p class="state-copy">{{ statusLabel(row.status) }} · {{ row.usedPercentage }}% utilizado</p>
            </article>
          }
        </section>
      }

      @if (summary().categoriesWithoutBudget.length > 0) {
        <section class="without-budget card card-padding">
          <h2>Categorias sem orçamento</h2>
          <p>Não foi definido um limite para: {{ categoryList(summary().categoriesWithoutBudget) }}.</p>
        </section>
      }
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="budget-form-title">
          <header class="modal-header"><div><h2 id="budget-form-title">{{ editingBudget() ? 'Editar orçamento' : 'Novo orçamento' }}</h2><p>O limite é válido apenas para {{ selectedMonthLabel() }}.</p></div><button class="btn btn-ghost btn-compact" type="button" (click)="closeForm()" aria-label="Fechar formulário">Fechar</button></header>
          <form [formGroup]="budgetForm" (ngSubmit)="submit()" novalidate>
            <div class="form-grid">
              <div class="field"><label for="budget-category">Categoria *</label><select id="budget-category" formControlName="categoryId" required><option value="">Selecione</option>@for (category of formCategories(); track category.id) { <option [value]="category.id">{{ category.name }}{{ category.archived ? ' (arquivada)' : '' }}</option> }</select></div>
              <div class="field"><label for="budget-amount">Limite em euros *</label><input id="budget-amount" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>@if (amountError()) { <p class="field-error">{{ amountError() }}</p> }</div>
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions"><button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Guardar orçamento' }}</button><button class="btn btn-secondary" type="button" (click)="closeForm()">Cancelar</button></div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './budgets.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BudgetsComponent {
  readonly store = inject(AppStore);
  private readonly formBuilder = inject(FormBuilder);
  readonly Math = Math;
  readonly formatCurrency = formatCurrency;
  readonly selectedMonth = signal(new Date().toISOString().slice(0, 7));
  readonly formOpen = signal(false);
  readonly editingBudget = signal<MonthlyBudget | null>(null);
  readonly amountError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly feedback = signal<string | null>(null);
  readonly budgetForm = this.formBuilder.nonNullable.group({ categoryId: ['', Validators.required], amount: ['', Validators.required] });
  readonly selectedBudgets = computed(() => this.store.monthlyBudgets().filter((budget) => budget.month === this.selectedMonth()));
  readonly selectedExpenses = computed(() => {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    return expensesForMonth(this.store.expenses(), year, month, this.store.recurrenceExceptions());
  });
  readonly summary = computed(() => calculateBudgetSummary(this.selectedBudgets(), this.selectedExpenses(), this.store.categories()));
  readonly selectedMonthLabel = computed(() => {
    const [year, month] = this.selectedMonth().split('-').map(Number);
    return `${MONTH_NAMES[month - 1]} de ${year}`;
  });
  readonly formCategories = computed(() => {
    const editing = this.editingBudget();
    const active = this.store.activeCategories();
    const archived = editing ? this.store.categories().find((category) => category.id === editing.categoryId && category.archived) : undefined;
    return archived ? [...active, archived] : active;
  });

  setMonth(event: Event): void { this.selectedMonth.set((event.target as HTMLInputElement).value); this.feedback.set(null); }
  openCreate(): void { this.editingBudget.set(null); this.budgetForm.reset({ categoryId: '', amount: '' }); this.resetErrors(); this.formOpen.set(true); }
  openEdit(budget: MonthlyBudget): void { this.editingBudget.set(budget); this.budgetForm.reset({ categoryId: budget.categoryId, amount: centsToInputValue(budget.amountCents) }); this.resetErrors(); this.formOpen.set(true); }
  closeForm(): void { this.formOpen.set(false); this.editingBudget.set(null); }

  async submit(): Promise<void> {
    this.resetErrors();
    const raw = this.budgetForm.getRawValue();
    const amountCents = parseMoneyToCents(raw.amount);
    if (this.budgetForm.invalid || amountCents === null) {
      this.budgetForm.markAllAsTouched();
      if (amountCents === null) this.amountError.set('Introduza um limite válido e superior a zero.');
      return;
    }
    try {
      await this.store.saveBudget({ month: this.selectedMonth(), categoryId: raw.categoryId, amountCents }, this.editingBudget()?.id);
      this.closeForm();
      this.feedback.set('Orçamento guardado.');
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o orçamento.'); }
  }

  async copyPrevious(): Promise<void> {
    try {
      const copied = await this.store.copyPreviousBudget(this.selectedMonth());
      this.feedback.set(copied > 0 ? `${copied} ${copied === 1 ? 'limite copiado' : 'limites copiados'} do mês anterior.` : 'Não existem novos limites para copiar do mês anterior.');
    } catch { /* O erro global já está visível. */ }
  }

  async remove(budget: MonthlyBudget): Promise<void> {
    if (!confirm(`Remover o orçamento de ${this.categoryName(budget.categoryId)} em ${this.selectedMonthLabel()}?`)) return;
    try { await this.store.deleteBudget(budget.id); this.feedback.set('Orçamento removido.'); } catch { /* O erro global já está visível. */ }
  }

  statusLabel(status: 'normal' | 'attention' | 'exceeded'): string { return ({ normal: 'Dentro do limite', attention: 'Atenção: perto do limite', exceeded: 'Limite excedido' })[status]; }
  categoryList(categories: readonly Category[]): string { return categories.map((category) => category.name).join(', '); }
  private categoryName(id: string): string { return this.store.categories().find((category) => category.id === id)?.name ?? 'categoria'; }
  private resetErrors(): void { this.amountError.set(null); this.formError.set(null); }
}
