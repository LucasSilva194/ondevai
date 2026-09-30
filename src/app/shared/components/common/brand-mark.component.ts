import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <svg viewBox="0 0 386 386" aria-hidden="true" focusable="false">
      <g transform="translate(0 17)" fill="currentColor">
        <path d="M76 253a144 144 0 1 1 120 67l8-44a99 99 0 1 0-85-36l-43 13Z" />
        <path d="M92 271c53-21 129-64 192-73-37 12-75 37-96 68l-19 49c-29-7-57-27-77-44Z" />
      </g>
    </svg>
  `,
  styles: `
    :host { width: 38px; height: 38px; display: grid; place-items: center; flex: none; color: var(--forest, #1b3f33); }
    svg { width: 100%; height: 100%; overflow: visible; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {}
