export const POCKETBASE_ENDPOINTS = {
  categories: {
    bulkUpsert: '/api/ondevai/categories/bulk-upsert',
  },
  budgets: {
    bulkUpsert: '/api/ondevai/budgets/bulk-upsert',
  },
  series: {
    delete: '/api/ondevai/series/delete',
  },
  savings: {
    createGoal: '/api/ondevai/savings/goals/create',
    updateGoal: '/api/ondevai/savings/goals/update',
    addTransaction: '/api/ondevai/savings/transactions/create',
    updateTransaction: '/api/ondevai/savings/transactions/update',
    deleteTransaction: '/api/ondevai/savings/transactions/delete',
    deleteGoal: '/api/ondevai/savings/goals/delete',
  },
  data: {
    replaceAll: '/api/ondevai/data/replace-all',
    clearAll: '/api/ondevai/data/clear-all',
  },
  account: {
    delete: '/api/ondevai/account/delete',
  },
} as const;

export class PocketBasePendingEndpointError extends Error {
  constructor(operation: string, endpoint: string) {
    super(`A operação ${operation} requer o endpoint transacional remoto ${endpoint}, ainda não disponível nesta versão.`);
  }
}
