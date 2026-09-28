# 001 — Animate onboarding step changes

- **Status**: DONE
- **Commit**: a7b2a29
- **Severity**: LOW
- **Category**: Missed opportunity — preventing a jarring change
- **Estimated scope**: 3 source files, about 15–25 lines changed

## Problem

The onboarding progress indicator interpolates when `step()` changes, but the
step content itself is replaced immediately by `@switch`. This is a first-run,
four-step flow, so a short entrance can connect the new content to the progress
change without slowing frequent navigation elsewhere in the app.

Current template in `src/app/features/onboarding/onboarding.component.ts:26–28`:

```html
      <section class="onboarding-card">
        @switch (step()) {
          @case (1) {
            <p class="eyebrow">Bem-vindo</p>
```

All four `@case` blocks currently render their content directly. The action
footer is after the switch and must remain outside the animated step content.

The progress indicator already changes with the step in
`src/app/features/onboarding/onboarding.component.css:10`:

```css
.progress span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width 380ms cubic-bezier(0.16, 1, 0.3, 1); }
```

The onboarding card has a separate first-load entrance at
`src/app/features/onboarding/onboarding.component.css:11`:

```css
.onboarding-card { position: relative; width: min(780px, 100%); margin: auto; padding: clamp(34px, 7vw, 70px); border: 7px solid var(--bezel); border-radius: 34px; background: var(--surface-raised); box-shadow: inset 0 0 0 1px var(--inner-stroke), var(--shadow); animation: onboarding-in 620ms cubic-bezier(0.16, 1, 0.3, 1) both; }
```

## Target

When a step is inserted, fade it in while moving it up by 8px. Use the shared
ease-out token and keep the entrance at 220ms. Do not animate height or the
onboarding card itself during step changes.

Add this token beside `--motion` in the `:root` block in `src/styles.css`:

```css
--ease-out: cubic-bezier(0.23, 1, 0.32, 1);
```

Wrap the contents of each of the four `@case` blocks in
`<div class="onboarding-step">...</div>`. Keep `@switch (step())` and the
existing `onboarding-actions` footer in place; do not put the footer inside the
animated wrapper.

Add this rule to `src/app/features/onboarding/onboarding.component.css`:

```css
.onboarding-step {
  opacity: 1;
  transform: translateY(0);
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(8px);
  }
}
```

Reduced motion should keep a gentle opacity cue and remove movement. The global
rule in `src/styles.css:189–191` sets every transition duration to `0.01ms`
with `!important`, so add this more-specific override to
`onboarding.component.css`:

```css
@media (prefers-reduced-motion: reduce) {
  .onboarding-step {
    transition: opacity 120ms var(--ease-out) !important;
  }
}
```

## Repo conventions to follow

- Shared CSS variables live in the global `:root` block in `src/styles.css`.
- Component-specific motion belongs in that component's stylesheet.
- The current onboarding card uses `cubic-bezier(0.16, 1, 0.3, 1)`; this plan
  adds the canonical shared ease-out curve from the motion audit playbook for
  this new entering state.
- Keep animation to `transform` and `opacity`; the action buttons and progress
  indicator already provide their own feedback.

## Steps

1. In `src/styles.css`, add `--ease-out: cubic-bezier(0.23, 1, 0.32, 1);` in
   `:root` beside `--motion`.
2. In `src/app/features/onboarding/onboarding.component.ts`, wrap each case's
   content in its own `.onboarding-step` div. Preserve the existing case
   conditions, text, controls, and footer placement.
3. In `src/app/features/onboarding/onboarding.component.css`, add the
   `.onboarding-step` `@starting-style` rule from Target, with only opacity and
   transform transitioning for `220ms var(--ease-out)`.
4. Add the reduced-motion override from Target. Confirm its class selector
   overrides the global universal `!important` duration rule and that no
   transform transition remains in reduced-motion mode.

## Boundaries

- Do NOT change the step order, step content, state handlers, progress-bar
  animation, or navigation behavior.
- Do NOT animate the card's height, padding, or position. Different steps have
  different content heights; let layout settle immediately.
- Do NOT add an animation dependency or JavaScript timers.
- Do NOT change other animations or the global reduced-motion rule as part of
  this plan.
- If the switch structure or cited CSS has drifted from the excerpts above,
  stop and report the difference instead of improvising.

## Verification

- **Mechanical**: run `npm run lint` and `npm run build`; both should complete
  successfully.
- **Feel check**: open `/onboarding`, advance through all four steps, then go
  back through them. Confirm each new content block appears promptly and the
  progress bar remains independently animated.
- In DevTools, replay the entrance at 10% speed. Confirm it starts visibly
  formed (no `scale(0)`), moves only 8px, and settles without a pause.
- Enable `prefers-reduced-motion: reduce`. Confirm step content fades for
  `120ms` without positional movement and the global `0.01ms` rule does not
  make this transition instantaneous.
- **Done when**: all four case contents enter consistently, the action footer
  stays stationary, reduced-motion behavior is a short opacity-only fade, and
  both mechanical commands pass.
