import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { MonthlyIncome, SavingsGoal, Settings } from '../../models/domain.models';
import { INCOME_REPOSITORY, SAVINGS_GOAL_REPOSITORY, SETTINGS_REPOSITORY } from '../repositories/repository.tokens';
import { SavingsService } from './savings.service';

describe('SavingsService', () => {
  let service: SavingsService;
  let incomes: MonthlyIncome[];
  let goals: SavingsGoal[];
  let settings: Settings;

  beforeEach(() => {
    incomes = [];
    goals = [];
    settings = { currency: 'EUR', locale: 'pt-PT', onboardingCompleted: true, changesSinceExport: 0 };
    TestBed.configureTestingModule({
      providers: [
        SavingsService,
        { provide: INCOME_REPOSITORY, useValue: {
          getById: async (id: string) => incomes.find((item) => item.id === id),
          put: async (item: MonthlyIncome) => { const index = incomes.findIndex((current) => current.id === item.id); if (index >= 0) incomes[index] = item; else incomes.push(item); },
          delete: async (id: string) => { incomes = incomes.filter((item) => item.id !== id); },
        } },
        { provide: SAVINGS_GOAL_REPOSITORY, useValue: {
          getById: async (id: string) => goals.find((item) => item.id === id),
          put: async (item: SavingsGoal) => { const index = goals.findIndex((current) => current.id === item.id); if (index >= 0) goals[index] = item; else goals.push(item); },
          delete: async (id: string) => { goals = goals.filter((item) => item.id !== id); },
        } },
        { provide: SETTINGS_REPOSITORY, useValue: { get: async () => settings, put: async (value: Settings) => { settings = value; } } },
      ],
    });
    service = TestBed.inject(SavingsService);
  });

  it('cria e atualiza um rendimento mensal', async () => {
    const created = await service.createIncome({ name: ' Salário ', kind: 'salary', amountCents: 180000, receivedMonth: '2026-09', fixed: true, active: true });
    expect(created.name).toBe('Salário');
    expect(incomes).toHaveLength(1);

    const updated = await service.updateIncome(created.id, { name: 'Salário líquido', kind: 'salary', amountCents: 190000, receivedMonth: '2026-10', fixed: false, active: false });
    expect(updated.active).toBe(false);
    expect(updated.fixed).toBe(false);
    expect(updated.receivedMonth).toBe('2026-10');
    expect(settings.changesSinceExport).toBe(2);
  });

  it('cria um objetivo e permite reforços e levantamentos válidos', async () => {
    const goal = await service.createGoal({
      name: 'Reserva', kind: 'reserve', targetAmountCents: 600000,
      currentAmountCents: 100000, monthlyContributionCents: 20000,
    });
    expect((await service.adjustGoal(goal.id, 25000)).currentAmountCents).toBe(125000);
    expect((await service.adjustGoal(goal.id, -5000)).currentAmountCents).toBe(120000);
    await expect(service.adjustGoal(goal.id, -200000)).rejects.toThrow(/Não pode retirar/);
    expect(settings.changesSinceExport).toBe(3);
  });
});
