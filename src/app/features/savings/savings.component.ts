import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AppStore } from '../../core/stores/app.store';
import {
  IncomeKind,
  IncomeOccurrence,
  MonthlyIncome,
  RecurrenceFrequency,
  RecurrenceRule,
  SavingsGoal,
  SavingsGoalKind,
  SavingsTransaction,
  SavingsTransactionType,
} from '../../models/domain.models';
import { formatDate, todayDateString } from '../../shared/utils/date.utils';
import { centsToInputValue, formatCurrency, parseMoneyToCents, parseNonNegativeMoneyToCents } from '../../shared/utils/money.utils';
import { recurrenceLabel } from '../../shared/utils/recurrence.utils';
import { expensesForMonth, incomesForMonth, MONTH_NAMES, sumExpenses, sumIncomes } from '../../shared/utils/statistics.utils';

@Component({
  selector: 'app-savings',
  imports: [ReactiveFormsModule],
  template: `
    <div class="page savings-page">
      <header class="page-header-row savings-header">
        <div><p class="eyebrow">Poupanças</p><h1>Dê um destino ao que fica.</h1><p class="page-intro">Organize rendimentos e acompanhe cada movimento dos seus objetivos.</p></div>
        <div class="header-actions"><button class="btn btn-secondary" type="button" (click)="openIncomeCreate()">Adicionar rendimento</button><button class="btn btn-primary" type="button" (click)="openGoalCreate()"><span>Novo objetivo</span><span class="button-symbol" aria-hidden="true">+</span></button></div>
      </header>

      <section class="savings-summary" aria-label="Resumo mensal de poupanças">
        <article class="income-hero"><span>Rendimentos em {{ currentMonthName }}</span><strong>{{ formatCurrency(monthlyIncomeTotal()) }}</strong><small>{{ currentMonthIncomes().length }} {{ currentMonthIncomes().length === 1 ? 'entrada' : 'entradas' }} no mês</small></article>
        <div class="summary-details">
          <article><span>Total poupado</span><strong>{{ formatCurrency(totalSaved()) }}</strong></article>
          <article><span>Plano mensal</span><strong>{{ formatCurrency(monthlySavingsPlan()) }}</strong></article>
          <article><span>Livre após despesas</span><strong [class.negative]="availableAfterExpenses() < 0">{{ formatCurrency(availableAfterExpenses()) }}</strong><small>{{ formatCurrency(currentMonthExpenses()) }} em despesas neste mês</small></article>
        </div>
      </section>

      <section class="income-section" aria-labelledby="income-title">
        <div class="section-header"><div><h2 id="income-title">Rendimentos</h2><p>Entradas pontuais ou séries recorrentes usadas nos totais do mesmo motor de cálculo.</p></div>@if (store.monthlyIncomes().length > 0) { <button class="btn btn-ghost btn-compact" type="button" (click)="openIncomeCreate()">Adicionar</button> }</div>
        @if (store.monthlyIncomes().length === 0) {
          <div class="empty-inline">Ainda não existem fontes de rendimento configuradas.</div>
        } @else {
          <div class="income-list card-flat">
            @for (income of store.monthlyIncomes(); track income.id) {
              <article class="income-row">
                <div class="income-type" aria-hidden="true">{{ incomeInitial(income.kind) }}</div>
                <div class="income-copy"><strong>{{ income.name }}</strong><span>{{ incomeKindLabel(income.kind) }} · {{ recurrenceLabel(income.recurrence) }} desde {{ formatDate(income.date) }}</span></div>
                <strong class="income-value">{{ formatCurrency(income.amountCents) }}</strong>
                <div class="row-actions">
                  @if (currentOccurrence(income); as occurrence) { @if (income.recurrence) { <button class="btn btn-ghost btn-compact" type="button" (click)="openIncomeOccurrenceEdit(occurrence)">Editar este mês</button><button class="btn btn-ghost btn-compact danger-text" type="button" (click)="omitIncomeOccurrence(occurrence)">Omitir este mês</button> } }
                  <button class="btn btn-ghost btn-compact" type="button" (click)="openIncomeEdit(income)">Editar {{ income.recurrence ? 'série' : '' }}</button>
                  <button class="btn btn-ghost btn-compact danger-text" type="button" (click)="removeIncome(income)">Eliminar</button>
                </div>
              </article>
            }
          </div>
        }
      </section>

      <section class="goals-section" aria-labelledby="goals-title">
        <div class="section-header goals-heading"><div><h2 id="goals-title">Objetivos de poupança</h2><p>O saldo é mantido em cache e confirmado pelo histórico de movimentos.</p></div>@if (store.savingsGoals().length > 0) { <button class="btn btn-secondary btn-compact" type="button" (click)="openGoalCreate()">Novo objetivo</button> }</div>
        @if (store.savingsGoals().length === 0) {
          <div class="empty-state goals-empty"><div class="empty-symbol" aria-hidden="true">%</div><h3>Crie o primeiro objetivo</h3><p>O valor inicial ficará registado como movimento de abertura.</p><button class="btn btn-primary" type="button" (click)="openGoalCreate()">Criar objetivo</button></div>
        } @else {
          <div class="goal-grid">
            @for (goal of orderedGoals(); track goal.id) {
              <article class="goal-card card" [class.completed]="progress(goal) >= 100">
                <header class="goal-card-header"><div><span class="goal-kind">{{ goalKindLabel(goal.kind) }}</span><h3>{{ goal.name }}</h3></div><strong>{{ progress(goal) }}%</strong></header>
                <div class="progress-track" role="progressbar" [attr.aria-label]="'Progresso de ' + goal.name" [attr.aria-valuenow]="progress(goal)" aria-valuemin="0" aria-valuemax="100"><span [style.width.%]="progress(goal)"></span></div>
                <div class="goal-amounts"><div><span>Saldo atual</span><strong>{{ formatCurrency(goal.currentAmountCents) }}</strong></div><div><span>Objetivo</span><strong>{{ formatCurrency(goal.targetAmountCents) }}</strong></div></div>
                <dl class="goal-meta"><div><dt>Reforço mensal</dt><dd>{{ goal.monthlyContributionCents > 0 ? formatCurrency(goal.monthlyContributionCents) : 'Não definido' }}</dd></div><div><dt>Data objetivo</dt><dd>{{ goal.targetDate ? formatDate(goal.targetDate) : 'Sem data' }}</dd></div></dl>
                <div class="recent-transactions">
                  <h4>Últimos movimentos</h4>
                  @for (transaction of transactionsForGoal(goal.id).slice(0, 3); track transaction.id) { <div><span>{{ transactionTypeLabel(transaction.type) }} · {{ formatDate(transaction.effectiveDate) }}</span><strong [class.withdrawal]="transaction.type === 'withdrawal'">{{ transaction.type === 'withdrawal' ? '−' : '+' }}{{ formatCurrency(transaction.amountCents) }}</strong></div> }
                  @if (transactionsForGoal(goal.id).length === 0) { <p class="muted small">Ainda não existem movimentos.</p> }
                </div>
                <footer class="goal-actions"><button class="btn btn-primary btn-compact" type="button" (click)="openTransactionCreate(goal)">Movimentar</button><button class="btn btn-secondary btn-compact" type="button" (click)="openHistory(goal)">Ver histórico</button><button class="btn btn-ghost btn-compact" type="button" (click)="openGoalEdit(goal)">Editar</button><button class="btn btn-ghost btn-compact danger-text" type="button" (click)="removeGoal(goal)">Eliminar</button></footer>
              </article>
            }
          </div>
        }
      </section>
    </div>

    @if (incomeFormOpen()) {
      <div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="income-form-title">
        <header class="modal-header"><div><h2 id="income-form-title">{{ editingIncomeOccurrence() ? 'Editar ocorrência' : editingIncome() ? 'Editar rendimento' : 'Novo rendimento' }}</h2><p>{{ editingIncomeOccurrence() ? 'Apenas esta ocorrência será alterada.' : 'Configure uma entrada pontual ou recorrente.' }}</p></div><button class="btn btn-ghost btn-compact" type="button" (click)="closeIncomeForm()" aria-label="Fechar formulário">Fechar</button></header>
        <form [formGroup]="incomeForm" (ngSubmit)="submitIncome()" novalidate><div class="form-grid">
          <div class="field wide"><label for="income-name">Nome *</label><input id="income-name" type="text" formControlName="name" maxlength="80" required></div>
          <div class="field"><label for="income-kind">Tipo *</label><select id="income-kind" formControlName="kind"><option value="salary">Salário</option><option value="subsidy">Subsídio</option><option value="freelance">Trabalho independente</option><option value="other">Outro rendimento</option></select></div>
          <div class="field"><label for="income-date">Data *</label><input id="income-date" type="date" formControlName="date" required></div>
          <div class="field wide"><label for="income-amount">Valor em euros *</label><input id="income-amount" type="text" inputmode="decimal" formControlName="amount" placeholder="0,00" required>@if (incomeAmountError()) { <p class="field-error">{{ incomeAmountError() }}</p> }</div>
          @if (!editingIncomeOccurrence()) {
            <div class="field"><label for="income-recurrence">Recorrência</label><select id="income-recurrence" formControlName="recurrenceType"><option value="none">Pontual</option><option value="weekly">Semanal</option><option value="monthly">Mensal</option><option value="yearly">Anual</option></select></div>
            @if (incomeForm.controls.recurrenceType.value !== 'none') {
              <div class="field"><label for="income-interval">Intervalo</label><input id="income-interval" type="number" min="1" max="99" formControlName="interval"></div>
              <div class="field"><label for="income-end">Data de fim</label><input id="income-end" type="date" formControlName="endDate" [min]="incomeForm.controls.date.value"></div>
              <div class="field"><label for="income-status">Estado</label><select id="income-status" formControlName="recurrenceStatus"><option value="active">Ativa</option><option value="paused">Pausada</option></select></div>
            }
          }
        </div>@if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }<div class="button-row form-actions"><button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">{{ store.operationPending() ? 'A guardar...' : 'Guardar rendimento' }}</button><button class="btn btn-secondary" type="button" (click)="closeIncomeForm()">Cancelar</button></div></form>
      </section></div>
    }

    @if (goalFormOpen()) {
      <div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="goal-form-title">
        <header class="modal-header"><div><h2 id="goal-form-title">{{ editingGoal() ? 'Editar objetivo' : 'Novo objetivo' }}</h2><p>Qualquer diferença no saldo cria um movimento explícito.</p></div><button class="btn btn-ghost btn-compact" type="button" (click)="closeGoalForm()">Fechar</button></header>
        <form [formGroup]="goalForm" (ngSubmit)="submitGoal()" novalidate><div class="form-grid">
          <div class="field wide"><label for="goal-name">Nome *</label><input id="goal-name" type="text" formControlName="name" maxlength="80" required></div>
          <div class="field"><label for="goal-kind">Tipo</label><select id="goal-kind" formControlName="kind"><option value="general">Poupança geral</option><option value="reserve">Fundo de reserva</option><option value="home">Casa</option><option value="car">Carro</option><option value="travel">Viagem</option><option value="education">Educação</option><option value="other">Outro</option></select></div>
          <div class="field"><label for="goal-target">Valor objetivo *</label><input id="goal-target" type="text" inputmode="decimal" formControlName="targetAmount" required>@if (goalTargetError()) { <p class="field-error">{{ goalTargetError() }}</p> }</div>
          <div class="field"><label for="goal-current">Valor já poupado</label><input id="goal-current" type="text" inputmode="decimal" formControlName="currentAmount">@if (goalCurrentError()) { <p class="field-error">{{ goalCurrentError() }}</p> }</div>
          <div class="field"><label for="goal-monthly">Reforço mensal planeado</label><input id="goal-monthly" type="text" inputmode="decimal" formControlName="monthlyContribution">@if (goalMonthlyError()) { <p class="field-error">{{ goalMonthlyError() }}</p> }</div>
          <div class="field wide"><label for="goal-date">Data objetivo</label><input id="goal-date" type="date" formControlName="targetDate"></div>
        </div>@if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }<div class="button-row form-actions"><button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">Guardar objetivo</button><button class="btn btn-secondary" type="button" (click)="closeGoalForm()">Cancelar</button></div></form>
      </section></div>
    }

    @if (transactionGoal(); as goal) {
      <div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="transaction-title">
        <header class="modal-header"><div><h2 id="transaction-title">{{ editingTransaction() ? 'Editar movimento' : 'Movimentar ' + goal.name }}</h2><p>Saldo atual: {{ formatCurrency(goal.currentAmountCents) }}</p></div><button class="btn btn-ghost btn-compact" type="button" (click)="closeTransactionForm()">Fechar</button></header>
        <form [formGroup]="transactionForm" (ngSubmit)="submitTransaction()" novalidate><div class="form-grid">
          <div class="field"><label for="transaction-type">Tipo</label><select id="transaction-type" formControlName="type">@if (editingTransaction()?.type === 'opening') { <option value="opening">Saldo inicial</option> }<option value="deposit">Reforço</option><option value="withdrawal">Levantamento</option></select></div>
          <div class="field"><label for="transaction-amount">Valor em euros *</label><input id="transaction-amount" type="text" inputmode="decimal" formControlName="amount" required>@if (transactionError()) { <p class="field-error">{{ transactionError() }}</p> }</div>
          <div class="field"><label for="transaction-date">Data efetiva *</label><input id="transaction-date" type="date" formControlName="effectiveDate" required></div>
          <div class="field wide"><label for="transaction-note">Nota</label><textarea id="transaction-note" formControlName="note" maxlength="180"></textarea></div>
        </div>@if (formError()) { <p class="form-message" role="alert">{{ formError() }}</p> }<div class="button-row form-actions"><button class="btn btn-primary" type="submit" [disabled]="store.operationPending()">Guardar movimento</button><button class="btn btn-secondary" type="button" (click)="closeTransactionForm()">Cancelar</button></div></form>
      </section></div>
    }

    @if (historyOpen()) {
      <div class="modal-backdrop"><section class="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header class="modal-header"><div><h2 id="history-title">Histórico de movimentos</h2><p>Consulte, filtre e corrija o ledger local.</p></div><button class="btn btn-ghost btn-compact" type="button" (click)="historyOpen.set(false)">Fechar</button></header>
        <div class="history-filters"><div class="field"><label for="history-goal">Objetivo</label><select id="history-goal" [value]="historyGoalFilter()" (change)="setHistoryGoal($event)"><option value="">Todos</option>@for (goal of store.savingsGoals(); track goal.id) { <option [value]="goal.id">{{ goal.name }}</option> }</select></div><div class="field"><label for="history-type">Tipo</label><select id="history-type" [value]="historyTypeFilter()" (change)="setHistoryType($event)"><option value="">Todos</option><option value="opening">Saldo inicial</option><option value="deposit">Reforços</option><option value="withdrawal">Levantamentos</option></select></div></div>
        @if (filteredTransactions().length === 0) { <p class="empty-inline">Não existem movimentos com estes filtros.</p> } @else {
          <div class="history-list">@for (transaction of filteredTransactions(); track transaction.id) { <article><div><strong>{{ transactionTypeLabel(transaction.type) }}</strong><span>{{ goalName(transaction.goalId) }} · {{ formatDate(transaction.effectiveDate) }}</span>@if (transaction.note) { <small>{{ transaction.note }}</small> }</div><strong [class.withdrawal]="transaction.type === 'withdrawal'">{{ transaction.type === 'withdrawal' ? '−' : '+' }}{{ formatCurrency(transaction.amountCents) }}</strong><div class="row-actions"><button class="btn btn-ghost btn-compact" type="button" (click)="openTransactionEdit(transaction)">Editar</button><button class="btn btn-ghost btn-compact danger-text" type="button" (click)="removeTransaction(transaction)">Eliminar</button></div></article> }</div>
        }
      </section></div>
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
  readonly recurrenceLabel = recurrenceLabel;
  readonly incomeFormOpen = signal(false);
  readonly goalFormOpen = signal(false);
  readonly historyOpen = signal(false);
  readonly editingIncome = signal<MonthlyIncome | null>(null);
  readonly editingIncomeOccurrence = signal<IncomeOccurrence | null>(null);
  readonly editingGoal = signal<SavingsGoal | null>(null);
  readonly transactionGoal = signal<SavingsGoal | null>(null);
  readonly editingTransaction = signal<SavingsTransaction | null>(null);
  readonly historyGoalFilter = signal('');
  readonly historyTypeFilter = signal<'' | SavingsTransactionType>('');
  readonly incomeAmountError = signal<string | null>(null);
  readonly goalTargetError = signal<string | null>(null);
  readonly goalCurrentError = signal<string | null>(null);
  readonly goalMonthlyError = signal<string | null>(null);
  readonly transactionError = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly currentMonthName = MONTH_NAMES[new Date().getMonth()];

  readonly incomeForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]], kind: ['salary' as IncomeKind], date: [todayDateString(), Validators.required], amount: ['', Validators.required],
    recurrenceType: ['monthly' as 'none' | RecurrenceFrequency], interval: [1, [Validators.required, Validators.min(1), Validators.max(99)]], endDate: [''], recurrenceStatus: ['active' as 'active' | 'paused'],
  });
  readonly goalForm = this.formBuilder.nonNullable.group({ name: ['', [Validators.required, Validators.maxLength(80)]], kind: ['reserve' as SavingsGoalKind], targetAmount: ['', Validators.required], currentAmount: [''], monthlyContribution: [''], targetDate: [''] });
  readonly transactionForm = this.formBuilder.nonNullable.group({ type: ['deposit' as SavingsTransactionType], amount: ['', Validators.required], effectiveDate: [todayDateString(), Validators.required], note: ['', Validators.maxLength(180)] });
  readonly currentMonthIncomes = computed(() => { const now = new Date(); return incomesForMonth(this.store.monthlyIncomes(), now.getFullYear(), now.getMonth() + 1, this.store.recurrenceExceptions()); });
  readonly monthlyIncomeTotal = computed(() => sumIncomes(this.currentMonthIncomes()));
  readonly totalSaved = computed(() => this.store.savingsGoals().reduce((total, goal) => total + goal.currentAmountCents, 0));
  readonly monthlySavingsPlan = computed(() => this.store.savingsGoals().filter((goal) => this.progress(goal) < 100).reduce((total, goal) => total + goal.monthlyContributionCents, 0));
  readonly currentMonthExpenses = computed(() => { const now = new Date(); return sumExpenses(expensesForMonth(this.store.expenses(), now.getFullYear(), now.getMonth() + 1, this.store.recurrenceExceptions())); });
  readonly availableAfterExpenses = computed(() => this.monthlyIncomeTotal() - this.currentMonthExpenses());
  readonly orderedGoals = computed(() => [...this.store.savingsGoals()].sort((a, b) => Number(this.progress(a) >= 100) - Number(this.progress(b) >= 100) || a.createdAt.localeCompare(b.createdAt)));
  readonly filteredTransactions = computed(() => this.store.savingsTransactions().filter((item) => !this.historyGoalFilter() || item.goalId === this.historyGoalFilter()).filter((item) => !this.historyTypeFilter() || item.type === this.historyTypeFilter()).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)));

  currentOccurrence(income: MonthlyIncome): IncomeOccurrence | undefined { return this.currentMonthIncomes().find((item) => item.seriesId === income.id || item.id === income.id); }
  transactionsForGoal(goalId: string): SavingsTransaction[] { return this.store.savingsTransactions().filter((item) => item.goalId === goalId).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate) || b.createdAt.localeCompare(a.createdAt)); }

  openIncomeCreate(): void { this.editingIncome.set(null); this.editingIncomeOccurrence.set(null); this.incomeForm.reset({ name: '', kind: 'salary', date: todayDateString(), amount: '', recurrenceType: 'monthly', interval: 1, endDate: '', recurrenceStatus: 'active' }); this.resetErrors(); this.incomeFormOpen.set(true); }
  openIncomeEdit(income: MonthlyIncome): void { this.editingIncome.set(income); this.editingIncomeOccurrence.set(null); this.incomeForm.reset({ name: income.name, kind: income.kind, date: income.date, amount: centsToInputValue(income.amountCents), recurrenceType: income.recurrence?.frequency ?? 'none', interval: income.recurrence?.interval ?? 1, endDate: income.recurrence?.endDate ?? '', recurrenceStatus: income.recurrence?.status ?? 'active' }); this.resetErrors(); this.incomeFormOpen.set(true); }
  openIncomeOccurrenceEdit(income: IncomeOccurrence): void { this.editingIncome.set(null); this.editingIncomeOccurrence.set(income); this.incomeForm.reset({ name: income.name, kind: income.kind, date: income.date, amount: centsToInputValue(income.amountCents), recurrenceType: 'none', interval: 1, endDate: '', recurrenceStatus: 'active' }); this.resetErrors(); this.incomeFormOpen.set(true); }
  closeIncomeForm(): void { this.incomeFormOpen.set(false); this.editingIncome.set(null); this.editingIncomeOccurrence.set(null); }

  async submitIncome(): Promise<void> {
    this.resetErrors(); const raw = this.incomeForm.getRawValue(); const amountCents = parseMoneyToCents(raw.amount);
    if (this.incomeForm.invalid || amountCents === null) { this.incomeForm.markAllAsTouched(); if (amountCents === null) this.incomeAmountError.set('Introduza um valor válido e superior a zero.'); return; }
    try {
      const occurrence = this.editingIncomeOccurrence();
      if (occurrence?.seriesId) await this.store.overrideIncomeOccurrence(occurrence.seriesId, occurrence.occurrenceKey.slice(-10), { name: raw.name.trim(), kind: raw.kind, amountCents, date: raw.date });
      else { const recurrence = this.buildRecurrence(raw.date, raw.recurrenceType, raw.interval, raw.endDate, raw.recurrenceStatus); await this.store.saveIncome({ name: raw.name, kind: raw.kind, amountCents, date: raw.date, ...(recurrence ? { recurrence } : {}) }, this.editingIncome()?.id); }
      this.closeIncomeForm();
    } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o rendimento.'); }
  }
  async omitIncomeOccurrence(income: IncomeOccurrence): Promise<void> { if (!income.seriesId || !confirm(`Omitir o rendimento de ${formatDate(income.date)}?`)) return; try { await this.store.skipIncomeOccurrence(income.seriesId, income.occurrenceKey.slice(-10)); } catch { /* erro global */ } }
  async removeIncome(income: MonthlyIncome): Promise<void> { if (!confirm(`Eliminar ${income.recurrence ? 'toda a série' : 'o rendimento'} "${income.name}"?`)) return; try { await this.store.deleteIncome(income.id); } catch { /* erro global */ } }

  openGoalCreate(): void { this.editingGoal.set(null); this.goalForm.reset({ name: '', kind: 'reserve', targetAmount: '', currentAmount: '', monthlyContribution: '', targetDate: '' }); this.resetErrors(); this.goalFormOpen.set(true); }
  openGoalEdit(goal: SavingsGoal): void { this.editingGoal.set(goal); this.goalForm.reset({ name: goal.name, kind: goal.kind, targetAmount: centsToInputValue(goal.targetAmountCents), currentAmount: centsToInputValue(goal.currentAmountCents), monthlyContribution: centsToInputValue(goal.monthlyContributionCents), targetDate: goal.targetDate ?? '' }); this.resetErrors(); this.goalFormOpen.set(true); }
  closeGoalForm(): void { this.goalFormOpen.set(false); this.editingGoal.set(null); }
  async submitGoal(): Promise<void> {
    this.resetErrors(); const raw = this.goalForm.getRawValue(); const targetAmountCents = parseMoneyToCents(raw.targetAmount); const currentAmountCents = parseNonNegativeMoneyToCents(raw.currentAmount); const monthlyContributionCents = parseNonNegativeMoneyToCents(raw.monthlyContribution);
    if (this.goalForm.invalid || targetAmountCents === null || currentAmountCents === null || monthlyContributionCents === null) { this.goalForm.markAllAsTouched(); if (targetAmountCents === null) this.goalTargetError.set('Introduza um objetivo superior a zero.'); if (currentAmountCents === null) this.goalCurrentError.set('Introduza um valor não negativo.'); if (monthlyContributionCents === null) this.goalMonthlyError.set('Introduza um valor não negativo.'); return; }
    try { await this.store.saveSavingsGoal({ name: raw.name, kind: raw.kind, targetAmountCents, currentAmountCents, monthlyContributionCents, ...(raw.targetDate ? { targetDate: raw.targetDate } : {}) }, this.editingGoal()?.id); this.closeGoalForm(); } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o objetivo.'); }
  }
  async removeGoal(goal: SavingsGoal): Promise<void> { if (!confirm(`Eliminar o objetivo "${goal.name}" e todo o seu histórico?`)) return; try { await this.store.deleteSavingsGoal(goal.id); } catch { /* erro global */ } }

  openTransactionCreate(goal: SavingsGoal): void { this.transactionGoal.set(goal); this.editingTransaction.set(null); this.transactionForm.reset({ type: 'deposit', amount: '', effectiveDate: todayDateString(), note: '' }); this.resetErrors(); }
  openTransactionEdit(transaction: SavingsTransaction): void { const goal = this.store.savingsGoals().find((item) => item.id === transaction.goalId); if (!goal) return; this.historyOpen.set(false); this.transactionGoal.set(goal); this.editingTransaction.set(transaction); this.transactionForm.reset({ type: transaction.type, amount: centsToInputValue(transaction.amountCents), effectiveDate: transaction.effectiveDate, note: transaction.note ?? '' }); this.resetErrors(); }
  closeTransactionForm(): void { this.transactionGoal.set(null); this.editingTransaction.set(null); }
  async submitTransaction(): Promise<void> {
    this.resetErrors(); const goal = this.transactionGoal(); const raw = this.transactionForm.getRawValue(); const amountCents = parseMoneyToCents(raw.amount);
    if (!goal || this.transactionForm.invalid || amountCents === null) { this.transactionForm.markAllAsTouched(); if (amountCents === null) this.transactionError.set('Introduza um valor válido e superior a zero.'); return; }
    try { await this.store.saveSavingsTransaction(goal.id, { type: raw.type, amountCents, effectiveDate: raw.effectiveDate, ...(raw.note.trim() ? { note: raw.note.trim() } : {}) }, this.editingTransaction()?.id); this.closeTransactionForm(); } catch (error) { this.formError.set(error instanceof Error ? error.message : 'Não foi possível guardar o movimento.'); }
  }
  async removeTransaction(transaction: SavingsTransaction): Promise<void> { if (!confirm(`Eliminar o movimento de ${formatCurrency(transaction.amountCents)}?`)) return; try { await this.store.deleteSavingsTransaction(transaction.id); } catch { /* erro global */ } }
  openHistory(goal?: SavingsGoal): void { this.historyGoalFilter.set(goal?.id ?? ''); this.historyTypeFilter.set(''); this.historyOpen.set(true); }
  setHistoryGoal(event: Event): void { this.historyGoalFilter.set((event.target as HTMLSelectElement).value); }
  setHistoryType(event: Event): void { this.historyTypeFilter.set((event.target as HTMLSelectElement).value as '' | SavingsTransactionType); }

  progress(goal: SavingsGoal): number { return Math.min(100, Math.round((goal.currentAmountCents / goal.targetAmountCents) * 100)); }
  incomeKindLabel(kind: IncomeKind): string { return ({ salary: 'Salário', subsidy: 'Subsídio', freelance: 'Trabalho independente', other: 'Outro rendimento' })[kind]; }
  incomeInitial(kind: IncomeKind): string { return ({ salary: 'S', subsidy: 'A', freelance: 'T', other: 'O' })[kind]; }
  goalKindLabel(kind: SavingsGoalKind): string { return ({ general: 'Poupança geral', reserve: 'Fundo de reserva', home: 'Casa', car: 'Carro', travel: 'Viagem', education: 'Educação', other: 'Outro objetivo' })[kind]; }
  transactionTypeLabel(type: SavingsTransactionType): string { return ({ opening: 'Saldo inicial', deposit: 'Reforço', withdrawal: 'Levantamento' })[type]; }
  goalName(id: string): string { return this.store.savingsGoals().find((goal) => goal.id === id)?.name ?? 'Objetivo indisponível'; }
  private buildRecurrence(date: string, type: 'none' | RecurrenceFrequency, interval: number, endDate: string, status: 'active' | 'paused'): RecurrenceRule | undefined { if (type === 'none') return undefined; const pausedFrom = status === 'paused' ? (date > todayDateString() ? date : todayDateString()) : undefined; return { frequency: type, interval, startDate: date, status, ...(endDate ? { endDate } : {}), ...(pausedFrom ? { pausedFrom } : {}) }; }
  private resetErrors(): void { this.incomeAmountError.set(null); this.goalTargetError.set(null); this.goalCurrentError.set(null); this.goalMonthlyError.set(null); this.transactionError.set(null); this.formError.set(null); }
}
