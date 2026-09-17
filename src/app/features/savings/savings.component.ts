import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/stores/app.store';
import { IncomeKind, MonthlyIncome, SavingsGoal, SavingsGoalKind } from '../../models/domain.models';
import { formatDate, todayDateString } from '../../shared/utils/date.utils';
import {
  centsToInputValue,
  formatCurrency,
  parseMoneyToCents,
  parseNonNegativeMoneyToCents,
} from '../../shared/utils/money.utils';
import { MONTH_NAMES, expensesForMonth, incomesForMonth, sumExpenses, sumIncomes } from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-savings',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page savings-page">
      <header class="page-header-row savings-header">
        <div>
          <p class="eyebrow">Poupanças</p>
          <h1>Dê um destino ao que fica.</h1>
          <p class="page-intro">Organize rendimentos, proteja a sua reserva e acompanhe cada objetivo.</p>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary" type="button" (click)="openIncomeCreate()">Adicionar rendimento</button>
          <button class="btn btn-primary" type="button" (click)="openGoalCreate()"><span>Novo objetivo</span><span class="button-symbol" aria-hidden="true">+</span></button>
        </div>
      </header>

      <section class="savings-summary" aria-label="Resumo mensal de poupanças">
        <article class="income-hero">
          <span>Rendimentos em {{ currentMonthName }}</span>
          <strong>{{ formatCurrency(monthlyIncomeTotal()) }}</strong>
          <small>{{ activeIncomeCount() }} {{ activeIncomeCount() === 1 ? 'fonte ativa' : 'fontes ativas' }}</small>
        </article>
        <div class="summary-details">
          <article>
            <span>Total poupado</span>
            <strong>{{ formatCurrency(totalSaved()) }}</strong>
          </article>
          <article>
            <span>Plano mensal</span>
            <strong>{{ formatCurrency(monthlySavingsPlan()) }}</strong>
          </article>
          <article>
            <span>Livre após despesas</span>
            <strong [class.negative]="availableAfterExpenses() < 0">{{ formatCurrency(availableAfterExpenses()) }}</strong>
            <small>{{ formatCurrency(currentMonthExpenses()) }} em despesas neste mês</small>
          </article>
        </div>
      </section>

      @if (store.monthlyIncomes().length === 0) {
        <section class="setup-callout" aria-labelledby="setup-title">
          <div>
            <h2 id="setup-title">Comece pelo rendimento mensal</h2>
            <p>Adicione o salário, subsídios ou outros rendimentos para perceber quanto pode reservar todos os meses.</p>
          </div>
          <button class="btn btn-primary" type="button" (click)="openIncomeCreate()">Configurar rendimento</button>
        </section>
      }

      <section class="income-section" aria-labelledby="income-title">
        <div class="section-header">
          <div>
            <h2 id="income-title">Rendimentos</h2>
            <p>Entradas fixas ou pontuais usadas para calcular o saldo de cada mês.</p>
          </div>
          @if (store.monthlyIncomes().length > 0) {
            <button class="btn btn-ghost btn-compact" type="button" (click)="openIncomeCreate()">Adicionar</button>
          }
        </div>

        @if (store.monthlyIncomes().length === 0) {
          <div class="empty-inline">Ainda não existem fontes de rendimento configuradas.</div>
        } @else {
          <div class="income-list card-flat">
            @for (income of store.monthlyIncomes(); track income.id) {
              <article class="income-row" [class.inactive]="!income.active">
                <div class="income-type" aria-hidden="true">{{ incomeInitial(income.kind) }}</div>
                <div class="income-copy">
                  <strong>{{ income.name }}</strong>
                  <span>{{ incomeKindLabel(income.kind) }}, {{ incomePeriodLabel(income) }}{{ income.active ? '' : ', inativo' }}</span>
                </div>
                <strong class="income-value">{{ formatCurrency(income.amountCents) }}</strong>
                <div class="row-actions">
                  <button class="btn btn-ghost btn-compact" type="button" (click)="openIncomeEdit(income)">Editar</button>
                  <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="removeIncome(income)">Eliminar</button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <section class="goals-section" aria-labelledby="goals-title">
        <div class="section-header goals-heading">
          <div>
            <h2 id="goals-title">Objetivos de poupança</h2>
            <p>Distribua as suas poupanças por metas concretas e pelo fundo de reserva.</p>
          </div>
          @if (store.savingsGoals().length > 0) {
            <button class="btn btn-secondary btn-compact" type="button" (click)="openGoalCreate()">Novo objetivo</button>
          }
        </div>

        @if (store.savingsGoals().length === 0) {
          <div class="empty-state goals-empty">
            <div class="empty-symbol" aria-hidden="true">%</div>
            <h3>Crie o primeiro objetivo</h3>
            <p>Defina uma meta para o fundo de reserva, casa, carro ou outro plano importante.</p>
            <button class="btn btn-primary" type="button" (click)="openGoalCreate()">Criar objetivo</button>
          </div>
        } @else {
          <div class="goal-grid">
            @for (goal of orderedGoals(); track goal.id) {
              <article class="goal-card card" [class.completed]="progress(goal) >= 100">
                <header class="goal-card-header">
                  <div>
                    <span class="goal-kind">{{ goalKindLabel(goal.kind) }}</span>
                    <h3>{{ goal.name }}</h3>
                  </div>
                  <strong>{{ progress(goal) }}%</strong>
                </header>

                <div class="progress-track" role="progressbar" [attr.aria-label]="'Progresso de ' + goal.name" [attr.aria-valuenow]="progress(goal)" aria-valuemin="0" aria-valuemax="100">
                  <span [style.width.%]="progress(goal)"></span>
                </div>

                <div class="goal-amounts">
                  <div><span>Poupado</span><strong>{{ formatCurrency(goal.currentAmountCents) }}</strong></div>
                  <div><span>Objetivo</span><strong>{{ formatCurrency(goal.targetAmountCents) }}</strong></div>
                </div>

                <dl class="goal-meta">
                  <div><dt>Reforço mensal</dt><dd>{{ goal.monthlyContributionCents > 0 ? formatCurrency(goal.monthlyContributionCents) : 'Não definido' }}</dd></div>
                  <div><dt>Data objetivo</dt><dd>{{ goal.targetDate ? formatDate(goal.targetDate) : 'Sem data' }}</dd></div>
                </dl>

                <footer class="goal-actions">
                  <button class="btn btn-primary btn-compact" type="button" (click)="openAdjustment(goal)">Movimentar</button>
                  <button class="btn btn-ghost btn-compact" type="button" (click)="openGoalEdit(goal)">Editar</button>
                  <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="removeGoal(goal)">Eliminar</button>
                </footer>
              </article>
            }
          </div>
        }
      </section>
    </div>

    @if (incomeFormOpen()) {
      <div class="modal-backdrop">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="income-form-title">
          <header class="modal-header">
            <div>
              <h2 id="income-form-title">{{ editingIncome() ? 'Editar rendimento' : 'Novo rendimento' }}</h2>
              <p>Registe o valor, o mês de recebimento e se é recorrente.</p>
            </div>
            <button class="btn btn-ghost btn-compact" type="button" (click)="closeIncomeForm()" aria-label="Fechar formulário">Fechar</button>
          </header>
          <form [formGroup]="incomeForm" (ngSubmit)="submitIncome()" novalidate>
            <div class="form-grid">
              <div class="field wide">
                <label for="income-name">Nome *</label>
                <input id="income-name" type="text" formControlName="name" maxlength="80" placeholder="Ex.: salário principal" required>
                @if (incomeForm.controls.name.touched && incomeForm.controls.name.invalid) { <p class="field-error">Indique um nome com até 80 caracteres.</p> }
              </div>
              <div class="field">
                <label for="income-kind">Tipo *</label>
                <select id="income-kind" formControlName="kind" required>
                  <option value="salary">Salário</option>
                  <option value="subsidy">Subsídio</option>
                  <option value="freelance">Trabalho independente</option>
                  <option value="other">Outro rendimento</option>
                </select>
              </div>
              <div class="field">
                <label for="income-month">Mês de recebimento *</label>
                <input id="income-month" type="month" formControlName="receivedMonth" required>
                @if (incomeForm.controls.receivedMonth.touched && incomeForm.controls.receivedMonth.invalid) { <p class="field-error">Indique o mês em que recebeu este rendimento.</p> }
              </div>
              <div class="field wide">
                <label for="income-amount">Valor em euros *</label>
                <input id="income-amount" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>
                @if (incomeAmountError()) { <p class="field-error">{{ incomeAmountError() }}</p> }
              </div>
              <label class="check-field wide">
                <input type="checkbox" formControlName="fixed">
                <span><strong>Rendimento fixo mensal</strong><small>Será incluído no mês indicado e em todos os meses seguintes.</small></span>
              </label>
              <label class="check-field wide">
                <input type="checkbox" formControlName="active">
                <span><strong>Incluir nos totais</strong><small>Desative um rendimento sem o eliminar.</small></span>
              </label>
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Guardar rendimento' }}</button>
              <button class="btn btn-secondary" type="button" (click)="closeIncomeForm()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    }

    @if (goalFormOpen()) {
      <div class="modal-backdrop">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="goal-form-title">
          <header class="modal-header">
            <div>
              <h2 id="goal-form-title">{{ editingGoal() ? 'Editar objetivo' : 'Novo objetivo' }}</h2>
              <p>Defina a meta e, se quiser, um reforço mensal.</p>
            </div>
            <button class="btn btn-ghost btn-compact" type="button" (click)="closeGoalForm()" aria-label="Fechar formulário">Fechar</button>
          </header>
          <form [formGroup]="goalForm" (ngSubmit)="submitGoal()" novalidate>
            <div class="form-grid">
              <div class="field wide">
                <label for="goal-name">Nome *</label>
                <input id="goal-name" type="text" formControlName="name" maxlength="80" placeholder="Ex.: entrada para a casa" required>
                @if (goalForm.controls.name.touched && goalForm.controls.name.invalid) { <p class="field-error">Indique um nome com até 80 caracteres.</p> }
              </div>
              <div class="field">
                <label for="goal-kind">Tipo *</label>
                <select id="goal-kind" formControlName="kind" required>
                  <option value="general">Poupança geral</option>
                  <option value="reserve">Fundo de reserva</option>
                  <option value="home">Casa</option>
                  <option value="car">Carro</option>
                  <option value="travel">Viagem</option>
                  <option value="education">Educação</option>
                  <option value="other">Outro</option>
                </select>
              </div>
              <div class="field">
                <label for="goal-target">Valor objetivo em euros *</label>
                <input id="goal-target" type="text" inputmode="decimal" formControlName="targetAmount" placeholder="0,00" required>
                @if (goalTargetError()) { <p class="field-error">{{ goalTargetError() }}</p> }
              </div>
              <div class="field">
                <label for="goal-current">Valor já poupado</label>
                <input id="goal-current" type="text" inputmode="decimal" formControlName="currentAmount" placeholder="0,00">
                @if (goalCurrentError()) { <p class="field-error">{{ goalCurrentError() }}</p> }
              </div>
              <div class="field">
                <label for="goal-monthly">Reforço mensal planeado</label>
                <input id="goal-monthly" type="text" inputmode="decimal" formControlName="monthlyContribution" placeholder="0,00">
                @if (goalMonthlyError()) { <p class="field-error">{{ goalMonthlyError() }}</p> }
              </div>
              <div class="field wide">
                <label for="goal-date">Data objetivo</label>
                <input id="goal-date" type="date" formControlName="targetDate">
                <p class="helper">Opcional. Serve apenas como referência para o seu plano.</p>
              </div>
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Guardar objetivo' }}</button>
              <button class="btn btn-secondary" type="button" (click)="closeGoalForm()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    }

    @if (adjustmentGoal(); as goal) {
      <div class="modal-backdrop">
        <section class="modal adjustment-modal" role="dialog" aria-modal="true" aria-labelledby="adjustment-title">
          <header class="modal-header">
            <div>
              <h2 id="adjustment-title">Movimentar {{ goal.name }}</h2>
              <p>Tem atualmente {{ formatCurrency(goal.currentAmountCents) }} neste objetivo.</p>
            </div>
            <button class="btn btn-ghost btn-compact" type="button" (click)="closeAdjustment()" aria-label="Fechar formulário">Fechar</button>
          </header>
          <form [formGroup]="adjustmentForm" (ngSubmit)="submitAdjustment()" novalidate>
            <div class="form-grid">
              <div class="field">
                <label for="adjustment-mode">Movimento *</label>
                <select id="adjustment-mode" formControlName="mode">
                  <option value="deposit">Adicionar à poupança</option>
                  <option value="withdraw">Retirar da poupança</option>
                </select>
              </div>
              <div class="field">
                <label for="adjustment-amount">Valor em euros *</label>
                <input id="adjustment-amount" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>
                @if (adjustmentError()) { <p class="field-error">{{ adjustmentError() }}</p> }
              </div>
            </div>
            @if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }
            <div class="button-row form-actions">
              <button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Confirmar movimento' }}</button>
              <button class="btn btn-secondary" type="button" (click)="closeAdjustment()">Cancelar</button>
            </div>
          </form>
        </section>
      </div>
    }
  `,
  styleUrl: './savings.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SavingsComponent {
  readonly store = inject(AppStore);
  private readonly formBuilder = inject(FormBuilder);
  readonly formatCurrency = formatCurrency;
  readonly formatDate = formatDate;
  readonly incomeFormOpen = signal(false);
  readonly goalFormOpen = signal(false);
  readonly editingIncome = signal<MonthlyIncome | null>(null);
  readonly editingGoal = signal<SavingsGoal | null>(null);
  readonly adjustmentGoal = signal<SavingsGoal | null>(null);
  readonly incomeAmountError = signal<string | null>(null);
  readonly goalTargetError = signal<string | null>(null);
  readonly goalCurrentError = signal<string | null>(null);
  readonly goalMonthlyError = signal<string | null>(null);
  readonly adjustmentError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly currentMonthName = MONTH_NAMES[new Date().getMonth()];

  readonly incomeForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    kind: ['salary' as IncomeKind, Validators.required],
    receivedMonth: [todayDateString().slice(0, 7), Validators.required],
    amount: ['', Validators.required],
    fixed: [true],
    active: [true],
  });
  readonly goalForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    kind: ['reserve' as SavingsGoalKind, Validators.required],
    targetAmount: ['', Validators.required],
    currentAmount: [''],
    monthlyContribution: [''],
    targetDate: [''],
  });
  readonly adjustmentForm = this.formBuilder.nonNullable.group({
    mode: ['deposit' as 'deposit' | 'withdraw'],
    amount: ['', Validators.required],
  });

  readonly currentMonthIncomes = computed(() => {
    const now = new Date();
    return incomesForMonth(this.store.monthlyIncomes(), now.getFullYear(), now.getMonth() + 1);
  });
  readonly activeIncomeCount = computed(() => this.currentMonthIncomes().length);
  readonly monthlyIncomeTotal = computed(() => sumIncomes(this.currentMonthIncomes()));
  readonly totalSaved = computed(() => this.store.savingsGoals().reduce((total, goal) => total + goal.currentAmountCents, 0));
  readonly monthlySavingsPlan = computed(() => this.store.savingsGoals()
    .filter((goal) => this.progress(goal) < 100)
    .reduce((total, goal) => total + goal.monthlyContributionCents, 0));
  readonly currentMonthExpenses = computed(() => {
    const now = new Date();
    return sumExpenses(expensesForMonth(this.store.expenses(), now.getFullYear(), now.getMonth() + 1));
  });
  readonly availableAfterExpenses = computed(() => this.monthlyIncomeTotal() - this.currentMonthExpenses());
  readonly orderedGoals = computed(() => [...this.store.savingsGoals()].sort((a, b) => {
    const completedDifference = Number(this.progress(a) >= 100) - Number(this.progress(b) >= 100);
    return completedDifference || a.createdAt.localeCompare(b.createdAt);
  }));

  openIncomeCreate(): void {
    this.editingIncome.set(null);
    this.incomeForm.reset({ name: '', kind: 'salary', receivedMonth: todayDateString().slice(0, 7), amount: '', fixed: true, active: true });
    this.resetErrors();
    this.incomeFormOpen.set(true);
  }

  openIncomeEdit(income: MonthlyIncome): void {
    this.editingIncome.set(income);
    this.incomeForm.reset({
      name: income.name,
      kind: income.kind,
      receivedMonth: income.receivedMonth,
      amount: centsToInputValue(income.amountCents),
      fixed: income.fixed,
      active: income.active,
    });
    this.resetErrors();
    this.incomeFormOpen.set(true);
  }

  closeIncomeForm(): void {
    this.incomeFormOpen.set(false);
    this.editingIncome.set(null);
  }

  async submitIncome(): Promise<void> {
    this.resetErrors();
    const raw = this.incomeForm.getRawValue();
    const amountCents = parseMoneyToCents(raw.amount);
    if (this.incomeForm.invalid || amountCents === null) {
      this.incomeForm.markAllAsTouched();
      if (amountCents === null) this.incomeAmountError.set('Introduza um valor válido e superior a zero.');
      return;
    }
    try {
      await this.store.saveIncome({
        name: raw.name,
        kind: raw.kind,
        amountCents,
        receivedMonth: raw.receivedMonth,
        fixed: raw.fixed,
        active: raw.active,
      }, this.editingIncome()?.id);
      this.closeIncomeForm();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o rendimento.');
    }
  }

  async removeIncome(income: MonthlyIncome): Promise<void> {
    if (!confirm(`Eliminar o rendimento "${income.name}"?`)) return;
    try { await this.store.deleteIncome(income.id); } catch { /* Global error is already visible. */ }
  }

  openGoalCreate(): void {
    this.editingGoal.set(null);
    this.goalForm.reset({ name: '', kind: 'reserve', targetAmount: '', currentAmount: '', monthlyContribution: '', targetDate: '' });
    this.resetErrors();
    this.goalFormOpen.set(true);
  }

  openGoalEdit(goal: SavingsGoal): void {
    this.editingGoal.set(goal);
    this.goalForm.reset({
      name: goal.name,
      kind: goal.kind,
      targetAmount: centsToInputValue(goal.targetAmountCents),
      currentAmount: centsToInputValue(goal.currentAmountCents),
      monthlyContribution: centsToInputValue(goal.monthlyContributionCents),
      targetDate: goal.targetDate ?? '',
    });
    this.resetErrors();
    this.goalFormOpen.set(true);
  }

  closeGoalForm(): void {
    this.goalFormOpen.set(false);
    this.editingGoal.set(null);
  }

  async submitGoal(): Promise<void> {
    this.resetErrors();
    const raw = this.goalForm.getRawValue();
    const targetAmountCents = parseMoneyToCents(raw.targetAmount);
    const currentAmountCents = parseNonNegativeMoneyToCents(raw.currentAmount);
    const monthlyContributionCents = parseNonNegativeMoneyToCents(raw.monthlyContribution);
    if (this.goalForm.invalid || targetAmountCents === null || currentAmountCents === null || monthlyContributionCents === null) {
      this.goalForm.markAllAsTouched();
      if (targetAmountCents === null) this.goalTargetError.set('Introduza um objetivo válido e superior a zero.');
      if (currentAmountCents === null) this.goalCurrentError.set('Introduza um valor válido ou deixe o campo vazio.');
      if (monthlyContributionCents === null) this.goalMonthlyError.set('Introduza um valor válido ou deixe o campo vazio.');
      return;
    }
    try {
      await this.store.saveSavingsGoal({
        name: raw.name,
        kind: raw.kind,
        targetAmountCents,
        currentAmountCents,
        monthlyContributionCents,
        ...(raw.targetDate ? { targetDate: raw.targetDate } : {}),
      }, this.editingGoal()?.id);
      this.closeGoalForm();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o objetivo.');
    }
  }

  async removeGoal(goal: SavingsGoal): Promise<void> {
    if (!confirm(`Eliminar o objetivo "${goal.name}" e o valor poupado associado?`)) return;
    try { await this.store.deleteSavingsGoal(goal.id); } catch { /* Global error is already visible. */ }
  }

  openAdjustment(goal: SavingsGoal): void {
    this.adjustmentGoal.set(goal);
    this.adjustmentForm.reset({ mode: 'deposit', amount: '' });
    this.resetErrors();
  }

  closeAdjustment(): void {
    this.adjustmentGoal.set(null);
  }

  async submitAdjustment(): Promise<void> {
    this.resetErrors();
    const goal = this.adjustmentGoal();
    const raw = this.adjustmentForm.getRawValue();
    const amountCents = parseMoneyToCents(raw.amount);
    if (!goal || this.adjustmentForm.invalid || amountCents === null) {
      this.adjustmentForm.markAllAsTouched();
      if (amountCents === null) this.adjustmentError.set('Introduza um valor válido e superior a zero.');
      return;
    }
    if (raw.mode === 'withdraw' && amountCents > goal.currentAmountCents) {
      this.adjustmentError.set('Não pode retirar mais do que o valor atualmente poupado.');
      return;
    }
    try {
      await this.store.adjustSavingsGoal(goal.id, raw.mode === 'deposit' ? amountCents : -amountCents);
      this.closeAdjustment();
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o movimento.');
    }
  }

  progress(goal: SavingsGoal): number {
    return Math.min(100, Math.round((goal.currentAmountCents / goal.targetAmountCents) * 100));
  }

  incomeKindLabel(kind: IncomeKind): string {
    return ({ salary: 'Salário', subsidy: 'Subsídio', freelance: 'Trabalho independente', other: 'Outro rendimento' })[kind];
  }

  incomeInitial(kind: IncomeKind): string {
    return ({ salary: 'S', subsidy: 'A', freelance: 'T', other: 'O' })[kind];
  }

  incomePeriodLabel(income: MonthlyIncome): string {
    const [year, month] = income.receivedMonth.split('-').map(Number);
    const label = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
    return income.fixed ? `fixo desde ${label}` : `recebido em ${label}`;
  }

  goalKindLabel(kind: SavingsGoalKind): string {
    return ({ general: 'Poupança geral', reserve: 'Fundo de reserva', home: 'Casa', car: 'Carro', travel: 'Viagem', education: 'Educação', other: 'Outro objetivo' })[kind];
  }

  private resetErrors(): void {
    this.incomeAmountError.set(null);
    this.goalTargetError.set(null);
    this.goalCurrentError.set(null);
    this.goalMonthlyError.set(null);
    this.adjustmentError.set(null);
    this.formError.set(null);
  }
}
