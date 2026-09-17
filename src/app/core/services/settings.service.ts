import { Injectable, inject } from '@angular/core';
import { DEFAULT_SETTINGS, Settings } from '../../models/domain.models';
import { SETTINGS_REPOSITORY } from '../repositories/repository.tokens';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly repository = inject(SETTINGS_REPOSITORY);

  async getOrCreate(): Promise<Settings> {
    const settings = await this.repository.get();
    if (settings) return settings;
    const initial = { ...DEFAULT_SETTINGS };
    await this.repository.put(initial);
    return initial;
  }

  async setOnboardingCompleted(completed: boolean): Promise<Settings> {
    const current = await this.getOrCreate();
    const updated = { ...current, onboardingCompleted: completed };
    await this.repository.put(updated);
    return updated;
  }
}
