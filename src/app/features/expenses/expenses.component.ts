import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { startWith } from 'rxjs';
import { AppStore } from '../../core/stores/app.store';
import { Category, Expense } from '../../models/domain.models';
import { formatDate, todayDateString } from '../../shared/utils/date.utils';
import { centsToInputValue, formatCurrency, parseMoneyToCents } from '../../shared/utils/money.utils';
import { MONTH_NAMES, sumExpenses } from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-expenses',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page">
      <header class="page-header-row">
        <div>
          <p class="eyebrow">Despesas</p>
          <h1>Todos os movimentos</h1>
          <p class="page-intro">Pesquise, filtre e corrija os registos guardados neste dispositivo.</p>
        </div>
        <button class="btn btn-primary" type="button" (click)="openCreate()"><span>Nova despesa</span><span class="button-symbol" aria-hidden="true">+</span></button>
      </header>

      <section class="filters card-flat" aria-label="Filtros de despesas">
        <form [formGroup]="filterForm" class="filter-grid">
          <div class="field search-field">
            <label for="expense-search">Pesquisar descrição</label>
            <input id="expense-search" type="search" formControlName="search" placeholder="Ex.: supermercado">
          </div>
          <div class="field">
            <label for="expense-month">Mês</label>
            <select id="expense-month" formControlName="month">
              <option value="">Todos</option>
              @for (month of months; track $index) { <option [value]="$index + 1">{{ month }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="expense-year">Ano</label>
            <select id="expense-year" formControlName="year">
              <option value="">Todos</option>
              @for (year of availableYears(); track year) { <option [value]="year">{{ year }}</option> }
            </select>
          </div>
          <div class="field">
            <label for="filter-category">Categoria</label>
            <select id="filter-category" formControlName="categoryId">
              <option value="">Todas</option>
              @for (category of store.categories(); track category.id) {
                <option [value]="category.id">{{ category.name }}{{ category.archived ? ' (arquivada)' : '' }}</option>
              }
            </select>
          </div>
          <div class="field">
            <label for="filter-subcategory">Subcategoria</label>
            <select id="filter-subcategory" formControlName="subcategoryId">
              <option value="">Todas</option>
              @for (subcategory of filterSubcategories(); track subcategory.id) {
                <option [value]="subcategory.id">{{ subcategory.name }}</option>
              }
            </select>
          </div>
        </form>
        <div class="filter-footer">
          <button class="text-button" type="button" (click)="clearFilters()">Limpar filtros</button>
          <label class="sort-control">Ordenar
            <select [value]="sortDirection()" (change)="setSortDirection($event)">
              <option value="desc">Mais recentes</option>
              <option value="asc">Mais antigas</option>
            </select>
          </label>
        </div>
      </section>

      <div class="results-summary" aria-live="polite">
        <span>{{ filteredExpenses().length }} {{ filteredExpenses().length === 1 ? 'despesa' : 'despesas' }}</span>
        <strong>Total: {{ formatCurrency(filteredTotal()) }}</strong>
      </div>

      @if (store.expenses().length === 0) {
        <section class="empty-state">
          <h2>Ainda não existem despesas</h2>
          <p>Adicione a primeira despesa para começar a perceber quanto gasta e em que categorias.</p>
          <button class="btn btn-primary" type="button" (click)="openCreate()">Adicionar despesa</button>
        </section>
      } @else if (filteredExpenses().length === 0) {
        <section class="empty-state">
          <h2>Nenhuma despesa corresponde aos filtros</h2>
          <p>Altere o período, a categoria ou o texto de pesquisa.</p>
          <button class="btn btn-secondary" type="button" (click)="clearFilters()">Limpar filtros</button>
        </section>
      } @else {
        <section class="expense-list card" aria-label="Lista de despesas">
          @for (expense of filteredExpenses(); track expense.id) {
            <article class="expense-row">
              <div class="date-block"><strong>{{ expense.date.slice(8, 10) }}</strong><span>{{ monthShort(expense.date) }}</span></div>
              <div class="expense-main">
                <div class="expense-title-row">
                  <strong>{{ expense.description || categoryName(expense.categoryId) }}</strong>
                  <span class="expense-amount">{{ formatCurrency(expense.amountCents) }}</span>
                </div>
                <div class="expense-meta">
                  <span><i [style.background]="categoryColor(expense.categoryId)"></i>{{ categoryName(expense.categoryId) }}</span>
                  @if (expense.subcategoryId) { <span>{{ subcategoryName(expense.categoryId, expense.subcategoryId) }}</span> }
                  @if (expense.fixed) { <span class="status-badge recurring">Fixa mensal</span> }
                  @if (categoryArchived(expense.categoryId)) { <span class="status-badge archived">Categoria arquivada</span> }
                </div>
              </div>
              <div class="row-actions">
                <button class="btn btn-ghost btn-compact" type="button" (click)="openEdit(expense)">Editar</button>
                <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="remove(expense)">Eliminar</button>
              </div>
            </article>
          }
        </section>
      }
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="expense-form-title">
          <header class="modal-header">
            <div><h2 id="expense-form-title">{{ editingExpense() ? 'Editar despesa' : 'Nova despesa' }}</h2><p>Os campos assinalados são obrigatórios.</p></div>
            <button class="btn btn-ghost btn-compact" type="button" (click)="closeForm()" aria-label="Fechar formulário">Fechar</button>
          </header>
          <form [formGroup]="expenseForm" (ngSubmit)="submit()" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="expense-date">Data *</label>
                <input id="expense-date" type="date" formControlName="date" required>
                @if (expenseForm.controls.date.touched && expenseForm.controls.date.invalid) { <p class="field-error">Indique a data da despesa.</p> }
              </div>
              <div class="field">
                <label for="expense-amount">Valor em euros *</label>
                <input id="expense-amount" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>
                @if (amountError()) { <p class="field-error">{{ amountError() }}</p> }
              </div>
              <div class="field">
                <label for="expense-category">Categoria *</label>
                <select id="expense-category" formControlName="categoryId" (change)="categoryChanged($event)" required>
                  <option value="">Selecione</option>
                  @for (category of formCategories(); track category.id) {
                    <option [value]="category.id">{{ category.name }}{{ category.archived ? ' (arquivada)' : '' }}</option>
                  }
                </select>
                @if (expenseForm.controls.categoryId.touched && expenseForm.controls.categoryId.invalid) { <p class="field-error">Selecione uma categoria.</p> }
              </div>
              <div class="field">
                <label for="expense-subcategory">Subcategoria</label>
                <select id="expense-subcategory" formControlName="subcategoryId">
                  <option value="">Sem subcategoria</option>
                  @for (subcategory of formSubcategories(); track subcategory.id) {
                    <option [value]="subcategory.id">{{ subcategory.name }}{{ subcategory.archived ? ' (arquivada)' : '' }}</option>
                  }
                </select>
              </div>
              <div class="field wide">
                <label for="expense-description">Descrição</label>
                <input id="expense-description" type="text" formControlName="description" maxlength="140" placeholder="Ex.: compras da semana">
                <p class="helper">Opcional. Máximo de 140 caracteres.</p>
              </div>
              <label class="check-field wide">
                <input type="checkbox" formControlName="fixed">
                <span><strong>Despesa fixa mensal</strong><small>Será incluída automaticamente neste mês e nos meses seguintes.</small></span>
              </label>
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Guardar despesa' }}</button>
              <button class="btn btn-secondary" type="button" (click)="closeForm()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './expenses.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpensesComponent {
  readonly store = inject(AppStore);
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly months = MONTH_NAMES;
  readonly formatCurrency = formatCurrency;
  readonly formOpen = signal(false);
  readonly editingExpense = signal<Expense | null>(null);
  readonly selectedFormCategoryId = signal('');
  readonly amountError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly filterForm = this.formBuilder.nonNullable.group({
    search: [''], month: [''], year: [''], categoryId: [''], subcategoryId: [''],
  });
  readonly expenseForm = this.formBuilder.nonNullable.group({
    date: [todayDateString(), Validators.required],
    amount: ['', Validators.required],
    categoryId: ['', Validators.required],
    subcategoryId: [''],
    description: ['', Validators.maxLength(140)],
    fixed: [false],
  });
  readonly filterValue = toSignal(this.filterForm.valueChanges.pipe(startWith(this.filterForm.getRawValue())), {
    initialValue: this.filterForm.getRawValue(),
  });
  readonly availableYears = computed(() => [...new Set(this.store.expenses().map((expense) => Number(expense.date.slice(0, 4))))].sort((a, b) => b - a));
  readonly filterSubcategories = computed(() => {
    const categoryId = this.filterValue().categoryId;
    if (categoryId) return this.store.categories().find((category) => category.id === categoryId)?.subcategories ?? [];
    return this.store.categories().flatMap((category) => category.subcategories);
  });
  readonly filteredExpenses = computed(() => {
    const filters = this.filterValue();
    const search = (filters.search ?? '').trim().toLocaleLowerCase('pt-PT');
    return this.store.expenses()
      .filter((expense) => !search || (expense.description ?? '').toLocaleLowerCase('pt-PT').includes(search))
      .filter((expense) => !filters.month || Number(expense.date.slice(5, 7)) === Number(filters.month))
      .filter((expense) => !filters.year || Number(expense.date.slice(0, 4)) === Number(filters.year))
      .filter((expense) => !filters.categoryId || expense.categoryId === filters.categoryId)
      .filter((expense) => !filters.subcategoryId || expense.subcategoryId === filters.subcategoryId)
      .sort((a, b) => this.sortDirection() === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
  });
  readonly filteredTotal = computed(() => sumExpenses(this.filteredExpenses()));
  readonly formCategories = computed(() => {
    const active = this.store.activeCategories();
    const current = this.editingExpense();
    const selectedArchived = current ? this.store.categories().find((category) => category.id === current.categoryId && category.archived) : undefined;
    return selectedArchived ? [...active, selectedArchived] : active;
  });
  readonly formSubcategories = computed(() =>
    this.store.categories().find((category) => category.id === this.selectedFormCategoryId())?.subcategories
      .filter((subcategory) => !subcategory.archived || subcategory.id === this.editingExpense()?.subcategoryId) ?? [],
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.get('nova') === '1') this.openCreate(false);
    });
  }

  openCreate(updateUrl = true): void {
    this.editingExpense.set(null);
    this.selectedFormCategoryId.set('');
    this.expenseForm.reset({ date: todayDateString(), amount: '', categoryId: '', subcategoryId: '', description: '', fixed: false });
    this.amountError.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
    if (updateUrl) void this.router.navigate([], { relativeTo: this.route, queryParams: { nova: 1 }, replaceUrl: true });
  }

  openEdit(expense: Expense): void {
    this.editingExpense.set(expense);
    this.selectedFormCategoryId.set(expense.categoryId);
    this.expenseForm.reset({
      date: expense.date,
      amount: centsToInputValue(expense.amountCents),
      categoryId: expense.categoryId,
      subcategoryId: expense.subcategoryId ?? '',
      description: expense.description ?? '',
      fixed: expense.fixed,
    });
    this.amountError.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingExpense.set(null);
    if (this.route.snapshot.queryParamMap.has('nova')) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: { nova: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  categoryChanged(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.selectedFormCategoryId.set(value);
    this.expenseForm.controls.subcategoryId.setValue('');
  }

  async submit(): Promise<void> {
    this.amountError.set(null);
    this.formError.set(null);
    const raw = this.expenseForm.getRawValue();
    const cents = parseMoneyToCents(raw.amount);
    if (this.expenseForm.invalid || cents === null) {
      this.expenseForm.markAllAsTouched();
      if (cents === null) this.amountError.set('Introduza um valor válido e superior a zero, com até duas casas decimais.');
      return;
    }
    try {
      await this.store.saveExpense({
        date: raw.date,
        amountCents: cents,
        categoryId: raw.categoryId,
        fixed: raw.fixed,
        ...(raw.subcategoryId ? { subcategoryId: raw.subcategoryId } : {}),
        ...(raw.description.trim() ? { description: raw.description.trim() } : {}),
      }, this.editingExpense()?.id);
      this.closeForm();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar a despesa.');
    }
  }

  async remove(expense: Expense): Promise<void> {
    if (!confirm(`Eliminar a despesa de ${formatCurrency(expense.amountCents)} em ${formatDate(expense.date)}? Esta ação não pode ser anulada.`)) return;
    try { await this.store.deleteExpense(expense.id); } catch { /* Global error is already visible. */ }
  }

  clearFilters(): void {
    this.filterForm.reset({ search: '', month: '', year: '', categoryId: '', subcategoryId: '' });
  }

  setSortDirection(event: Event): void {
    this.sortDirection.set((event.target as HTMLSelectElement).value as 'asc' | 'desc');
  }

  categoryName(id: string): string { return this.category(id)?.name ?? 'Categoria indisponível'; }
  categoryColor(id: string): string { return this.category(id)?.color ?? '#68727d'; }
  categoryArchived(id: string): boolean { return this.category(id)?.archived ?? false; }
  subcategoryName(categoryId: string, subcategoryId: string): string {
    return this.category(categoryId)?.subcategories.find((subcategory) => subcategory.id === subcategoryId)?.name ?? 'Subcategoria indisponível';
  }
  monthShort(date: string): string { return MONTH_NAMES[Number(date.slice(5, 7)) - 1].slice(0, 3); }
  private category(id: string): Category | undefined { return this.store.categories().find((category) => category.id === id); }
}
