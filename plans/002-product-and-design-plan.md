# OndeVai: feature and design plan

## Purpose

Use the strongest ideas visible in MoneyCoach and Spendee to guide OndeVai's next product and UX work. This is a planning document, not an implementation ticket. It prioritizes features that fit OndeVai's current manual-entry, EUR-only, privacy-conscious product, then identifies larger investments separately.

### Product snapshot

OndeVai already supports expenses and income (including recurring series), categories and subcategories, monthly category budgets, savings goals and ledger entries, month/year dashboards, deterministic insights, realtime cloud data, and JSON backup/restore. The app currently has one financial ledger rather than user-managed accounts or wallets. It does not connect to banks, import or export CSV, share a household, or store payees/tags. Currency is currently fixed to EUR.

### Reference scope

The review used the publicly available product pages, not authenticated app sessions. MoneyCoach's current public material describes category budgets, budget adjustments and rollover, upcoming bills, goals, reports, European bank sync, Apple workflows and optional read-only MCP access. Spendee's public product pages describe bank sync and automatic categorization, shared wallets, multiple currencies, transaction import/export, spending charts and budget alerts. Some Spendee marketing copy is visibly old (its footer says 2018), so its specific visual styling and feature availability should be rechecked before implementation. The recommendations below focus on the product patterns, not a pixel-for-pixel copy.

## Plan A — Product features worth adding

### Prioritization

| Priority | Addition | Why it fits OndeVai | Size / dependency |
| --- | --- | --- | --- |
| P0 | Upcoming money calendar and recurring-payment review | Recurring income and expense rules already exist. Bring the next 30 days of bills, subscriptions, and expected income together so users can spot tight weeks before they happen. | Medium; derive from recurrence rules and exceptions, with clear projected/actual labels. |
| P0 | “Available to spend” estimate | MoneyCoach makes the remaining safe-to-spend amount a useful decision cue. OndeVai can calculate a transparent estimate from the user's plan and the days left in the period. | Small–medium; first choose whether this means remaining flexible budget or forecast cash flow after commitments; avoid mixing the two or implying it is a bank balance. |
| P1 | Better transaction organization | Add payee/merchant and user tags, then support filtering, grouping and reports. Spendee's wallet customization and MoneyCoach's payee/tag reports show the value of richer transaction context. | Medium; schema, backup schema migration, search and filter UX. Start with text metadata. |
| P1 | Useful period reports and CSV export | Add income vs expense trends, category/subcategory history, recurring-cost totals, and merchant/tag breakdowns. Export filtered transactions as CSV for people who need their data outside the app. | Medium; build on existing statistics; export should be separate from the current full-account JSON restore backup. |

### Recommended feature sequence

#### 1. Make existing recurring data actionable

- Add an “Upcoming” view for the next 30 days, grouped by date, with recurring expenses, recurring income, and savings contributions where relevant.
- Allow users to skip or adjust one occurrence using the existing recurrence exception behavior. Do not add a “paid/received” state until the transaction model can distinguish a forecast from a confirmed movement.
- Show recurring series management: next occurrence, cadence, expected monthly/yearly cost, and pause/end controls.
- Add a dashboard preview of the next few obligations and a link to the full schedule.
- Distinguish projected items from recorded activity in labels, colors, summaries, and accessibility text.

**Success checks:** users can answer “what is due before payday?”, “how much recurring spend is coming up?”, and “what changed from the schedule?” without confusing forecasts with confirmed transactions. The view does not double-count projected occurrences as actual spending.

#### 2. Add a transparent spending allowance

- Show the estimate for the current month and optionally a per-day guide.
- First settle and document whether the number means remaining flexible budget or forecast cash flow after commitments. Avoid combining these interpretations or double-counting recurring expenses and category budget amounts. Then provide a short “How this is calculated” disclosure listing the inputs and days remaining.
- If there is insufficient history or no income plan, show “Set up income to estimate” instead of inventing a number.
- Treat this as guidance about the user's plan, never as an account balance or guarantee that money is available in a bank account.

**Success checks:** calculation is deterministic and explainable; partial months and future periods are labeled; zero-income and negative-allowance cases have clear wording; tests with mixed budgeted and unbudgeted recurring expenses demonstrate no double-counting.

#### 3. Improve transaction context and reporting

- Add optional merchant/payee and tags to a transaction; keep the entry form quick by placing extra details behind an optional section.
- Provide reusable recent payees/tags, then filter and group expenses by them.
- Add report views for monthly income vs expenses, category trends, top payees/tags, and recurring cost over a year.
- Add CSV export for a selected date range and current filters. Retain JSON as the complete account backup and replacement restore format.

**Success checks:** reports drill through to the transactions behind each number; CSV values use stable headers, ISO dates and clear EUR amounts; backups include new fields and older backup versions still import.

## Plan B — Design and interaction direction

### What to take from the references

| Reference pattern | Apply to OndeVai |
| --- | --- |
| MoneyCoach leads with outcomes such as spending, safe-to-spend, budget status and upcoming bills | Put the next useful decision at the top of each screen; make the numbers and their time period explicit. |
| MoneyCoach connects budgets, bills, goals and reports into one plan | Cross-link related data: budget warning → matching expenses; upcoming bill → recurring series; goal progress → contribution history. |
| Spendee presents a fast overview of income, expense distribution and budgets | Keep charts simple, labeled and interactive; pair every chart with totals and a transaction-level path. |
| Both products reduce setup friction with focused categories and repeated actions | Put the primary action where the user needs it; use recent categories/payees and sensible defaults to shorten entry. |
| Both make progress visible with compact category status and visual proportions | Use consistent progress bars and restrained status colors; reserve danger colors for actual overspending or failed actions. |

### OndeVai design baseline and main opportunities

The current app already has a distinct warm, natural identity: cream surfaces, forest-green accent, editorial serif page titles, responsive navigation, visible budget progress, dark-mode tokens and keyboard focus styling. Preserve that identity. The opportunity is to reduce decoration and make the financial information hierarchy more immediate, not to imitate either brand's exact colors, logos or screen layouts.

| Before | After | Why |
| --- | --- | --- |
| The dashboard opens with a tall heading area and three high-emphasis metric tiles | Use a compact month heading/control row, one clear balance or allowance hero, then smaller income/expense summaries and the next due items | Users should see the current situation and next action without scrolling past a large intro. |
| Dashboard, budget, and shell cards use several nested borders, inset “bezel” effects, rounded surfaces and shadows | Reserve the strongest surface for the primary balance/action; use flat grouping, fewer borders, and one consistent card radius for secondary modules | Less visual chrome makes comparison and status color easier to read, especially on small screens. |
| Month and year are separate labeled selects inside a large framed control | Make period switching a compact, predictable control with clear previous/next affordances and a “Today/current month” shortcut | Period navigation becomes faster and easier to scan without losing accessible labels. |
| Budget state is split across four metrics, a separate status grid, and category rows | Put total planned / spent / remaining together, then sort budget rows by attention needed and show amount + percentage on each row | The user can scan one coherent story and find the categories needing attention sooner. |
| Expense entry exposes date, amount, category, subcategory, description and recurrence together | Make amount, date and category the first task; move recurrence and optional context into a progressive “More details” section; support recent choices | Faster frequent entry with lower cognitive load while preserving all current controls. |
| Reorganizing dashboard widgets is available as a visible specialized mode | Keep customization behind a low-priority “Customize overview” action and offer a useful default order first | The primary workflow should be money review, not dashboard administration. |

### Screen-by-screen design plan

#### Dashboard

- First row: compact period control and one high-contrast headline number, preferably the transparent “available this month” estimate once Plan A's formula exists. Until then keep the monthly balance as the hero.
- Next: smaller income and spending totals with concise period comparison and semantic labels; avoid making all three metrics equally loud.
- Add a small “Coming up” list with date, name, amount and projected badge. Show the nearest three items and a route to all upcoming activity.
- Keep one primary chart at a time. Use direct labels or an accessible legend; clicking a category should filter or open its underlying expenses.
- Place the best one or two deterministic insights under the summary, sorted by practical relevance. Avoid alarm colors for neutral observations.
- Preserve the empty state but make its first action concrete (“Add your first expense” / “Add income”) and preview what the dashboard will show.

#### Budgets

- Present the selected month and a concise summary strip: planned, spent, remaining.
- Sort exceeded and near-limit categories before healthy categories, with a user-visible ordering rule.
- Each row: category marker/name, spent vs limit, remaining amount, progress, and status text. Include percentage but do not rely on color alone.
- Keep edit/remove secondary; use a clear details action for budget history and relevant expense drill-through.
- Offer “Copy last month” as a guided action with a review step; show what will be added, changed or skipped before commit.

#### Expense entry and list

- Use a fast-entry form with amount visually prominent, followed by date and category. Default date to today and retain the user's last/recent category where safe.
- Put description/merchant, subcategory, recurrence and future tags in optional details; do not hide validation or recurrence impact.
- On mobile, consider a bottom-sheet style editor only if it remains keyboard accessible and preserves focus, escape/back dismissal and scroll position.
- Group the list by date with daily subtotals, keep amount alignment consistent, and make filters easy to clear. Show recurrence and projected/actual state as concise chips.

#### Upcoming and reports (new)

- Upcoming screen: chronological agenda with a light month strip/calendar filter, separate expected income and outgoing obligations, and clear projected/paid/skipped states.
- Reports: period tabs, concise summary, one chart, plain-language explanation, then drill-down list. Never make a pie/donut the only way to compare values.

#### Navigation and responsive behavior

- Preserve the desktop sidebar and mobile bottom navigation, but keep navigation labels and active-state treatment consistent across both.
- Keep “Add expense” prominent on mobile. Add income via an equally discoverable secondary route/action where appropriate.
- Ensure sticky mobile header/footer never obscures form actions, error messages, or chart labels; account for safe areas and reduced viewport height.

### Visual system direction

- Retain the warm cream + forest-green identity and current serif display voice, but use serif type mainly for page titles/brand moments. Use the sans family for controls, amounts, labels and dense data.
- Use tabular numerals for money, dates and percentages; align currency values on a shared edge.
- Reduce the visual vocabulary to: page background, primary surface, subtle grouped surface, one accent, success/warning/danger states, and one border level. Let whitespace do most of the separation.
- Keep data colors stable by category across the dashboard, budgets, charts and expense rows. Pair color with text/icon/shape for accessibility.
- Establish spacing steps (8 / 12 / 16 / 24 / 32) and a small set of radii. Use compact density for transaction lists and roomier spacing for summary areas.
- Keep dark mode semantically equivalent: contrast and category identity must survive, and warning/danger states must not depend on hue alone.

### Motion and component polish (Emil design engineering)

- Animate only meaningful state changes. Use immediate feedback for frequent keyboard actions; use short transitions for occasional modals, menus and toasts.
- Standardize interaction timing: press feedback 100–160 ms, small popovers 125–200 ms, dropdowns 150–250 ms, drawers/modals under 300 ms where practical. Use a strong ease-out curve for entry and a clean ease for color changes.
- Use `transform` and `opacity` for motion. Give pressable controls a subtle `scale(0.97)` active state and gate hover movement behind `(hover: hover) and (pointer: fine)`.
- Ensure popovers grow from the triggering control; centered modals should remain centered. Prefer interruptible transitions for rapidly toggled elements.
- Add reduced-motion behavior that removes position/scale travel while retaining helpful opacity or color feedback. Avoid animating charts in ways that delay reading values.
- Keep focus visible, return focus after dialogs close, provide labels/value text for charts and progress, and make projected/actual state understandable without color.

### Design delivery sequence

1. **Foundation:** agree on spacing, radius, border/shadow and type tokens; clean up card emphasis; standardize button, field, badge, progress and dialog states.
2. **Dashboard:** implement the information hierarchy and period controls; test with empty, normal, overspent, partial-month and future-period data.
3. **Budget and entry flows:** streamline category rows and progressive expense entry; preserve accessible labels, recurrence behavior and visible confirmation/errors.
4. **Upcoming and reports:** design these new screens around projected-vs-actual clarity and drill-through behavior.
5. **Responsive and motion pass:** inspect narrow phones, desktop, light/dark mode, keyboard-only use, reduced-motion, loading, offline/error, and long localized values.

## Shared definition of done

- Every financial total explains its date range and whether it is actual or projected.
- Each insight or chart can be traced to the transactions or recurrence rules that produced it.
- New data is included in export/restore and old backups continue to load through a deliberate schema migration.
- Any future multi-record financial operation follows OndeVai's existing server-side atomicity patterns.
- The default flow remains manual and useful without bank integration.
- UX remains usable at narrow mobile widths, by keyboard, with screen readers, in dark mode and with reduced motion enabled.

## Sources

- [MoneyCoach home and current feature overview](https://moneycoach.ai/)
- [MoneyCoach Category Budgets](https://moneycoach.ai/category-budgets)
- [MoneyCoach Financial Reports](https://moneycoach.ai/financial-reports)
- [MoneyCoach Goals](https://moneycoach.ai/features/goals)
- [Spendee home](https://www.spendee.com/)
- [Spendee Pricing and feature comparison](https://www.spendee.com/pricing)
- [Spendee bank connections and security overview](https://www.spendee.com/bank-connect)
