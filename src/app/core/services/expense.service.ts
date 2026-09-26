import { Injectable, inject } from '@angular/core';
import { Expense, RecurrenceException, RecurrenceExceptionChanges, RecurrenceRule, Settings } from '../../models/domain.models';
import { isDateString } from '../../shared/utils/date.utils';
import { validateRecurrenceRule } from '../../shared/utils/recurrence.utils';
import { createPocketBaseId } from '../pocketbase/pocketbase.ids';
import {
  CATEGORY_REPOSITORY,
  EXPENSE_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SETTINGS_REPOSITORY,
} from '../repositories/repository.tokens';

export interface ExpenseInput {
  date: string;
  amountCents: number;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
  recurrence?: RecurrenceRule;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly expenses = inject(EXPENSE_REPOSITORY);
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly exceptions = inject(RECURRENCE_EXCEPTION_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async create(input: ExpenseInput): Promise<Expense> {
    await this.validate(input);
    const now = new Date().toISOString();
    const expense: Expense = {
      id: createPocketBaseId(),
      date: input.date,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      createdAt: now,
      updatedAt: now,
      ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
    };
    await this.expenses.put(expense);
    await this.registerChange();
    return expense;
  }

  async update(id: string, input: ExpenseInput): Promise<Expense> {
    await this.validate(input);
    const current = await this.expenses.getById(id);
    if (!current) throw new Error('A despesa que tentou editar já não existe.');
    const expense: Expense = {
      ...current,
      date: input.date,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      updatedAt: new Date().toISOString(),
      ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
    };
    if (!input.subcategoryId) delete expense.subcategoryId;
    if (!input.description?.trim()) delete expense.description;
    if (!input.recurrence) delete expense.recurrence;
    await this.expenses.put(expense);
    await this.registerChange();
    return expense;
  }

  async overrideOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    const series = await this.expenses.getById(seriesId);
    if (!series?.recurrence) throw new Error('A série de despesas já não existe.');
    const input: ExpenseInput = {
      date: changes.date ?? occurrenceDate,
      amountCents: changes.amountCents ?? series.amountCents,
      categoryId: changes.categoryId ?? series.categoryId,
      ...(changes.subcategoryId ? { subcategoryId: changes.subcategoryId } : {}),
      ...(changes.description ? { description: changes.description } : {}),
    };
    await this.validate(input);
    const now = new Date().toISOString();
    const exception: RecurrenceException = {
      id: createPocketBaseId(),
      seriesType: 'expense',
      seriesId,
      occurrenceDate,
      action: 'override',
      changes,
      createdAt: now,
      updatedAt: now,
    };
    await this.exceptions.put(exception);
    await this.registerChange();
  }

  async skipOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    const series = await this.expenses.getById(seriesId);
    if (!series?.recurrence) throw new Error('A série de despesas já não existe.');
    const now = new Date().toISOString();
    await this.exceptions.put({
      id: createPocketBaseId(),
      seriesType: 'expense',
      seriesId,
      occurrenceDate,
      action: 'skip',
      createdAt: now,
      updatedAt: now,
    });
    await this.registerChange();
  }

  async delete(id: string): Promise<void> {
    if (!(await this.expenses.getById(id))) throw new Error('A despesa já não existe.');
    await this.expenses.delete(id);
    await this.registerChange();
  }

  private async validate(input: ExpenseInput): Promise<void> {
    if (!isDateString(input.date)) throw new Error('Indique uma data válida.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor tem de ser superior a zero.');
    if (input.recurrence && (!validateRecurrenceRule(input.recurrence) || input.recurrence.startDate !== input.date)) {
      throw new Error('A regra de recorrência não é válida.');
    }
    const category = await this.categories.getById(input.categoryId);
    if (!category) throw new Error('A categoria selecionada não existe.');
    if (input.subcategoryId && !category.subcategories.some((item) => item.id === input.subcategoryId)) {
      throw new Error('A subcategoria não pertence à categoria selecionada.');
    }
  }

  private async registerChange(): Promise<void> {
    const current = await this.settings.get();
    if (!current) return;
    const next: Settings = { ...current, changesSinceExport: current.changesSinceExport + 1 };
    await this.settings.put(next);
  }
}
