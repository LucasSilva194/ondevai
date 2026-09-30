import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-brand-mark',
  standalone: true,
  template: `
    <svg viewBox="0 0 512 512" fill="none" aria-hidden="true" focusable="false">
      <circle cx="256" cy="256" r="174" />
      <path d="M67 364c83-28 184-84 341-94-94 25-174 77-248 167" />
    </svg>
  `,
  styles: `
    :host { width: 38px; height: 38px; display: grid; place-items: center; flex: none; color: var(--forest, #1b3f33); }
    svg { width: 100%; height: 100%; overflow: visible; }
    circle { stroke: currentColor; stroke-width: 34; }
    path { fill: currentColor; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandMarkComponent {}
