import { describe, expect, it } from 'vitest';
import { authGuard, guestGuard, verifiedGuard } from './core/auth/auth.guards';
import { appRoutes } from './app.routes';

describe('appRoutes authentication integration', () => {
  it('regista os cinco ecrãs de autenticação com os guards esperados', () => {
    expect(appRoutes.find((route) => route.path === 'entrar')?.canActivate).toEqual([guestGuard]);
    expect(appRoutes.find((route) => route.path === 'registar')?.canActivate).toEqual([guestGuard]);
    expect(appRoutes.find((route) => route.path === 'recuperar-password')?.canActivate).toEqual([guestGuard]);
    expect(appRoutes.find((route) => route.path === 'repor-password')?.canActivate).toEqual([guestGuard]);
    expect(appRoutes.find((route) => route.path === 'confirmar-email')?.canActivate).toBeUndefined();
  });

  it('protege onboarding e a aplicação privada com autenticação e verificação', () => {
    expect(appRoutes.find((route) => route.path === 'migrar-dados')?.canActivate).toEqual([authGuard, verifiedGuard]);
    expect(appRoutes.find((route) => route.path === 'onboarding')?.canActivate).toEqual([authGuard, verifiedGuard]);
    expect(appRoutes.find((route) => route.path === '')?.canActivate).toEqual([authGuard, verifiedGuard]);
  });
});
