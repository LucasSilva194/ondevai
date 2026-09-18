import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { startWith } from 'rxjs';
import { AppStore } from '../../core/stores/app.store';
import { Category, Expense, ExpenseOccurrence, RecurrenceFrequency, RecurrenceRule } from '../../models/domain.models';
import { formatDate, todayDateString } from '../../shared/utils/date.utils';
import { centsToInputValue, formatCurrency, parseMoneyToCents } from '../../shared/utils/money.utils';
import { recurrenceLabel } from '../../shared/utils/recurrence.utils';
import { expensesForMonth, MONTH_NAMES, sumExpenses } from '../../shared/utils/statistics.utils';

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
                  @if (expense.recurrence) { <span class="status-badge recurring">{{ recurrenceLabel(expense.recurrence) }}</span> }
                  @if (expense.source === 'override') { <span class="status-badge recurring">Ocorrência editada</span> }
                  @if (expense.source === 'one-off') { <span class="status-badge">Pontual</span> }
                  @if (categoryArchived(expense.categoryId)) { <span class="status-badge archived">Categoria arquivada</span> }
                </div>
              </div>
              <div class="row-actions">
                @if (expense.seriesId && exactPeriodSelected()) {
                  <button class="btn btn-ghost btn-compact" type="button" (click)="openOccurrenceEdit(expense)">Editar ocorrência</button>
                  <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="omitOccurrence(expense)">Omitir</button>
                }
                <button class="btn btn-ghost btn-compact" type="button" (click)="openEdit(expense)">{{ expense.seriesId ? 'Editar série' : 'Editar' }}</button>
                <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="remove(expense)">{{ expense.seriesId ? 'Eliminar série' : 'Eliminar' }}</button>
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
            <div><h2 id="expense-form-title">{{ editingOccurrence() ? 'Editar ocorrência' : editingExpense() ? 'Editar despesa' : 'Nova despesa' }}</h2><p>{{ editingOccurrence() ? 'Esta alteração aplica-se apenas à data selecionada.' : 'Os campos assinalados são obrigatórios.' }}</p></div>
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
              @if (!editingOccurrence()) {
                <div class="field">
                  <label for="expense-recurrence">Recorrência</label>
                  <select id="expense-recurrence" formControlName="recurrenceType">
                    <option value="none">Movimento pontual</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option>
                  </select>
                </div>
                @if (expenseForm.controls.recurrenceType.value !== 'none') {
                  <div class="field"><label for="expense-interval">Intervalo</label><input id="expense-interval" type="number" min="1" max="99" formControlName="interval"><p class="helper">Ex.: 2 significa a cada duas semanas, meses ou anos.</p></div>
                  <div class="field"><label for="expense-end">Data de fim</label><input id="expense-end" type="date" formControlName="endDate" [min]="expenseForm.controls.date.value"></div>
                  <div class="field"><label for="expense-status">Estado</label><select id="expense-status" formControlName="recurrenceStatus"><option value="active">Ativa</option><option value="paused">Pausada</option></select></div>
                }
              }
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
  readonly editingOccurrence = signal<ExpenseOccurrence | null>(null);
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
    recurrenceType: ['none' as 'none' | RecurrenceFrequency],
    interval: [1, [Validators.required, Validators.min(1), Validators.max(99)]],
    endDate: [''],
    recurrenceStatus: ['active' as 'active' | 'paused'],
  });
  readonly filterValue = toSignal(this.filterForm.valueChanges.pipe(startWith(this.filterForm.getRawValue())), {
    initialValue: this.filterForm.getRawValue(),
  });
  readonly availableYears = computed(() => [...new Set([new Date().getFullYear(), ...this.store.expenses().map((expense) => Number(expense.date.slice(0, 4)))])].sort((a, b) => b - a));
  readonly filterSubcategories = computed(() => {
    const categoryId = this.filterValue().categoryId;
    if (categoryId) return this.store.categories().find((category) => category.id === categoryId)?.subcategories ?? [];
    return this.store.categories().flatMap((category) => category.subcategories);
  });
  readonly exactPeriodSelected = computed(() => Boolean(this.filterValue().month && this.filterValue().year));
  readonly displayedExpenses = computed((): ExpenseOccurrence[] => {
    const filters = this.filterValue();
    if (filters.month && filters.year) {
      return expensesForMonth(this.store.expenses(), Number(filters.year), Number(filters.month), this.store.recurrenceExceptions());
    }
    return this.store.expenses().map((expense) => ({
      ...expense,
      occurrenceKey: expense.recurrence ? `expense:${expense.id}:${expense.date}` : `expense:${expense.id}`,
      source: expense.recurrence ? 'series' : 'one-off',
      ...(expense.recurrence ? { seriesId: expense.id } : {}),
    }));
  });
  readonly filteredExpenses = computed(() => {
    const filters = this.filterValue();
    const search = (filters.search ?? '').trim().toLocaleLowerCase('pt-PT');
    return this.displayedExpenses()
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
    const categoryId = this.editingExpense()?.categoryId ?? this.editingOccurrence()?.categoryId;
    const selectedArchived = categoryId ? this.store.categories().find((category) => category.id === categoryId && category.archived) : undefined;
    return selectedArchived ? [...active, selectedArchived] : active;
  });
  readonly formSubcategories = computed(() =>
    this.store.categories().find((category) => category.id === this.selectedFormCategoryId())?.subcategories
      .filter((subcategory) => !subcategory.archived || subcategory.id === (this.editingExpense()?.subcategoryId ?? this.editingOccurrence()?.subcategoryId)) ?? [],
  );

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params.get('nova') === '1') this.openCreate(false);
    });
  }

  openCreate(updateUrl = true): void {
    this.editingExpense.set(null);
    this.editingOccurrence.set(null);
    this.selectedFormCategoryId.set('');
    this.expenseForm.reset({ date: todayDateString(), amount: '', categoryId: '', subcategoryId: '', description: '', recurrenceType: 'none', interval: 1, endDate: '', recurrenceStatus: 'active' });
    this.amountError.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
    if (updateUrl) void this.router.navigate([], { relativeTo: this.route, queryParams: { nova: 1 }, replaceUrl: true });
  }

  openEdit(expense: Expense | ExpenseOccurrence): void {
    const base = 'seriesId' in expense && expense.seriesId
      ? this.store.expenses().find((item) => item.id === expense.seriesId)
      : this.store.expenses().find((item) => item.id === expense.id);
    if (!base) return;
    this.editingOccurrence.set(null);
    this.editingExpense.set(base);
    this.selectedFormCategoryId.set(base.categoryId);
    this.expenseForm.reset({
      date: base.date,
      amount: centsToInputValue(base.amountCents),
      categoryId: base.categoryId,
      subcategoryId: base.subcategoryId ?? '',
      description: base.description ?? '',
      recurrenceType: base.recurrence?.frequency ?? 'none',
      interval: base.recurrence?.interval ?? 1,
      endDate: base.recurrence?.endDate ?? '',
      recurrenceStatus: base.recurrence?.status ?? 'active',
    });
    this.amountError.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  openOccurrenceEdit(expense: ExpenseOccurrence): void {
    this.editingExpense.set(null);
    this.editingOccurrence.set(expense);
    this.selectedFormCategoryId.set(expense.categoryId);
    this.expenseForm.reset({ date: expense.date, amount: centsToInputValue(expense.amountCents), categoryId: expense.categoryId, subcategoryId: expense.subcategoryId ?? '', description: expense.description ?? '', recurrenceType: 'none', interval: 1, endDate: '', recurrenceStatus: 'active' });
    this.amountError.set(null);
    this.formError.set(null);
    this.formOpen.set(true);
  }

  closeForm(): void {
    this.formOpen.set(false);
    this.editingExpense.set(null);
    this.editingOccurrence.set(null);
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
      const occurrence = this.editingOccurrence();
      if (occurrence?.seriesId) {
        await this.store.overrideExpenseOccurrence(occurrence.seriesId, occurrence.occurrenceKey.slice(-10), {
          date: raw.date,
          amountCents: cents,
          categoryId: raw.categoryId,
          ...(raw.subcategoryId ? { subcategoryId: raw.subcategoryId } : {}),
          description: raw.description.trim(),
        });
      } else {
        const recurrence = this.buildRecurrence(raw.date, raw.recurrenceType, raw.interval, raw.endDate, raw.recurrenceStatus);
        await this.store.saveExpense({
        date: raw.date,
        amountCents: cents,
        categoryId: raw.categoryId,
        ...(raw.subcategoryId ? { subcategoryId: raw.subcategoryId } : {}),
        ...(raw.description.trim() ? { description: raw.description.trim() } : {}),
        ...(recurrence ? { recurrence } : {}),
        }, this.editingExpense()?.id);
      }
      this.closeForm();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar a despesa.');
    }
  }

  async remove(expense: Expense | ExpenseOccurrence): Promise<void> {
    const id = 'seriesId' in expense && expense.seriesId ? expense.seriesId : expense.id;
    if (!confirm(`Eliminar a despesa de ${formatCurrency(expense.amountCents)} em ${formatDate(expense.date)}? Esta ação não pode ser anulada.`)) return;
    try { await this.store.deleteExpense(id); } catch { /* Global error is already visible. */ }
  }

  async omitOccurrence(expense: ExpenseOccurrence): Promise<void> {
    if (!expense.seriesId || !confirm(`Omitir apenas a ocorrência de ${formatDate(expense.date)}?`)) return;
    try { await this.store.skipExpenseOccurrence(expense.seriesId, expense.occurrenceKey.slice(-10)); } catch { /* O erro global já está visível. */ }
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
  readonly recurrenceLabel = recurrenceLabel;
  private buildRecurrence(date: string, type: 'none' | RecurrenceFrequency, interval: number, endDate: string, status: 'active' | 'paused'): RecurrenceRule | undefined {
    if (type === 'none') return undefined;
    const pausedFrom = status === 'paused' ? (date > todayDateString() ? date : todayDateString()) : undefined;
    return { frequency: type, interval, startDate: date, status, ...(endDate ? { endDate } : {}), ...(pausedFrom ? { pausedFrom } : {}) };
  }
  private category(id: string): Category | undefined { return this.store.categories().find((category) => category.id === id); }
}
