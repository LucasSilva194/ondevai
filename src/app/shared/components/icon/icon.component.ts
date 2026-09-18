import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'arrow-right'
  | 'backup'
  | 'balance'
  | 'budgets'
  | 'calendar'
  | 'categories'
  | 'close'
  | 'data'
  | 'expenses'
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
          <path d="M4 13.2h6.8V20H4zM13.2 4H20v16h-6.8zM4 4h6.8v6.8H4z" />
        }
        @case ('expenses') {
          <path d="M5 7.5h14M7 4h10l2 3.5v11A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-11L7 4Z" />
          <path d="M12 10v6m-2.5-2.2L12 16l2.5-2.2" />
        }
        @case ('budgets') {
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z" />
          <path d="M15 11h5v4h-5a2 2 0 1 1 0-4Z" />
        }
        @case ('savings') {
          <path d="M5 10.5A6.5 6.5 0 0 1 11.5 4H15a4 4 0 0 1 4 4v1.2l2 1.3v4l-2 1.3V19h-4v-2H9v2H5v-3.2a6.5 6.5 0 0 1 0-5.3Z" />
          <path d="M11 7h4m-9 3H3" />
          <circle cx="15.5" cy="10" r=".7" fill="currentColor" stroke="none" />
        }
        @case ('categories') {
          <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4Zm9 0A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4Zm-9 9A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4Zm9 2.5h7M16.5 13.5v7" />
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
        @case ('balance') {
          <path d="M4 18V9m5 9V5m6 13v-7m5 7V3" />
        }
        @case ('income') {
          <path d="M12 19V5m-5 5 5-5 5 5M5 20h14" />
        }
        @case ('arrow-right') {
          <path d="M5 12h14m-5-5 5 5-5 5" />
        }
      }
    </svg>
  `,
  styles: `
    :host { width: 1.25rem; height: 1.25rem; display: inline-grid; place-items: center; flex: none; }
    svg { width: 100%; height: 100%; overflow: visible; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IconComponent {
  readonly name = input.required<IconName>();
}
