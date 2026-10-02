# Website compliance implementation plan

Repository scout, 2026-10-02. Scope: Angular app, PocketBase integration, public assets and documented deployment state. This is an implementation plan, not a legal determination; the operator must supply accurate business, processing, retention and contract terms.

## Findings

| # | Measure | Status | Finding |
|---|---|---|---|
| 1 | Privacy policy | Missing | There is an in-app privacy explanation, but no public policy or footer link. The app processes account email and user-entered financial records in PocketHost; retention, provider roles, rights/contact and backup retention need authoritative details. |
| 2 | Terms of service | Missing | Public registration is available without terms or an acceptance record. |
| 3 | Refund policy | Not applicable now | No plans, checkout, payments or paid features are present. Reassess before adding charges. |
| 4 | Cookie policy | Missing | No tracking cookies or analytics were found. Explain necessary browser storage (PocketBase auth in local storage, service-worker/cache, and any legacy IndexedDB) in the privacy/storage notice. |
| 5 | Cookie consent banner | Not applicable now | No non-essential tracking or advertising SDKs were found. Reassess if optional cookies or similar tracking are introduced. |
| 6 | Form consents | Missing | Registration collects email/password only, but has no linked terms/privacy acknowledgement or age eligibility confirmation. |
| 7 | No unnecessary data | Implemented in current forms | Registration requests only email/password; finance records are user-entered for the app's stated purpose. Keep optional fields optional and review before adding collection. |
| 8 | Third-party SDK audit | No analytics SDK found | Runtime dependencies are app/framework, charting, local migration/storage and PocketBase. PocketBase is required for auth/data; no analytics or telemetry are declared. Recheck dependency additions and document PocketHost as a service provider in the policy. |
| 9 | Dark patterns | No clear instance found | No forced marketing opt-in, preselected paid option, or obstructed deletion found. Keep destructive actions explicit and cancellation available. |
| 10 | Hidden fees | No payment flow found | The landing page says “Começar gratuitamente”; no billing integration or paid plans exist. Make any future pricing and renewal terms visible before commitment. |
| 11 | Fake reviews | None found | No review/testimonial section or fabricated rating found. |
| 12 | Unsupported claims | Needs substantiation review | No customer-review or performance guarantees found. Before launch, substantiate security/control language and label the landing dashboard figures as illustrative (currently only its container is labelled). |
| 13 | Accessibility alt text | No content images found | No `<img>` content images are present. Inline brand/icon SVGs are decorative or labelled, and charts expose accessible labels/text alternatives. Recheck any future imagery. |
| 14 | Color contrast | Gap confirmed | `--text-muted: #788277` on `--page: #f7f3ea` is about 3.61:1, below 4.5:1 for normal text. It is used by small helper and status text. |
| 15 | Keyboard navigation | Partial | Skip link, visible focus styling, semantic controls and keyboard dashboard widget reorder exist. Shared modal shell exposes `role="dialog"` but has no focus entry, focus containment, Escape handling, or focus return. Verify keyboard paths across all flows. |
| 16 | Business details | Missing | Public footer has product/creator link only; no operator identity, registered address/contact or company/tax identifiers where applicable. |
| 17 | Age consent for kids' data | Policy decision missing | Registration has no age eligibility check or child-data policy. Decide whether the service is adult-only; implement the matching notice/check, and avoid collecting children's personal data unless the service is designed and legally prepared for it. |
| 18 | Unsubscribe link in emails | Not applicable now | Only account verification/recovery/change emails are implemented; no marketing subscription is present. Add unsubscribe for any future marketing mail. |
| 19 | License fonts/images | Provenance check needed | UI fonts use system stacks and no external font/image SDK is loaded. Brand/favicon SVG and raster icons are present; their creator/source and reuse rights are not recorded. |
| 20 | Data deletion request | Self-service implemented; retention disclosure missing | Users can clear cloud financial data or delete their account; legacy IndexedDB can be explicitly cleared. Add a public privacy contact/request path for exceptions and disclose operational backup deletion timing once confirmed with PocketHost. |

## Implementation order

1. **Operator and policy inputs:** record the legal operator name, address, contact, applicable registration details, PocketHost processing/region/roles, account and financial-data retention, operational-backup deletion timing, and intended age eligibility. Confirm these with the operator/provider before drafting.
2. **Public legal content:** add linked Privacy and Terms pages, including the necessary browser storage explanation and a data-rights/deletion contact. State no paid service/refunds while the app is free, or add a refund policy before billing exists. Add business details in the public footer/legal pages.
3. **Registration disclosure:** add required unchecked acceptance of Terms and acknowledgement of the Privacy Policy, plus the age gate if adult-only is the chosen service scope. Store only the minimum acceptance evidence needed and explain the record in the policy.
4. **Accessibility fixes:** darken `--text-muted` enough to meet 4.5:1 against its actual surfaces; complete modal focus management (initial focus, Tab containment, Escape, focus return); keyboard-review registration, app navigation, charts, and dashboard reorder.
5. **Launch review:** verify the illustrative landing numbers and privacy/security claims; record asset provenance/license for brand SVG and icons. Re-run the SDK/storage scan before each release. A cookie banner, refund flow, and marketing unsubscribe remain out of scope until their triggering features exist.

## Evidence locations

- Registration: `src/app/features/auth/pages/register.component.ts`
- Public landing/footer and illustrative figures: `src/app/features/landing/pages/landing.component.ts`
- Account/data deletion and legacy storage controls: `src/app/features/data-management/pages/data-management.component.ts`
- Shared dialog: `src/app/shared/components/common/modal-shell.component.ts`
- Color tokens/focus style: `src/styles.css`
- Third-party endpoint/security headers: `src/environments/environment.production.ts`, `public/_headers`
- Deployment, privacy and no-analytics statements: `README.md`
- Asset files: `public/favicon.svg`, `public/icons/`
