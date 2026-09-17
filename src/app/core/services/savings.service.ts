import { Injectable, inject } from '@angular/core';
import {
  IncomeKind,
  MonthlyIncome,
  SavingsGoal,
  SavingsGoalKind,
  Settings,
} from '../../models/domain.models';
import {
  INCOME_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
  SETTINGS_REPOSITORY,
} from '../repositories/repository.tokens';

export interface IncomeInput {
  name: string;
  kind: IncomeKind;
  amountCents: number;
  receivedMonth: string;
  fixed: boolean;
  active: boolean;
}

export interface SavingsGoalInput {
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string;
}

const incomeKinds = new Set<IncomeKind>(['salary', 'subsidy', 'freelance', 'other']);
const goalKinds = new Set<SavingsGoalKind>(['general', 'reserve', 'home', 'car', 'travel', 'education', 'other']);

@Injectable({ providedIn: 'root' })
export class SavingsService {
  private readonly incomes = inject(INCOME_REPOSITORY);
  private readonly goals = inject(SAVINGS_GOAL_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async createIncome(input: IncomeInput): Promise<MonthlyIncome> {
    this.validateIncome(input);
    const now = new Date().toISOString();
    const income: MonthlyIncome = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      amountCents: input.amountCents,
      receivedMonth: input.receivedMonth,
      fixed: input.fixed,
      active: input.active,
      createdAt: now,
      updatedAt: now,
    };
    await this.incomes.put(income);
    await this.registerChange();
    return income;
  }

  async updateIncome(id: string, input: IncomeInput): Promise<MonthlyIncome> {
    this.validateIncome(input);
    const current = await this.incomes.getById(id);
    if (!current) throw new Error('O rendimento que tentou editar já não existe.');
    const income: MonthlyIncome = {
      ...current,
      name: input.name.trim(),
      kind: input.kind,
      amountCents: input.amountCents,
      receivedMonth: input.receivedMonth,
      fixed: input.fixed,
      active: input.active,
      updatedAt: new Date().toISOString(),
    };
    await this.incomes.put(income);
    await this.registerChange();
    return income;
  }

  async deleteIncome(id: string): Promise<void> {
    if (!(await this.incomes.getById(id))) throw new Error('O rendimento já não existe.');
    await this.incomes.delete(id);
    await this.registerChange();
  }

  async createGoal(input: SavingsGoalInput): Promise<SavingsGoal> {
    this.validateGoal(input);
    const now = new Date().toISOString();
    const goal: SavingsGoal = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      targetAmountCents: input.targetAmountCents,
      currentAmountCents: input.currentAmountCents,
      monthlyContributionCents: input.monthlyContributionCents,
      createdAt: now,
      updatedAt: now,
      ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    };
    await this.goals.put(goal);
    await this.registerChange();
    return goal;
  }

  async updateGoal(id: string, input: SavingsGoalInput): Promise<SavingsGoal> {
    this.validateGoal(input);
    const current = await this.goals.getById(id);
    if (!current) throw new Error('O objetivo que tentou editar já não existe.');
    const goal: SavingsGoal = {
      ...current,
      name: input.name.trim(),
      kind: input.kind,
      targetAmountCents: input.targetAmountCents,
      currentAmountCents: input.currentAmountCents,
      monthlyContributionCents: input.monthlyContributionCents,
      updatedAt: new Date().toISOString(),
      ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    };
    if (!input.targetDate) delete goal.targetDate;
    await this.goals.put(goal);
    await this.registerChange();
    return goal;
  }

  async adjustGoal(id: string, deltaCents: number): Promise<SavingsGoal> {
    if (!Number.isSafeInteger(deltaCents) || deltaCents === 0) throw new Error('Indique um valor válido.');
    const current = await this.goals.getById(id);
    if (!current) throw new Error('O objetivo já não existe.');
    const nextAmount = current.currentAmountCents + deltaCents;
    if (nextAmount < 0) throw new Error('Não pode retirar mais do que o valor atualmente poupado.');
    const goal = { ...current, currentAmountCents: nextAmount, updatedAt: new Date().toISOString() };
    await this.goals.put(goal);
    await this.registerChange();
    return goal;
  }

  async deleteGoal(id: string): Promise<void> {
    if (!(await this.goals.getById(id))) throw new Error('O objetivo já não existe.');
    await this.goals.delete(id);
    await this.registerChange();
  }

  private validateIncome(input: IncomeInput): void {
    if (!input.name.trim() || input.name.trim().length > 80) throw new Error('Indique um nome com até 80 caracteres.');
    if (!incomeKinds.has(input.kind)) throw new Error('Selecione um tipo de rendimento válido.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O rendimento tem de ser superior a zero.');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.receivedMonth)) throw new Error('Indique um mês de recebimento válido.');
  }

  private validateGoal(input: SavingsGoalInput): void {
    if (!input.name.trim() || input.name.trim().length > 80) throw new Error('Indique um nome com até 80 caracteres.');
    if (!goalKinds.has(input.kind)) throw new Error('Selecione um tipo de objetivo válido.');
    if (!Number.isSafeInteger(input.targetAmountCents) || input.targetAmountCents <= 0) throw new Error('O objetivo tem de ser superior a zero.');
    if (!Number.isSafeInteger(input.currentAmountCents) || input.currentAmountCents < 0) throw new Error('O valor já poupado não pode ser negativo.');
    if (!Number.isSafeInteger(input.monthlyContributionCents) || input.monthlyContributionCents < 0) throw new Error('O reforço mensal não pode ser negativo.');
    if (input.targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate)) throw new Error('Indique uma data objetivo válida.');
  }

  private async registerChange(): Promise<void> {
    const current = await this.settings.get();
    if (!current) return;
    const next: Settings = { ...current, changesSinceExport: current.changesSinceExport + 1 };
    await this.settings.put(next);
  }
}
