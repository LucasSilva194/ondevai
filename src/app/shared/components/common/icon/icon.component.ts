import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-down'
  | 'archive'
  | 'backup'
  | 'balance'
  | 'budgets'
  | 'calendar'
  | 'chart'
  | 'categories'
  | 'close'
  | 'data'
  | 'expenses'
  | 'edit'
  | 'income'
  | 'menu'
  | 'overview'
  | 'plus'
  | 'savings';

@Component({
  selector: 'app-icon',
  template: `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      @switch (name()) {
        @case ('overview') {
          <path d="M4 20h16M5.5 15v5h3v-5h-3Zm5-5v10h3V10h-3Zm5-5v15h3V5h-3Z" />
        }
        @case ('expenses') {
          <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
          <path d="M3.5 9.5h17m-13 5h3" />
        }
        @case ('budgets') {
          <path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5Z" />
          <path d="M15 4.1a8.5 8.5 0 0 1 4.9 4.9H15V4.1Z" />
        }
        @case ('savings') {
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.5" />
          <circle cx="12" cy="12" r=".8" fill="currentColor" stroke="none" />
        }
        @case ('categories') {
          <path d="M4 4.5h9l7 7-8.5 8.5-7-7v-8.5Z" />
          <circle cx="9" cy="9" r="1" />
        }
        @case ('data') {
          <ellipse cx="12" cy="6" rx="7" ry="3" />
          <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('menu') {
          <path d="M5 7h14M5 12h14M5 17h14" />
        }
        @case ('backup') {
          <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4h8.8L19 7.7v10.8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 18.5v-13Z" />
          <path d="M9 4v5h6V4M9 20v-6h6v6" />
        }
        @case ('close') {
          <path d="m6 6 12 12M18 6 6 18" />
        }
        @case ('calendar') {
          <path d="M5.5 5h13A1.5 1.5 0 0 1 20 6.5v12a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5v-12A1.5 1.5 0 0 1 5.5 5ZM8 3v4m8-4v4M4 9h16" />
        }
        @case ('chart') {
          <path d="M4 19.5h16M6.5 16V11m5 5V5m5 11V8" />
        }
        @case ('balance') {
          <path d="M4 18V9m5 9V5m6 13v-7m5 7V3" />
        }
        @case ('income') {
          <path d="M12 19V5m-5 5 5-5 5 5M5 20h14" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14m-5-5 5 5-5 5" />
        }
        @case ('arrow-up') {
          <path d="M12 19V5m-6 6 6-6 6 6" />
        }
        @case ('arrow-down') {
          <path d="M12 5v14m6-6-6 6-6-6" />
        }
        @case ('edit') {
          <path d="m14 5 5 5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" />
        }
        @case ('archive') {
          <path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" />
        }
      }
    </svg>
  `,
  styles: `
    :host { width: 1.25rem; height: 1.25rem; display: inline-grid; place-items: center; flex: none; vertical-align: middle; }
    svg { width: 100%; height: 100%; overflow: visible; stroke: currentColor; stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
}
