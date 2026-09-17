import { Injectable, inject } from '@angular/core';
import { Expense, Settings } from '../../models/domain.models';
import { CATEGORY_REPOSITORY, EXPENSE_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';

export interface ExpenseInput {
  date: string;
  amountCents: number;
  categoryId: string;
  subcategoryId?: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly expenses = inject(EXPENSE_REPOSITORY);
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async create(input: ExpenseInput): Promise<Expense> {
    await this.validate(input);
    const now = new Date().toISOString();
    const expense: Expense = {
      id: crypto.randomUUID(),
      date: input.date,
      amountCents: input.amountCents,
      categoryId: input.categoryId,
      createdAt: now,
      updatedAt: now,
      ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
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
    };
    if (!input.subcategoryId) delete expense.subcategoryId;
    if (!input.description?.trim()) delete expense.description;
    await this.expenses.put(expense);
    await this.registerChange();
    return expense;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.expenses.getById(id))) throw new Error('A despesa já não existe.');
    await this.expenses.delete(id);
    await this.registerChange();
  }

  private async validate(input: ExpenseInput): Promise<void> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Indique uma data válida.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor tem de ser superior a zero.');
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
