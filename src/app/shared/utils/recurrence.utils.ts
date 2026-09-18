import {
  Expense,
  ExpenseOccurrence,
  IncomeOccurrence,
  MonthlyIncome,
  RecurrenceException,
  RecurrenceRule,
} from '../../models/domain.models';

function parseDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function dateString(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthlyOccurrence(start: Date, monthOffset: number): Date {
  const absoluteMonth = start.getUTCFullYear() * 12 + start.getUTCMonth() + monthOffset;
  const year = Math.floor(absoluteMonth / 12);
  const monthIndex = absoluteMonth % 12;
  const day = Math.min(start.getUTCDate(), daysInMonth(year, monthIndex + 1));
  return new Date(Date.UTC(year, monthIndex, day));
}

function yearlyOccurrence(start: Date, yearOffset: number): Date {
  const year = start.getUTCFullYear() + yearOffset;
  const monthIndex = start.getUTCMonth();
  const day = Math.min(start.getUTCDate(), daysInMonth(year, monthIndex + 1));
  return new Date(Date.UTC(year, monthIndex, day));
}

export function occurrenceKey(seriesType: 'expense' | 'income', seriesId: string, occurrenceDate: string): string {
  return `${seriesType}:${seriesId}:${occurrenceDate}`;
}

export function validateRecurrenceRule(rule: RecurrenceRule): boolean {
  return ['weekly', 'monthly', 'yearly'].includes(rule.frequency)
    && Number.isSafeInteger(rule.interval)
    && rule.interval > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(rule.startDate)
    && (!rule.endDate || rule.endDate >= rule.startDate)
    && (!rule.pausedFrom || rule.pausedFrom >= rule.startDate)
    && ['active', 'paused'].includes(rule.status)
    && (rule.status === 'active' || Boolean(rule.pausedFrom));
}

/**
 * Materialises only the requested window. Monthly dates clamp to the last valid
 * day and 29 February clamps to 28 February in non-leap years. End dates are inclusive.
 */
export function occurrenceDatesBetween(rule: RecurrenceRule, from: string, to: string): string[] {
  if (!validateRecurrenceRule(rule) || from > to) return [];
  const hardEnd = [to, rule.endDate, rule.status === 'paused' ? rule.pausedFrom : undefined]
    .filter((value): value is string => Boolean(value))
    .sort()[0];
  const inclusiveEnd = rule.status === 'paused' && rule.pausedFrom && hardEnd === rule.pausedFrom
    ? dateString(new Date(parseDate(hardEnd).getTime() - 86_400_000))
    : hardEnd;
  if (inclusiveEnd < rule.startDate || inclusiveEnd < from) return [];

  const start = parseDate(rule.startDate);
  const dates: string[] = [];
  let index = 0;
  while (true) {
    let candidate: Date;
    if (rule.frequency === 'weekly') {
      candidate = new Date(start.getTime() + index * rule.interval * 7 * 86_400_000);
    } else if (rule.frequency === 'monthly') {
      candidate = monthlyOccurrence(start, index * rule.interval);
    } else {
      candidate = yearlyOccurrence(start, index * rule.interval);
    }
    const candidateString = dateString(candidate);
    if (candidateString > inclusiveEnd) break;
    if (candidateString >= from) dates.push(candidateString);
    index += 1;
  }
  return dates;
}

function matchingExceptions(
  exceptions: readonly RecurrenceException[],
  seriesType: 'expense' | 'income',
  seriesId: string,
): RecurrenceException[] {
  return exceptions.filter((item) => item.seriesType === seriesType && item.seriesId === seriesId);
}

export function materializeExpenses(
  expenses: readonly Expense[],
  exceptions: readonly RecurrenceException[],
  from: string,
  to: string,
): ExpenseOccurrence[] {
  return expenses.flatMap((expense): ExpenseOccurrence[] => {
    if (!expense.recurrence) {
      if (expense.date < from || expense.date > to) return [];
      return [{ ...expense, occurrenceKey: `expense:${expense.id}`, source: 'one-off' }];
    }
    const seriesExceptions = matchingExceptions(exceptions, 'expense', expense.id);
    const dates = new Set(occurrenceDatesBetween(expense.recurrence, from, to));
    for (const exception of seriesExceptions) {
      if (exception.action === 'override' && exception.changes?.date
        && exception.changes.date >= from && exception.changes.date <= to) {
        dates.add(exception.occurrenceDate);
      }
    }
    return [...dates].flatMap((date): ExpenseOccurrence[] => {
      const exception = seriesExceptions.find((item) => item.occurrenceDate === date);
      if (exception?.action === 'skip') return [];
      const changes = exception?.changes ?? {};
      const occurrence: ExpenseOccurrence = {
        ...expense,
        ...changes,
        id: occurrenceKey('expense', expense.id, date),
        date: changes.date ?? date,
        occurrenceKey: occurrenceKey('expense', expense.id, date),
        source: exception?.action === 'override' ? 'override' : 'series',
        seriesId: expense.id,
      };
      return occurrence.date >= from && occurrence.date <= to ? [occurrence] : [];
    });
  }).sort((a, b) => b.date.localeCompare(a.date) || a.occurrenceKey.localeCompare(b.occurrenceKey));
}

export function materializeIncomes(
  incomes: readonly MonthlyIncome[],
  exceptions: readonly RecurrenceException[],
  from: string,
  to: string,
): IncomeOccurrence[] {
  return incomes.flatMap((income): IncomeOccurrence[] => {
    if (!income.recurrence) {
      if (income.date < from || income.date > to) return [];
      return [{ ...income, occurrenceKey: `income:${income.id}`, source: 'one-off' }];
    }
    const seriesExceptions = matchingExceptions(exceptions, 'income', income.id);
    const dates = new Set(occurrenceDatesBetween(income.recurrence, from, to));
    for (const exception of seriesExceptions) {
      if (exception.action === 'override' && exception.changes?.date
        && exception.changes.date >= from && exception.changes.date <= to) {
        dates.add(exception.occurrenceDate);
      }
    }
    return [...dates].flatMap((date): IncomeOccurrence[] => {
      const exception = seriesExceptions.find((item) => item.occurrenceDate === date);
      if (exception?.action === 'skip') return [];
      const changes = exception?.changes ?? {};
      const occurrence: IncomeOccurrence = {
        ...income,
        ...changes,
        id: occurrenceKey('income', income.id, date),
        date: changes.date ?? date,
        occurrenceKey: occurrenceKey('income', income.id, date),
        source: exception?.action === 'override' ? 'override' : 'series',
        seriesId: income.id,
      };
      return occurrence.date >= from && occurrence.date <= to ? [occurrence] : [];
    });
  }).sort((a, b) => b.date.localeCompare(a.date) || a.occurrenceKey.localeCompare(b.occurrenceKey));
}

export function recurrenceLabel(rule?: RecurrenceRule): string {
  if (!rule) return 'Pontual';
  const unit = rule.frequency === 'weekly' ? 'semana' : rule.frequency === 'monthly' ? 'mês' : 'ano';
  const cadence = rule.interval === 1 ? `Todos os ${unit === 'mês' ? 'meses' : `${unit}s`}` : `A cada ${rule.interval} ${unit}s`;
  return `${cadence}${rule.status === 'paused' ? ' · pausada' : ''}`;
}
