import { Injectable, inject } from '@angular/core';
import {
  IncomeKind,
  MonthlyIncome,
  RecurrenceException,
  RecurrenceExceptionChanges,
  RecurrenceRule,
  SavingsGoal,
  SavingsGoalKind,
  SavingsTransaction,
  SavingsTransactionType,
  Settings,
} from '../../models/domain.models';
import { isDateString, todayDateString } from '../../shared/utils/date.utils';
import { validateRecurrenceRule } from '../../shared/utils/recurrence.utils';
import {
  INCOME_REPOSITORY,
  RECURRENCE_EXCEPTION_REPOSITORY,
  SAVINGS_GOAL_REPOSITORY,
  SETTINGS_REPOSITORY,
} from '../repositories/repository.tokens';

export interface IncomeInput {
  name: string;
  kind: IncomeKind;
  amountCents: number;
  date: string;
  recurrence?: RecurrenceRule;
}

export interface SavingsGoalInput {
  name: string;
  kind: SavingsGoalKind;
  targetAmountCents: number;
  currentAmountCents: number;
  monthlyContributionCents: number;
  targetDate?: string;
}

export interface SavingsTransactionInput {
  type: Exclude<SavingsTransactionType, 'opening'> | SavingsTransactionType;
  amountCents: number;
  effectiveDate: string;
  note?: string;
}

const incomeKinds = new Set<IncomeKind>(['salary', 'subsidy', 'freelance', 'other']);
const goalKinds = new Set<SavingsGoalKind>(['general', 'reserve', 'home', 'car', 'travel', 'education', 'other']);
const transactionKinds = new Set<SavingsTransactionType>(['opening', 'deposit', 'withdrawal']);

@Injectable({ providedIn: 'root' })
export class SavingsService {
  private readonly incomes = inject(INCOME_REPOSITORY);
  private readonly goals = inject(SAVINGS_GOAL_REPOSITORY);
  private readonly exceptions = inject(RECURRENCE_EXCEPTION_REPOSITORY);
  private readonly settings = inject(SETTINGS_REPOSITORY);

  async createIncome(input: IncomeInput): Promise<MonthlyIncome> {
    this.validateIncome(input);
    const now = new Date().toISOString();
    const income: MonthlyIncome = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      kind: input.kind,
      amountCents: input.amountCents,
      date: input.date,
      createdAt: now,
      updatedAt: now,
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
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
      date: input.date,
      updatedAt: new Date().toISOString(),
      ...(input.recurrence ? { recurrence: input.recurrence } : {}),
    };
    if (!input.recurrence) delete income.recurrence;
    await this.incomes.put(income);
    await this.registerChange();
    return income;
  }

  async overrideIncomeOccurrence(seriesId: string, occurrenceDate: string, changes: RecurrenceExceptionChanges): Promise<void> {
    const series = await this.incomes.getById(seriesId);
    if (!series?.recurrence) throw new Error('A série de rendimentos já não existe.');
    this.validateIncome({
      name: changes.name ?? series.name,
      kind: changes.kind ?? series.kind,
      amountCents: changes.amountCents ?? series.amountCents,
      date: changes.date ?? occurrenceDate,
    });
    const now = new Date().toISOString();
    const exception: RecurrenceException = {
      id: `income:${seriesId}:${occurrenceDate}`,
      seriesType: 'income',
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

  async skipIncomeOccurrence(seriesId: string, occurrenceDate: string): Promise<void> {
    if (!(await this.incomes.getById(seriesId))?.recurrence) throw new Error('A série de rendimentos já não existe.');
    const now = new Date().toISOString();
    await this.exceptions.put({
      id: `income:${seriesId}:${occurrenceDate}`,
      seriesType: 'income',
      seriesId,
      occurrenceDate,
      action: 'skip',
      createdAt: now,
      updatedAt: now,
    });
    await this.registerChange();
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
    const opening = input.currentAmountCents > 0
      ? this.buildTransaction(goal.id, { type: 'opening', amountCents: input.currentAmountCents, effectiveDate: todayDateString(), note: 'Saldo inicial' }, now)
      : undefined;
    await this.goals.createGoal(goal, opening);
    await this.registerChange();
    return goal;
  }

  async updateGoal(id: string, input: SavingsGoalInput): Promise<SavingsGoal> {
    this.validateGoal(input);
    const current = await this.goals.getById(id);
    if (!current) throw new Error('O objetivo que tentou editar já não existe.');
    const now = new Date().toISOString();
    const difference = input.currentAmountCents - current.currentAmountCents;
    const adjustment = difference === 0 ? undefined : this.buildTransaction(id, {
      type: difference > 0 ? 'deposit' : 'withdrawal',
      amountCents: Math.abs(difference),
      effectiveDate: todayDateString(),
      note: 'Ajuste registado ao editar o objetivo',
    }, now);
    const goal: SavingsGoal = {
      ...current,
      name: input.name.trim(),
      kind: input.kind,
      targetAmountCents: input.targetAmountCents,
      currentAmountCents: input.currentAmountCents,
      monthlyContributionCents: input.monthlyContributionCents,
      updatedAt: now,
      ...(input.targetDate ? { targetDate: input.targetDate } : {}),
    };
    if (!input.targetDate) delete goal.targetDate;
    await this.goals.updateGoal(goal, adjustment);
    await this.registerChange();
    return goal;
  }

  async createTransaction(goalId: string, input: SavingsTransactionInput): Promise<SavingsTransaction> {
    this.validateTransaction(input);
    const now = new Date().toISOString();
    const transaction = this.buildTransaction(goalId, input, now);
    await this.goals.addTransaction(transaction);
    await this.registerChange();
    return transaction;
  }

  async updateTransaction(id: string, goalId: string, input: SavingsTransactionInput): Promise<SavingsTransaction> {
    this.validateTransaction(input);
    const current = (await this.goals.getTransactions()).find((item) => item.id === id);
    if (!current) throw new Error('O movimento já não existe.');
    const transaction: SavingsTransaction = {
      ...current,
      goalId,
      type: input.type,
      amountCents: input.amountCents,
      effectiveDate: input.effectiveDate,
      updatedAt: new Date().toISOString(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };
    if (!input.note?.trim()) delete transaction.note;
    await this.goals.updateTransaction(transaction);
    await this.registerChange();
    return transaction;
  }

  async deleteTransaction(id: string): Promise<void> {
    await this.goals.deleteTransaction(id);
    await this.registerChange();
  }

  async adjustGoal(id: string, deltaCents: number, effectiveDate = todayDateString(), note?: string): Promise<SavingsTransaction> {
    if (!Number.isSafeInteger(deltaCents) || deltaCents === 0) throw new Error('Indique um valor válido.');
    return this.createTransaction(id, {
      type: deltaCents > 0 ? 'deposit' : 'withdrawal',
      amountCents: Math.abs(deltaCents),
      effectiveDate,
      ...(note?.trim() ? { note: note.trim() } : {}),
    });
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
    if (!isDateString(input.date)) throw new Error('Indique uma data de recebimento válida.');
    if (input.recurrence && (!validateRecurrenceRule(input.recurrence) || input.recurrence.startDate !== input.date)) {
      throw new Error('A regra de recorrência não é válida.');
    }
  }

  private validateGoal(input: SavingsGoalInput): void {
    if (!input.name.trim() || input.name.trim().length > 80) throw new Error('Indique um nome com até 80 caracteres.');
    if (!goalKinds.has(input.kind)) throw new Error('Selecione um tipo de objetivo válido.');
    if (!Number.isSafeInteger(input.targetAmountCents) || input.targetAmountCents <= 0) throw new Error('O objetivo tem de ser superior a zero.');
    if (!Number.isSafeInteger(input.currentAmountCents) || input.currentAmountCents < 0) throw new Error('O valor já poupado não pode ser negativo.');
    if (!Number.isSafeInteger(input.monthlyContributionCents) || input.monthlyContributionCents < 0) throw new Error('O reforço mensal não pode ser negativo.');
    if (input.targetDate && !isDateString(input.targetDate)) throw new Error('Indique uma data objetivo válida.');
  }

  private validateTransaction(input: SavingsTransactionInput): void {
    if (!transactionKinds.has(input.type)) throw new Error('Selecione um tipo de movimento válido.');
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error('O valor do movimento tem de ser superior a zero.');
    if (!isDateString(input.effectiveDate)) throw new Error('Indique uma data efetiva válida.');
    if ((input.note?.trim().length ?? 0) > 180) throw new Error('A nota não pode exceder 180 caracteres.');
  }

  private buildTransaction(goalId: string, input: SavingsTransactionInput, now: string): SavingsTransaction {
    return {
      id: crypto.randomUUID(),
      goalId,
      type: input.type,
      amountCents: input.amountCents,
      effectiveDate: input.effectiveDate,
      createdAt: now,
      updatedAt: now,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };
  }

  private async registerChange(): Promise<void> {
    const current = await this.settings.get();
    if (!current) return;
    const next: Settings = { ...current, changesSinceExport: current.changesSinceExport + 1 };
    await this.settings.put(next);
  }
}
