import { Injectable, inject } from '@angular/core';
import { MonthlyBudget, Settings } from '../../models/domain.models';
import { previousMonth } from '../../shared/utils/statistics.utils';
import { createPocketBaseId } from '../pocketbase/pocketbase.ids';
import { BUDGET_REPOSITORY, CATEGORY_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';

export interface BudgetInput {
  month: string;
  categoryId: string;
  amountCents: number;
}

@Injectable({ providedIn: 'root' })
export class BudgetService {
  private readonly budgets = inject(BUDGET_REPOSITORY);
  private readonly categories = inject(CATEGORY_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async save(input: BudgetInput, id?: string): Promise<MonthlyBudget> {
    await this.validate(input);
    const existing = id ? await this.budgets.getById(id) : undefined;
    const duplicate = (await this.budgets.getByMonth(input.month))
      .find((item) => item.categoryId === input.categoryId && item.id !== id);
    if (duplicate) throw new Error('Já existe um orçamento para esta categoria neste mês.');
    if (id && !existing) throw new Error('O orçamento que tentou editar já não existe.');
    const now = new Date().toISOString();
    const budget: MonthlyBudget = {
      id: existing?.id ?? createPocketBaseId(),
      month: input.month,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.budgets.put(budget);
    await this.registerChange();
    return budget;
  }

  async delete(id: string): Promise<void> {
    if (!(await this.budgets.getById(id))) throw new Error('O orçamento já não existe.');
    await this.budgets.delete(id);
    await this.registerChange();
  }

  async copyPreviousMonth(month: string): Promise<number> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Indique um mês válido.');
    const [year, monthNumber] = month.split('-').map(Number);
    const previous = previousMonth(year, monthNumber);
    const previousKey = `${previous.year}-${String(previous.month).padStart(2, '0')}`;
    const [source, current] = await Promise.all([this.budgets.getByMonth(previousKey), this.budgets.getByMonth(month)]);
    const existingCategoryIds = new Set(current.map((item) => item.categoryId));
    const now = new Date().toISOString();
    const copies = source.filter((item) => !existingCategoryIds.has(item.categoryId)).map((item): MonthlyBudget => ({
      id: createPocketBaseId(),
      month,
      categoryId: item.categoryId,
      amountCents: item.amountCents,
      createdAt: now,
      updatedAt: now,
    }));
    if (copies.length > 0) {
      await this.budgets.bulkPut(copies);
      await this.registerChange();
    }
    return copies.length;
  }

  private async validate(input: BudgetInput): Promise<void> {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new Error('Indique um mês válido.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O limite tem de ser superior a zero.');
    if (!(await this.categories.getById(input.categoryId))) throw new Error('A categoria selecionada não existe.');
  }

  private async registerChange(): Promise<void> {
    const current = await this.settings.get();
    if (!current) return;
    const next: Settings = { ...current, changesSinceExport: current.changesSinceExport + 1 };
    await this.settings.put(next);
  }
}
