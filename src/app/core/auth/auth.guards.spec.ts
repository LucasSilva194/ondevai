import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, Router, RouterStateSnapshot, UrlTree } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AuthService, AuthUser } from './auth.service';
import { authGuard, guestGuard, verifiedGuard } from './auth.guards';

describe('auth guards', () => {
  const authenticated = signal(false);
  const user = signal<AuthUser | null>(null);
  const route = {} as ActivatedRouteSnapshot;
  const state = { url: '/despesas' } as RouterStateSnapshot;

  beforeEach(() => {
    authenticated.set(false);
    user.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { authenticated: authenticated.asReadonly(), user: user.asReadonly() } },
      ],
    });
  });

  it('authGuard permite utilizadores autenticados', () => {
    authenticated.set(true);
    user.set({ id: 'user', email: 'user@example.com', verified: true });

    expect(runGuard(authGuard)).toBe(true);
  });

  it('authGuard envia visitantes para login e conserva o destino', () => {
    const result = runGuard(authGuard);

    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/entrar?returnUrl=%2Fdespesas');
  });

  it('guestGuard permite visitantes e afasta utilizadores autenticados', () => {
    expect(runGuard(guestGuard)).toBe(true);

    authenticated.set(true);
    user.set({ id: 'user', email: 'user@example.com', verified: true });
    const result = runGuard(guestGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/visao-geral');
  });

  it('guestGuard encaminha utilizadores não verificados para a confirmação', () => {
    authenticated.set(true);
    user.set({ id: 'user', email: 'user@example.com', verified: false });

    const result = runGuard(guestGuard);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe('/confirmar-email');
  });

  it('verifiedGuard distingue visitantes, não verificados e verificados', () => {
    const visitorResult = runGuard(verifiedGuard);
    expect(TestBed.inject(Router).serializeUrl(visitorResult as UrlTree)).toBe('/entrar?returnUrl=%2Fdespesas');

    authenticated.set(true);
    user.set({ id: 'user', email: 'user@example.com', verified: false });
    const unverifiedResult = runGuard(verifiedGuard);
    expect(TestBed.inject(Router).serializeUrl(unverifiedResult as UrlTree)).toBe('/confirmar-email');

    user.set({ id: 'user', email: 'user@example.com', verified: true });
    expect(runGuard(verifiedGuard)).toBe(true);
  });

  function runGuard(guard: typeof authGuard): boolean | UrlTree {
    return TestBed.runInInjectionContext(() => guard(route, state)) as boolean | UrlTree;
  }
});
