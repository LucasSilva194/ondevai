import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../../core/stores/app.store';
import { ModalShellComponent } from '../../../shared/components/common/modal-shell.component';
import { RecurrenceFrequency, RecurrenceRule } from '../../../models/domain.models';
import { todayDateString } from '../../../shared/utils/date.utils';
import { parseMoneyToCents } from '../../../shared/utils/money.utils';

@Component({
  selector: 'app-expense-create-modal',
  standalone: true,
  imports: [ReactiveFormsModule, ModalShellComponent],
  template: `
    @if (open) {
      <app-modal-shell labelledBy="quick-expense-title" (closeRequest)="close()">
        <header class="modal-header">
          <div><h2 id="quick-expense-title">Nova despesa</h2><p>Os campos assinalados são obrigatórios.</p></div>
          <button class="btn btn-ghost btn-compact" type="button" (click)="close()" aria-label="Fechar formulário">Fechar</button>
        </header>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="form-grid">
            <div class="field"><label for="quick-expense-date">Data *</label><input id="quick-expense-date" name="date" autocomplete="off" type="date" formControlName="date" required></div>
            <div class="field">
              <label for="quick-expense-amount">Valor em euros *</label>
              <input id="quick-expense-amount" name="amount" autocomplete="off" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>
              @if (amountError()) { <p class="field-error">{{ amountError() }}</p> }
            </div>
            <div class="field">
              <label for="quick-expense-category">Categoria *</label>
              <select id="quick-expense-category" formControlName="categoryId" (change)="categoryChanged($event)" required>
                <option value="">Selecione</option>
                @for (category of store.activeCategories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }
              </select>
              @if (form.controls.categoryId.touched && form.controls.categoryId.invalid) { <p class="field-error">Selecione uma categoria.</p> }
            </div>
            <details class="expense-more-details">
              <summary>Mais detalhes <span>Descrição, comerciante, etiquetas e recorrência</span></summary>
              <div class="form-grid">
                <div class="field">
                  <label for="quick-expense-subcategory">Subcategoria</label>
                  <select id="quick-expense-subcategory" formControlName="subcategoryId">
                    <option value="">Sem subcategoria</option>
                    @for (subcategory of subcategories(); track subcategory.id) { <option [value]="subcategory.id">{{ subcategory.name }}</option> }
                  </select>
                </div>
                <div class="field"><label for="quick-expense-description">Descrição</label><input id="quick-expense-description" name="description" autocomplete="off" type="text" formControlName="description" maxlength="140" placeholder="Ex.: compras da semana"></div>
                <div class="field"><label for="quick-expense-merchant">Comerciante</label><input id="quick-expense-merchant" name="merchant" autocomplete="off" type="text" formControlName="merchant" maxlength="100" placeholder="Ex.: mercearia"></div>
                <div class="field"><label for="quick-expense-tags">Etiquetas</label><input id="quick-expense-tags" name="tags" autocomplete="off" type="text" formControlName="tags" maxlength="329" placeholder="Ex.: casa, mensal"><p class="helper">Separe até 10 etiquetas por vírgulas.</p></div>
                <div class="field">
                  <label for="quick-expense-recurrence">Recorrência</label>
                  <select id="quick-expense-recurrence" formControlName="recurrenceType"><option value="none">Movimento pontual</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option></select>
                </div>
                @if (form.controls.recurrenceType.value !== 'none') {
                  <div class="field"><label for="quick-expense-interval">Intervalo</label><input id="quick-expense-interval" name="interval" autocomplete="off" type="number" min="1" max="99" formControlName="interval"></div>
                  <div class="field"><label for="quick-expense-end">Data de fim</label><input id="quick-expense-end" name="endDate" autocomplete="off" type="date" formControlName="endDate" [min]="form.controls.date.value"></div>
                  <div class="field"><label for="quick-expense-status">Estado</label><select id="quick-expense-status" formControlName="recurrenceStatus"><option value="active">Ativa</option><option value="paused">Pausada</option></select></div>
                }
              </div>
            </details>
          </div>
          @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
          <div class="button-row form-actions">
            <button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar…' : 'Guardar despesa' }}</button>
            <button class="btn btn-secondary" type="button" (click)="close()">Cancelar</button>
          </div>
        </form>
      </app-modal-shell>
    }
  `,
  styleUrl: '../pages/expenses.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseCreateModalComponent {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();

  readonly store = inject(AppStore);
  private readonly formBuilder = inject(FormBuilder);
  readonly amountError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly selectedCategoryId = signal('');
  readonly form = this.formBuilder.nonNullable.group({
    date: [todayDateString(), Validators.required],
    amount: ['', Validators.required],
    categoryId: ['', Validators.required],
    subcategoryId: [''],
    description: ['', Validators.maxLength(140)],
    merchant: ['', Validators.maxLength(100)],
    tags: [''],
    recurrenceType: ['none' as 'none' | RecurrenceFrequency],
    interval: [1, [Validators.required, Validators.min(1), Validators.max(99)]],
    endDate: [''],
    recurrenceStatus: ['active' as 'active' | 'paused'],
  });
  readonly subcategories = computed(() => this.store.categories().find((category) => category.id === this.selectedCategoryId())?.subcategories.filter((item) => !item.archived) ?? []);

  close(): void {
    this.amountError.set(null);
    this.formError.set(null);
    this.form.reset({ date: todayDateString(), amount: '', categoryId: '', subcategoryId: '', description: '', merchant: '', tags: '', recurrenceType: 'none', interval: 1, endDate: '', recurrenceStatus: 'active' });
    this.selectedCategoryId.set('');
    this.closed.emit();
  }

  categoryChanged(event: Event): void {
    this.selectedCategoryId.set((event.target as HTMLSelectElement).value);
    this.form.controls.subcategoryId.setValue('');
  }

  async submit(): Promise<void> {
    this.amountError.set(null);
    this.formError.set(null);
    const raw = this.form.getRawValue();
    const amountCents = parseMoneyToCents(raw.amount);
    if (this.form.invalid || amountCents === null) {
      this.form.markAllAsTouched();
      if (amountCents === null) this.amountError.set('Introduza um valor válido e superior a zero, com até duas casas decimais.');
      return;
    }
    try {
      const recurrence = this.buildRecurrence(raw.date, raw.recurrenceType, raw.interval, raw.endDate, raw.recurrenceStatus);
      const tags = [...new Set(raw.tags.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 10);
      await this.store.saveExpense({
        date: raw.date,
        amountCents,
        categoryId: raw.categoryId,
        ...(raw.subcategoryId ? { subcategoryId: raw.subcategoryId } : {}),
        ...(raw.description.trim() ? { description: raw.description.trim() } : {}),
        ...(raw.merchant.trim() ? { merchant: raw.merchant.trim() } : {}),
        ...(tags.length ? { tags } : {}),
        ...(recurrence ? { recurrence } : {}),
      });
      this.form.reset({ date: todayDateString(), amount: '', categoryId: '', subcategoryId: '', description: '', merchant: '', tags: '', recurrenceType: 'none', interval: 1, endDate: '', recurrenceStatus: 'active' });
      this.selectedCategoryId.set('');
      this.close();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar a despesa.');
    }
  }

  private buildRecurrence(date: string, type: 'none' | RecurrenceFrequency, interval: number, endDate: string, status: 'active' | 'paused'): RecurrenceRule | undefined {
    if (type === 'none') return undefined;
    const today = todayDateString();
    const pausedFrom = status === 'paused' ? (date > today ? date : today) : undefined;
    return { frequency: type, interval, startDate: date, status, ...(endDate ? { endDate } : {}), ...(pausedFrom ? { pausedFrom } : {}) };
  }
}
