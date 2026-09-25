import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { UserSessionService } from '../../../core/auth/user-session.service';
import { PwaService } from '../../../core/services/pwa.service';
import { AppStore } from '../../../core/stores/app.store';
import { AppShellComponent } from './app-shell.component';

describe('AppShellComponent', () => {
  const offline = signal(false);
  const syncing = signal(false);
  const lastSyncedAt = signal<string | null>('2026-09-25T12:00:00.000Z');
  const connectionError = signal<string | null>(null);
  const logout = vi.fn().mockResolvedValue(undefined);
  let fixture: ComponentFixture<AppShellComponent>;

  beforeEach(async () => {
    offline.set(false);
    syncing.set(false);
    lastSyncedAt.set('2026-09-25T12:00:00.000Z');
    connectionError.set(null);
    logout.mockClear();
    await TestBed.configureTestingModule({
      imports: [AppShellComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: () => ({ email: 'pessoa@example.com', verified: true }) } },
        { provide: UserSessionService, useValue: { logout } },
        {
          provide: AppStore,
          useValue: {
            shouldRemindBackup: () => false,
            operationPending: () => false,
            error: () => null,
            clearError: vi.fn(),
            syncing: syncing.asReadonly(),
            lastSyncedAt: lastSyncedAt.asReadonly(),
            connectionError: connectionError.asReadonly(),
            exportBackup: vi.fn(),
          },
        },
        { provide: PwaService, useValue: { offline: offline.asReadonly(), updateReady: () => false, activateUpdate: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AppShellComponent);
    fixture.detectChanges();
  });

  it('mostra email, estado de sincronização e links de Conta em desktop e mobile', () => {
    fixture.componentInstance.mobileMenuOpen.set(true);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    const accountLinks = fixture.nativeElement.querySelectorAll('a[href="/conta"]');
    expect(text).toContain('pessoa@example.com');
    expect(text).toContain('Sincronizado');
    expect(accountLinks.length).toBeGreaterThanOrEqual(2);
  });

  it('usa UserSessionService para logout no shell', async () => {
    await fixture.componentInstance.logout();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('apresenta um banner offline honesto sem prometer escrita local', () => {
    offline.set(true);
    fixture.detectChanges();

    const banner = fixture.nativeElement.querySelector('.offline-banner').textContent as string;
    expect(banner).toContain('não é possível garantir informação atualizada nem guardar alterações');
    expect(banner).not.toContain('guarda os dados neste dispositivo');
  });

  it('mantém os dados visíveis quando existe erro realtime', () => {
    connectionError.set('Ligação realtime interrompida.');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.connection-error').textContent).toContain('Os dados já carregados continuam visíveis');
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });
});
