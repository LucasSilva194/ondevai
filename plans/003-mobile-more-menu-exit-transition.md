# 003 — Add a matching mobile menu exit transition

- **Status**: DONE
- **Commit**: 3d7447d
- **Severity**: LOW
- **Category**: Missed opportunity — preventing a jarring change
- **Estimated scope**: 2 source files, about 20–30 lines changed

## Problem

The mobile “Mais opções” panel enters with a fade and short settling motion,
but the scrim appears instantly. When the menu closes, Angular removes both
elements immediately, so neither has an exit. This makes opening and closing
feel asymmetric. The menu is an occasional surface, so a short, reversible
transition helps communicate that it is attached to the header trigger without
delaying navigation.

In `src/app/shared/components/layout/app-shell/app-shell.component.ts:58–61`,
the `@if` block currently inserts and removes the scrim and panel directly:

```html
        @if (mobileMenuOpen()) {
          <button class="mobile-menu-scrim" type="button" aria-label="Fechar menu" (click)="mobileMenuOpen.set(false)"></button>
          <nav class="mobile-more-menu" id="mobile-more-menu" aria-label="Mais opções">
```

In `src/app/shared/components/layout/app-shell/app-shell.component.css:121–122`,
the scrim has no entrance or exit and the panel uses a one-way animation with a
local cubic-bezier value:

```css
  .mobile-menu-scrim { position: fixed; inset: 0; z-index: 21; padding: 0; border: 0; background: color-mix(in srgb, var(--page) 54%, transparent); backdrop-filter: blur(3px); cursor: default; }
  .mobile-more-menu { position: fixed; top: 82px; right: 12px; z-index: 22; width: min(340px, calc(100% - 24px)); padding: 10px; border: 1px solid var(--border); border-radius: 21px; background: color-mix(in srgb, var(--surface) 96%, transparent); box-shadow: inset 0 0 0 4px var(--bezel), var(--shadow); backdrop-filter: blur(18px); animation: mobile-menu-in 180ms cubic-bezier(.16, 1, .3, 1) both; }
```

The shared curve is already defined as `--ease-out: cubic-bezier(0.23, 1, 0.32,
1)` in `src/styles.css:31`. The global reduced-motion rule at
`src/styles.css:225–227` forces every transition duration to `0.01ms !important`,
so the menu needs a more-specific reduced-motion variant to preserve a gentle
opacity cue while removing movement. The onboarding step in
`src/app/features/onboarding/pages/onboarding.component.css:13–21` already uses
`@starting-style` with CSS transitions as the project pattern for an entrance.

## Target

Use CSS transitions so entry and exit can retarget from the current visual
state. Use `@starting-style` for entry and Angular's built-in `animate.leave`
attribute to keep each element in the DOM until its closing transition ends.
Keep the existing 180ms duration, use `var(--ease-out)`, and make the exit
reverse the entrance:

- Panel entrance: opacity `0` to `1`; `translateY(-8px) scale(.98)` to
  `translateY(0) scale(1)`.
- Panel exit: opacity `1` to `0`; `translateY(0) scale(1)` to
  `translateY(-8px) scale(.98)`.
- Scrim entrance and exit: opacity `0` to `1` and back.

Add `animate.leave` to the two existing elements in `app-shell.component.ts`:

```html
          <button class="mobile-menu-scrim" type="button" aria-label="Fechar menu" (click)="mobileMenuOpen.set(false)"
            animate.leave="mobile-menu-scrim-leave"></button>
          <nav class="mobile-more-menu" id="mobile-more-menu" aria-label="Mais opções"
            animate.leave="mobile-more-menu-leave">
```

In `app-shell.component.css`, remove the panel's `animation:` declaration and
use these transitions and starting styles in the existing rules:

```css
.mobile-menu-scrim {
  opacity: 1;
  transition: opacity 180ms var(--ease-out);

  @starting-style { opacity: 0; }
}

.mobile-more-menu {
  opacity: 1;
  transform: translateY(0) scale(1);
  transition: opacity 180ms var(--ease-out), transform 180ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(-8px) scale(.98);
  }
}

.mobile-menu-scrim-leave { opacity: 0; }
.mobile-more-menu-leave {
  opacity: 0;
  transform: translateY(-8px) scale(.98);
}
```

Under `prefers-reduced-motion: reduce`, keep an opacity-only 180ms transition
for both elements. Set `.mobile-menu-scrim` and `.mobile-more-menu` to
`transition-duration: 180ms !important`; set `.mobile-more-menu` to
`transition-property: opacity !important` so it does not move. These more
specific important declarations must override the global `0.01ms !important`
duration rule. Do not add `transform` to the reduced-motion transition.

## Repo conventions to follow

- Keep component-specific transitions in
  `src/app/shared/components/layout/app-shell/app-shell.component.css`.
- Use the shared global easing token `var(--ease-out)` from `src/styles.css:31`;
  do not add another cubic-bezier token.
- The existing panel entrance uses an 180ms duration. Keep that duration for
  both directions and the scrim so they move as one surface.
- Use `@starting-style` as in
  `src/app/features/onboarding/pages/onboarding.component.css:13–21` and
  Angular's built-in `animate.leave`; do not add a motion dependency.

## Steps

1. In `app-shell.component.ts`, add the `animate.leave` attributes shown above
   to the existing scrim button and menu `nav` inside the current `@if` block.
   Do not change open/close handlers, ARIA attributes, content, or stacking
   structure.
2. In `app-shell.component.css`, remove the current `animation:` declaration
   and `mobile-menu-in` keyframes. Add the base-state transitions,
   `@starting-style` blocks, and leave classes shown in **Target**. Keep all
   motion to opacity and transform.
3. Add the reduced-motion transition rules from **Target**, making sure their
   `!important` duration and property declarations override the global rule.

## Boundaries

- Do NOT touch the bottom navigation, hamburger icon, route transitions, or
  menu row interactions.
- Do NOT change the panel's position, dimensions, blur, shadow, scrim opacity,
  markup hierarchy, or menu behavior.
- Do NOT add dependencies or modify global motion tokens.
- If Angular's `animate.leave` behavior or the cited rules differ from this plan,
  stop and report the drift instead of improvising.

## Verification

- **Mechanical**: run `npm run build`; expect Angular compilation to complete
  without template or CSS errors. Run `npm run lint`; expect no lint errors.
- **Feel check**: open and close “Mais opções” from the mobile header using the
  hamburger, a menu link, and the scrim. Confirm the panel enters from the
  header side and exits along the same path while the scrim fades in and out in
  sync. Toggle the menu again during its transition and confirm the CSS
  transition retargets from its current visual state without a keyframe restart.
- In browser DevTools, slow transition playback and confirm panel movement is
  limited to `translateY(-8px)` and scale `.98` to `1`. Enable
  `prefers-reduced-motion: reduce` and confirm the 180ms fades remain while
  panel movement is absent.
- **Done when**: opening and closing the panel and scrim both transition over
  180ms with `var(--ease-out)`, and reduced motion retains only the opacity cue.
