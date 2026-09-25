import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.authenticated()
    || inject(Router).createUrlTree(['/entrar'], { queryParams: { returnUrl: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (!auth.authenticated()) return true;
  return inject(Router).createUrlTree([auth.user()?.verified ? '/visao-geral' : '/confirmar-email']);
};

export const verifiedGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  if (!auth.authenticated()) {
    return inject(Router).createUrlTree(['/entrar'], { queryParams: { returnUrl: state.url } });
  }
  return auth.user()?.verified === true || inject(Router).createUrlTree(['/confirmar-email']);
};
