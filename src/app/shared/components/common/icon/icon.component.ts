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
  | 'apps'
  | 'bank'
  | 'basket'
  | 'bed'
  | 'bolt'
  | 'book'
  | 'building'
  | 'care'
  | 'car'
  | 'chair'
  | 'clean'
  | 'cloud'
  | 'coffee'
  | 'coins'
  | 'device'
  | 'education'
  | 'entertainment'
  | 'family'
  | 'film'
  | 'finance'
  | 'fitness'
  | 'flame'
  | 'food'
  | 'fuel'
  | 'game'
  | 'gift'
  | 'heart'
  | 'health'
  | 'home'
  | 'hobby'
  | 'house-services'
  | 'laptop'
  | 'medical-test'
  | 'medicine'
  | 'mind'
  | 'music'
  | 'nightlife'
  | 'other'
  | 'parking'
  | 'percent'
  | 'phone'
  | 'pets'
  | 'play'
  | 'pencil'
  | 'receipt'
  | 'restaurant'
  | 'scissors'
  | 'shield'
  | 'shirt'
  | 'shoe'
  | 'shopping'
  | 'sparkle'
  | 'takeaway'
  | 'taxi'
  | 'ticket'
  | 'tooth'
  | 'tools'
  | 'toll'
  | 'transit'
  | 'travel'
  | 'water'
  | 'wifi'
  | 'menu'
  | 'overview'
  | 'plus'
  | 'refresh'
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
        @case ('refresh') {
          <path d="M23 4v6h-6M1 20v-6h6M3.5 9A9 9 0 0 1 18 5l5 5M1 14l5 5a9 9 0 0 0 14.5-4" />
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
        @case ('home') { <path d="m3 11 9-7 9 7M5.5 9.5V20h13V9.5M9 20v-6h6v6" /> }
        @case ('house-services') { <path d="M4 20h16M6 20V9l6-5 6 5v11M9 12h6m-6 3h6" /> }
        @case ('food') { <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18m9-18v18m0-18c3 2 4 5 4 8h-4" /> }
        @case ('car') { <path d="m5 11 1.5-5h11L19 11l2 2v6h-2v-2H5v2H3v-6l2-2Zm1 0h12M6 14h.1m11.8 0h.1" /> }
        @case ('health') { <path d="M12 21s-8-4.5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.5-8 11-8 11Z" /><path d="M8 12h8m-4-4v8" /> }
        @case ('care') { <path d="M12 3 14 8l5-2-2 5 5 2-5 2 2 5-5-2-2 5-2-5-5 2 2-5-5-2 5-2-2-5 5 2 2-5Z" /> }
        @case ('shopping') { <path d="M4 8h16l-1 12H5L4 8Zm4 0a4 4 0 0 1 8 0" /> }
        @case ('education') { <path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5Zm4 2.2V16c3.5 2.5 7.5 2.5 11 0v-4.8M21.5 9v7" /> }
        @case ('entertainment') { <path d="M4 5h16v14H4zM8 9l3 3-3 3m5 0h3" /> }
        @case ('travel') { <path d="m3 12 18-8-7 17-3-7-8-2Zm8 2 5-5" /> }
        @case ('family') { <circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20c0-4 2-6 6-6s6 2 6 6m0-5c4-1 6 1 6 5" /> }
        @case ('pets') { <path d="M8 14c-3 0-4 2-4 4 0 2 2 3 4 2l3-1h3l3 1c2 1 4 0 4-2 0-2-1-4-4-4l-3-3h-3l-3 3Z" /><circle cx="5" cy="8" r="1.5" /><circle cx="10" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="20" cy="8" r="1.5" /> }
        @case ('cloud') { <path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9a4.5 4.5 0 0 0 1 9Z" /> }
        @case ('finance') { <path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M3 20h18M12 3l9 4H3l9-4Z" /> }
        @case ('gift') { <path d="M3 10h18v11H3zM2 6h20v4H2zm10 0v15m0-15c-5 0-6-5-3-5 2 0 3 5 3 5Zm0 0c5 0 6-5 3-5-2 0-3 5-3 5Z" /> }
        @case ('other') { <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5m0-8h.01" /> }
        @case ('building') { <path d="M4 21V4h11v17M15 9h5v12M8 8h3m-3 4h3m-3 4h3m7 0h1" /> }
        @case ('tools') { <path d="m14 7 3-3 3 3-3 3m-3-3L5 16l3 3 9-9M4 20l2-2m11-5 3 3-3 3-3-3" /> }
        @case ('chair') { <path d="M6 10V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5M5 10h14v5H5zm2 5v6m10-6v6" /> }
        @case ('shield') { <path d="M12 3 20 6v5c0 5-3 8-8 10-5-2-8-5-8-10V6l8-3Z" /><path d="m8 12 2.5 2.5L16 9" /> }
        @case ('receipt') { <path d="M6 3 8 5l2-2 2 2 2-2 2 2 2-2v18l-2-2-2 2-2-2-2 2-2-2-2 2V3Z" /><path d="M9 9h6m-6 4h6m-6 4h3" /> }
        @case ('bolt') { <path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z" /> }
        @case ('water') { <path d="M12 3S5 11 5 15a7 7 0 0 0 14 0c0-4-7-12-7-12Z" /> }
        @case ('flame') { <path d="M13 3c1 5-4 5-3 9 1-1 2-2 3-3 4 3 6 6 4 10a6 6 0 0 1-11-3c0-4 3-8 7-13Z" /> }
        @case ('wifi') { <path d="M3 9a14 14 0 0 1 18 0M6.5 12.5a9 9 0 0 1 11 0M10 16a3.5 3.5 0 0 1 4 0m-2 4h.01" /> }
        @case ('phone') { <rect x="7" y="2.5" width="10" height="19" rx="2" /><path d="M10 5h4m-2 13h.01" /> }
        @case ('basket') { <path d="M3 10h18l-2 10H5L3 10Zm4 0 4-6m6 6-4-6" /> }
        @case ('restaurant') { <path d="M4 3v7a3 3 0 0 0 6 0V3M7 3v18m9-18v18m0-18c3 2 4 5 4 8h-4" /> }
        @case ('takeaway') { <path d="M5 8h14l-1 13H6L5 8Zm-1-4h16l-1 4H5L4 4Zm5 8v5m6-5v5" /> }
        @case ('coffee') { <path d="M5 8h12v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8Zm12 2h2a2 2 0 0 1 0 4h-2M8 3v2m4-2v2m4-2v2" /> }
        @case ('fuel') { <path d="M5 21V4a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v17M4 21h13M8 6h5v5H8zm8 1h2l3 3v6a2 2 0 0 1-4 0v-4" /> }
        @case ('transit') { <rect x="5" y="3" width="14" height="17" rx="3" /><path d="M5 13h14M8 20l-2 2m10-2 2 2M9 7h.01m6 0h.01" /> }
        @case ('taxi') { <path d="m5 11 2-5h10l2 5 2 2v5h-2v-2H5v2H3v-5l2-2Zm1 0h12M9 3h6v3H9" /> }
        @case ('toll') { <path d="M4 20V8a8 8 0 0 1 16 0v12M4 12h16M8 20V9m8 11V9" /> }
        @case ('parking') { <path d="M6 21V3h7a6 6 0 0 1 0 12H6m0-6h7a2 2 0 0 0 0-4H6" /> }
        @case ('medical-test') { <path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3m-7 12h12" /> }
        @case ('medicine') { <path d="M7 4a5 5 0 0 1 7 0l6 6a5 5 0 0 1-7 7l-6-6a5 5 0 0 1 0-7Zm3 10 7-7" /> }
        @case ('tooth') { <path d="M7 4c2-1 3 1 5 1s3-2 5-1c4 2 1 8 0 12-.5 2-2 5-3 3l-2-6-2 6c-1 2-2-.5-3-3C6 12 3 6 7 4Z" /> }
        @case ('mind') { <path d="M12 4a4 4 0 0 0-7 3 4 4 0 0 0-1 7 4 4 0 0 0 4 6h4V4Zm0 0a4 4 0 0 1 7 3 4 4 0 0 1 1 7 4 4 0 0 1-4 6h-4M8 9h1m6 0h1m-8 5h1m6 0h1" /> }
        @case ('scissors') { <circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="m8 8 12 12M8 16l12-12" /> }
        @case ('fitness') { <path d="M3 10v4m3-7v10m12-10v10m3-7v4M6 12h12" /> }
        @case ('shirt') { <path d="m8 4 4 2 4-2 6 4-3 4-3-2v11H8V10l-3 2-3-4 6-4Z" /> }
        @case ('shoe') { <path d="M3 15c4 0 6-3 7-7l4 4c2 2 4 2 7 2v6H3v-5Zm8-4 2-2" /> }
        @case ('device') { <rect x="3" y="5" width="18" height="12" rx="1.5" /><path d="M2 20h20M9 17l-1 3m7-3 1 3" /> }
        @case ('book') { <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h13M8 8h8m-8 3h6" /> }
        @case ('pencil') { <path d="m4 16-.8 4.8L8 20l12-12-4-4L4 16Zm10-10 4 4" /> }
        @case ('film') { <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3V9ZM3 9h3m-3 6h3m12-6h3m-3 6h3" /> }
        @case ('ticket') { <path d="M3 7a2 2 0 0 0 0 4v2a2 2 0 0 0 0 4h18a2 2 0 0 0 0-4v-2a2 2 0 0 0 0-4H3Z" /><path d="M12 8v2m0 4v2" /> }
        @case ('hobby') { <path d="M12 3v18m-9-9h18M5.6 5.6l12.8 12.8m0-12.8L5.6 18.4" /> }
        @case ('nightlife') { <path d="m8 3 4 8 4-8M7 11h10l3 10H4l3-10Zm5 0v10" /> }
        @case ('bed') { <path d="M3 20V5m0 11h18v4M3 10h18v6m-13-6V7a3 3 0 0 1 6 0v3" /> }
        @case ('coins') { <ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v5c0 1.7 3.6 3 8 3s8-1.3 8-3V6m-16 5v6c0 1.7 3.6 3 8 3 1 0 2-.1 3-.3" /> }
        @case ('play') { <path d="m8 5 11 7-11 7V5Z" /> }
        @case ('music') { <path d="M9 18V5l11-2v13M9 8l11-2M6 21a3 2 0 1 0 0-4 3 2 0 0 0 0 4Zm11-3a3 2 0 1 0 0-4 3 2 0 0 0 0 4Z" /> }
        @case ('apps') { <rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /> }
        @case ('bank') { <path d="M3 9h18M5 9v9m4-9v9m6-9v9m4-9v9M3 20h18M12 3l9 4H3l9-4Z" /><path d="M12 11v4m-2-2h4" /> }
        @case ('percent') { <circle cx="7" cy="7" r="3" /><circle cx="17" cy="17" r="3" /><path d="m19 5-14 14" /> }
        @case ('heart') { <path d="M20 9c0 5-8 11-8 11S4 14 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1Z" /> }
        @case ('clean') { <path d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /> }
        @case ('game') { <path d="M6 8h12a4 4 0 0 1 3.8 5.3l-1.2 3.5a2 2 0 0 1-3.3.8L14 14h-4l-3.3 3.6a2 2 0 0 1-3.3-.8l-1.2-3.5A4 4 0 0 1 6 8Z" /><path d="M7 10v4m-2-2h4m7-1h.01m3 2h.01" /> }
        @case ('laptop') { <rect x="5" y="3" width="14" height="13" rx="1.5" /><path d="M3 19h18l-2 2H5l-2-2Z" /> }
        @case ('sparkle') { <path d="m12 3 1.7 6.3L20 11l-6.3 1.7L12 19l-1.7-6.3L4 11l6.3-1.7L12 3Zm7 12 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z" /> }
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
