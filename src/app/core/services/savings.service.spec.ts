import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MonthlyIncome, RecurrenceException, SavingsGoal, SavingsTransaction, Settings } from '../../models/domain.models';
import { INCOME_REPOSITORY, RECURRENCE_EXCEPTION_REPOSITORY, SAVINGS_GOAL_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { SavingsService } from './savings.service';

const signed = (item: SavingsTransaction): number => item.type === 'withdrawal' ? -item.amountCents : item.amountCents;

describe('SavingsService', () => {
  let service: SavingsService;
  let incomes: MonthlyIncome[];
  let goals: SavingsGoal[];
  let transactions: SavingsTransaction[];
  let exceptions: RecurrenceException[];
  let settings: Settings;

  beforeEach(() => {
    incomes = []; goals = []; transactions = []; exceptions = [];
    settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({ providers: [
      SavingsService,
      { provide: INCOME_REPOSITORY, useValue: { getAll: async () => incomes, getById: async (id: string) => incomes.find((item) => item.id === id), put: async (item: MonthlyIncome) => { incomes = incomes.filter((current) => current.id !== item.id); incomes.push(item); }, delete: async (id: string) => { incomes = incomes.filter((item) => item.id !== id); } } },
      { provide: RECURRENCE_EXCEPTION_REPOSITORY, useValue: { getAll: async () => exceptions, put: async (item: RecurrenceException) => { exceptions = exceptions.filter((current) => current.id !== item.id); exceptions.push(item); }, delete: async () => undefined } },
      { provide: SAVINGS_GOAL_REPOSITORY, useValue: {
        getAll: async () => goals, getById: async (id: string) => goals.find((item) => item.id === id), getTransactions: async () => transactions,
        createGoal: async (goal: SavingsGoal, opening?: SavingsTransaction) => { goals.push(goal); if (opening) transactions.push(opening); },
        updateGoal: async (goal: SavingsGoal, adjustment?: SavingsTransaction) => { goals = goals.map((item) => item.id === goal.id ? goal : item); if (adjustment) transactions.push(adjustment); },
        addTransaction: async (transaction: SavingsTransaction) => { const goal = goals.find((item) => item.id === transaction.goalId); if (!goal) throw new Error('missing goal'); const next = { ...goal, currentAmountCents: goal.currentAmountCents + signed(transaction) }; if (next.currentAmountCents < 0) throw new Error('Não pode retirar mais do que o valor atualmente poupado.'); goals = goals.map((item) => item.id === goal.id ? next : item); transactions.push(transaction); return next; },
        updateTransaction: async (transaction: SavingsTransaction) => { const old = transactions.find((item) => item.id === transaction.id); const goal = goals.find((item) => item.id === transaction.goalId); if (!old || !goal) throw new Error('missing data'); const next = { ...goal, currentAmountCents: goal.currentAmountCents - signed(old) + signed(transaction) }; if (next.currentAmountCents < 0) throw new Error('saldo negativo'); goals = goals.map((item) => item.id === goal.id ? next : item); transactions = transactions.map((item) => item.id === transaction.id ? transaction : item); return next; },
        deleteTransaction: async (id: string) => { const old = transactions.find((item) => item.id === id); if (!old) throw new Error('missing transaction'); const goal = goals.find((item) => item.id === old.goalId); if (!goal) throw new Error('missing goal'); const next = { ...goal, currentAmountCents: goal.currentAmountCents - signed(old) }; if (next.currentAmountCents < 0) throw new Error('saldo negativo'); goals = goals.map((item) => item.id === goal.id ? next : item); transactions = transactions.filter((item) => item.id !== id); return next; },
        delete: async (id: string) => { goals = goals.filter((item) => item.id !== id); transactions = transactions.filter((item) => item.goalId !== id); },
      } },
      { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
    ] });
    service = TestBed.inject(SavingsService);
  });

  it('cria e atualiza um rendimento recorrente', async () => {
    const created = await service.createIncome({ name: ' Salário ', kind: 'salary', amountCents: 180000, date: '2026-09-01', recurrence: { frequency: 'monthly', interval: 1, startDate: '2026-09-01', status: 'active' } });
    expect(created.name).toBe('Salário');
    const updated = await service.updateIncome(created.id, { name: 'Salário líquido', kind: 'salary', amountCents: 190000, date: '2026-10-01' });
    expect(updated.recurrence).toBeUndefined();
    expect(updated.date).toBe('2026-10-01');
  });

  it('cria o saldo inicial no ledger e permite criar, editar e eliminar movimentos', async () => {
    const goal = await service.createGoal({ name: 'Reserva', kind: 'reserve', targetAmountCents: 600000, currentAmountCents: 100000, monthlyContributionCents: 20000 });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ goalId: goal.id, type: 'opening', amountCents: 100000 });
    const deposit = await service.createTransaction(goal.id, { type: 'deposit', amountCents: 25000, effectiveDate: '2026-09-18' });
    expect(goals[0].currentAmountCents).toBe(125000);
    await service.updateTransaction(deposit.id, goal.id, { type: 'deposit', amountCents: 20000, effectiveDate: '2026-09-18' });
    expect(goals[0].currentAmountCents).toBe(120000);
    await service.deleteTransaction(deposit.id);
    expect(goals[0].currentAmountCents).toBe(100000);
  });

  it('impede levantamentos que deixariam o objetivo negativo', async () => {
    const goal = await service.createGoal({ name: 'Reserva', kind: 'reserve', targetAmountCents: 600000, currentAmountCents: 10000, monthlyContributionCents: 0 });
    await expect(service.createTransaction(goal.id, { type: 'withdrawal', amountCents: 20000, effectiveDate: '2026-09-18' })).rejects.toThrow(/Não pode retirar/);
    expect(goals[0].currentAmountCents).toBe(10000);
  });
});
