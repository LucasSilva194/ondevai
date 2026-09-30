import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <svg viewBox="0 0 412 412" aria-hidden="true" focusable="false">
      <g transform="translate(-9 29)" fill="currentColor">
        <path d="M94 250a144 144 0 1 1 119 69l3-47a100 100 0 1 0-81-33l-41 11Z" />
        <path d="M109 269c55-21 123-62 193-72-34 10-64 44-101 102l-11 10c-26-7-58-25-81-40Z" />
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
