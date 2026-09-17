import { Injectable } from '@angular/core';
import { StorageStatus } from '../../models/domain.models';

@Injectable({ providedIn: 'root' })
export class StorageService {
  async requestPersistence(): Promise<StorageStatus> {
    if (typeof navigator === 'undefined' || !navigator.storage) return { supported: false };

    let persisted: boolean | undefined;
    try {
      if (navigator.storage.persisted) persisted = await navigator.storage.persisted();
      if (!persisted && navigator.storage.persist) persisted = await navigator.storage.persist();
    } catch {
      persisted = undefined;
    }

    try {
      const estimate = await navigator.storage.estimate();
      return {
        supported: true,
        ...(persisted === undefined ? {} : { persisted }),
        ...(estimate.usage === undefined ? {} : { usageBytes: estimate.usage }),
        ...(estimate.quota === undefined ? {} : { quotaBytes: estimate.quota }),
      };
    } catch {
      return { supported: true, ...(persisted === undefined ? {} : { persisted }) };
    }
  }
}
