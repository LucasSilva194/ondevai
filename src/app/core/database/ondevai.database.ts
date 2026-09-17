import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Category, Expense, Settings } from '../../models/domain.models';

export interface SettingsRecord extends Settings {
  id: 'app';
}

export interface MetadataRecord {
  key: string;
  value: unknown;
}

@Injectable({ providedIn: 'root' })
export class OndeVaiDatabase extends Dexie {
  expenses!: Table<Expense, string>;
  categories!: Table<Category, string>;
  settings!: Table<SettingsRecord, string>;
  metadata!: Table<MetadataRecord, string>;

  constructor() {
    super('ondevai');
    this.version(1).stores({
      expenses: 'id,date,categoryId,subcategoryId,createdAt,updatedAt',
      categories: 'id,order,archived',
      settings: 'id',
      metadata: 'key',
    });
  }
}
