import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalDataMigrationService } from '../../core/migration/local-data-migration.service';
import { PwaService } from '../../core/services/pwa.service';
import { AppStore } from '../../core/stores/app.store';
import { OnboardingComponent } from './onboarding.component';

describe('OnboardingComponent', () => {
  const offline = signal(false);
  const migrationSummary = signal<{ totalRecords: number } | null>({ totalRecords: 4 });
  const completeOnboarding = vi.fn().mockResolvedValue(undefined);
  const detectLocalData = vi.fn().mockResolvedValue({ totalRecords: 4 });
  let fixture: ComponentFixture<OnboardingComponent>;

  beforeEach(async () => {
    offline.set(false);
    migrationSummary.set({ totalRecords: 4 });
    completeOnboarding.mockClear();
    detectLocalData.mockClear();
    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [
        provideRouter([]),
        { provide: AppStore, useValue: { operationPending: () => false, completeOnboarding } },
        { provide: PwaService, useValue: { offline: offline.asReadonly() } },
        {
          provide: LocalDataMigrationService,
          useValue: { summary: migrationSummary.asReadonly(), status: () => 'available', detectLocalData },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(OnboardingComponent);
    fixture.detectChanges();
  });

  it('explica conta e cloud sem afirmações local-only', () => {
    let text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Conta protegida');
    expect(text).not.toContain('Sem conta ou registo');

    fixture.componentInstance.step.set(2);
    fixture.detectChanges();
    text = fixture.nativeElement.textContent as string;
    expect(text).toContain('guardados na sua conta');
    expect(text).toContain('PocketBase');
    expect(text).not.toContain('apenas neste dispositivo');
  });

  it('apresenta migração opcional e garante que o IndexedDB original permanece', () => {
    fixture.componentInstance.step.set(3);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Encontrámos dados da versão local');
    expect(text).toContain('IndexedDB não será apagado');
    expect(fixture.nativeElement.querySelector('a[href="/migrar-dados"]')).not.toBeNull();
  });

  it('conclui as categorias sugeridas e navega para a visão geral', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.componentInstance.finish();
    expect(completeOnboarding).toHaveBeenCalledWith(true);
    expect(navigate).toHaveBeenCalledWith(['/visao-geral']);
  });
});
