import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="20.25" />
      <path d="M9.1 32.1c7.2-2.4 16-7.3 29.6-8.2-8.2 2.2-15.1 6.7-21.5 14.5" />
    </svg>
  `,
  styles: `
    :host { width: 38px; height: 38px; display: grid; place-items: center; flex: none; border-radius: 50%; background: var(--forest, #1b3f33); color: var(--ivory, #f7f3ea); }
    svg { width: 100%; height: 100%; overflow: visible; }
    circle { stroke: currentColor; stroke-width: 3.6; }
    path { fill: currentColor; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {}
