import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class PwaService {
  private readonly updates = inject(SwUpdate);
  private readonly _offline = signal(typeof navigator !== 'undefined' && !navigator.onLine);
  private readonly _updateReady = signal(false);
  readonly offline = this._offline.asReadonly();
  readonly updateReady = this._updateReady.asReadonly();

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { this._offline.set(false); void this.checkForUpdate(); });
      window.addEventListener('offline', () => this._offline.set(true));
    }
    if (this.updates.isEnabled) {
      this.updates.versionUpdates.pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
      ).subscribe(() => this._updateReady.set(true));
      void this.checkForUpdate();
    }
  }

  async checkForUpdate(): Promise<void> {
    if (!this.updates.isEnabled) return;
    try { await this.updates.checkForUpdate(); } catch { /* A versão atual continua utilizável offline. */ }
  }

  async activateUpdate(): Promise<void> {
    if (!this.updates.isEnabled || !this._updateReady()) return;
    await this.updates.activateUpdate();
    location.reload();
  }
}
