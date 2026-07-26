# Home Affordability Tool — Web App Build Spec (Firestore Edition)

## What this is

A personal home-affordability and comparison calculator, currently living as an
Excel workbook (`Home_Affordability_707_S_Laurel.xlsx`) built around one candidate
property, with 11 tabs and 5,300+ formulas. It's become unwieldy to use on a phone
or iPad. This spec is for rebuilding it as a responsive web app that **compares
multiple candidate properties against one shared household financial picture**,
hosted publicly on GitHub Pages, with all financial data stored in Firestore
instead of in the repo — because the repo (and therefore the deployed site's
source) is public, and the numbers in this tool are not.

**This is a personal financial tool for one household, not a generic product.** Don't
generalize it into a multi-tenant SaaS thing. The intended audience is exactly one
household plus anyone they explicitly invite.

## ⚠️ Read this before writing any auth code

The person requesting this tool described the desired UX as "a field where you drop
the API key to the db so that only me and anyone I share the key with can see the
data." That UX is achievable, but **a Firebase Web API key by itself does not provide
that security guarantee**, and building it as if it does would ship a tool that looks
private but isn't.

Here's the actual situation, and the design that gets the intended outcome anyway:

- A Firebase **Web API key** (the `apiKey` field in a Firebase config object) is
  explicitly designed by Google to be public. It identifies *which Firebase project*
  a client is talking to — it is not a password, and Google's own documentation says
  not to treat it as secret. It will end up visible in the browser's network tab no
  matter how it's entered, because the browser has to send it to Firebase.
- **The actual access control lives in two places:** (1) Firestore Security Rules,
  which run on Google's servers and decide who can read/write which documents, and
  (2) some form of authentication that proves *who* is asking, so the rules have
  something to check.
- So: build the "paste in a credential" flow the person asked for, but make what's
  pasted in either (a) the Firebase project config *plus* a password-based sign-in
  step, or (b) if the absolute simplest possible UX is wanted, a single shared
  passphrase that the app exchanges for a Firebase custom auth token via a small
  Cloud Function — never a flow where the Firestore rules trust the client's
  self-reported identity with no server-side check.
- **Recommended default (simplest that's actually secure):** Firebase Authentication
  with email/password. The person creates one account for themselves; anyone they
  "share the key with" gets invited as a second email/password account. Firestore
  rules restrict all reads/writes to an explicit allowlist of UIDs. The "paste in
  your credentials" screen becomes a login form (email + password) rather than a
  raw API-key field — same spirit ("only people I let in can see this"),
  implemented so it's actually true.
- If a literal "paste a key, no login form" experience is really wanted, the only
  way to do that safely is a **long, random, unguessable shared secret** (not the
  Firebase API key — a separate app-level secret generated once and shared
  out-of-band) that's exchanged server-side (Cloud Function) for a short-lived
  Firebase custom auth token. This is more work than email/password auth for no
  real security benefit in a single/small-household context, so **default to
  email/password auth** unless told otherwise.

State this plainly in the app's own README / setup instructions too, so it's clear
why the login screen looks like a login screen and not just an API-key paste box.

## Priorities, in order

1. **Correctness.** Every number must be traceable to a formula and an input. No
   hardcoded results. This is the same standard the spreadsheet was held to.
2. **Data privacy.** Financial data must never be committed to the (public) GitHub
   repo, never appear in the static site bundle, and never be readable from
   Firestore by anyone not on the access allowlist.
3. **Transparency.** Assumptions should be visible and editable in place, not
   buried in a settings modal.
4. **Mobile usability.** The spreadsheet is unreadable on a phone. This app's first
   job is being pleasant to check on an iPhone in a realtor's driveway.
5. **Honesty about uncertainty.** Several inputs are placeholders/guesses, not
   facts. The UI must visually distinguish "confirmed data" from "guess — replace
   me" at all times, the way the spreadsheet used blue/yellow cell coloring.

## Architecture

```
┌─────────────────────────────┐
│  GitHub Pages (public)      │   Static bundle: HTML/CSS/JS only.
│  - No financial data        │   Contains ONLY the Firebase project config
│  - No secrets               │   (safe to expose) and app code.
└──────────────┬──────────────┘
               │  (Firebase Auth: email/password sign-in)
               ▼
┌─────────────────────────────┐
│  Firebase Authentication    │   Gates who can even attempt to read data.
└──────────────┬──────────────┘
               │  (authenticated requests only)
               ▼
┌─────────────────────────────┐
│  Firestore                  │   Holds every input, note, and needsReview flag
│  - Security Rules enforce   │   from the model. One document (or a small set
│    UID allowlist            │   of documents) per household.
└─────────────────────────────┘
```

- **Repo:** app code + Firebase project config (`apiKey`, `authDomain`, `projectId`,
  etc. — all safe to expose) only. **No financial figures, ever, in the repo.**
- **Firestore:** the actual data — everything currently in
  `home-affordability-data.xml`, restructured as documents (see Data Model below).
- **Security Rules:** deny-by-default; explicit allow only for UIDs on the
  household's allowlist. Include the rules file in the repo (rules are not secret —
  they're the lock, and open-sourcing a lock design doesn't defeat it as long as
  the keys/credentials are separate).
- **Hosting:** GitHub Pages for the static frontend. Firebase project (Auth +
  Firestore) is separate infrastructure — free tier is almost certainly sufficient
  for single-household read/write volume.

## Migrating the existing data

Two companion XML files are included in this handoff, **neither to be committed to
the public repo**:

- **`home-affordability-data.xml`** — now split into `<household>` (everything
  that doesn't depend on which house is being considered: income, tax
  assumptions, assets, the departing residence's carrying cost, the spouse
  data-coverage-gap placeholder, closing-cost assumptions, the budget-line
  taxonomy) and `<properties>` (one `<property>` element per candidate house —
  currently five: 707 S Laurel, 915 E 6th St, 1029 Longfellow Ave, 116 S Kenwood
  Ave, and 1102 N Lafayette Ave — each with its own price, loan terms, property
  tax calculation, carrying costs, and a `<ratings>` block for each household
  member's stars/notes on that specific house).
- **`transactions.xml`** — 3,450 individual transactions as of the 7/26/26 merges: 1,459 for Adam (including 19 tagged `source="Discover CSV"` — 95 duplicates surfaced by an audit pass were removed) plus 1,991 for Lauren (Citi Double Cash card, a small second card, a fully-itemized American Express account parsed from real QBO/OFX exports, checking, and savings — all tagged `person="Lauren"`). This FULLY closes the person-coverage gap `dataCoverageGap` used to flag: both spouses' spending is now itemized from real source documents. See the calculation notes below on the Roth-401(k) correction and the resolved DTE double-counting question.

**Property data-completeness varies a lot across these five.** 707 S Laurel is
fully specced — it was the original spreadsheet's reference property, so every
field is real. 915 E 6th St has confirmed sqft/beds/baths/style pulled from a
listing. The other three (1029 Longfellow, 116 S Kenwood, 1102 N Lafayette)
currently have only a confirmed list price — everything else is a
`needsReview="true"` placeholder, including, for some of them, basic facts like
square footage. **1102 N Lafayette already carries a 5-star rating from both
household members despite being the least financially-specced property on the
list** — this is a real signal worth surfacing prominently in the UI (see the
Compare screen below), not something to hide until the numbers catch up.

Write a **one-time, locally-run migration script** (Node.js, using the Firebase
Admin SDK and a service account key — run once on a local machine, never deployed
or committed) that:

1. Parses both XML files.
2. Writes the `<household>` sections of `home-affordability-data.xml` as fields on
   the household document (see Data Model).
3. Writes each `<property>` under `<properties>` as its own document in the
   `properties` sub-collection, preserving its `id` attribute as the document ID.
4. Writes all 3,450 records from `transactions.xml` into a `transactions`
   sub-collection under the same household document — one Firestore document per
   transaction is simplest and keeps re-categorization (editing a single
   transaction's budget line) cheap.
5. Preserves every `needsReview="true"` flag, every `<note>` element, and both
   transaction correction flags (`oneTimeExcluded`, `linkedCardPaymentExcluded`) as
   fields on their respective documents.

After migration, both XML files and the service account key should live outside
the repo entirely (local folder, password manager, or a private/local-only,
`.gitignore`'d directory) — treat all three as sensitive.

### Building the budget live from transactions, instead of trusting pre-aggregated numbers

The spreadsheet's Household Budget tab was built by summing the Transactions tab
live, against whatever averaging window and budget-line classifications were
current at the time. The pre-aggregated figures in `home-affordability-data.xml`
(e.g. `householdBudget.nonHousingLivingExpensesMonthly`) are a snapshot of what
that produced — useful as a sanity-check target, but not meant to be the web app's
permanent source of truth once transaction data is available.

**Prefer recomputing the budget live from the `transactions` collection**, the way
the spreadsheet did, rather than treating the pre-aggregated numbers in
`home-affordability-data.xml` as fixed. This gets you, for free, things the
spreadsheet struggled to make mobile-friendly:

- An adjustable averaging window (last 12 months, last calendar year, exclude a
  specific trip, etc.) that recomputes every downstream number.
- Re-categorizing a single transaction in the UI (tapping a transaction and
  changing its budget line) and seeing the budget update immediately, with no
  separate "now go update the aggregate cell" step.
- A natural place to append a second person's transaction export later — new
  documents in the same `transactions` sub-collection, tagged with their name —
  without hand-recomputing anything.

When recomputing, apply the same two corrections already baked into
`transactions.xml`'s flags:
- Sum `signedAmount` grouped by `budgetLine`, over the chosen date window,
  **excluding any transaction with `oneTimeExcluded` set** from recurring-expense
  totals (show them separately if you want a "here's what one-time stuff cost"
  view — just don't let it inflate the recurring monthly number).
- **Exclude any transaction with `linkedCardPaymentExcluded="true"`** (currently just
  the Discover Card payments) from spending totals, since that account's purchases
  are already itemized as separate transactions elsewhere in the ledger.
- Do **not** exclude Chase Card payments — that account isn't linked to the export,
  so its payment total is the only record of that spending, and excluding it would
  silently understate expenses.
- **Exclude the `Savings` and `Savings/Investing` budget lines** from any spending
  total — a transfer into a brokerage or savings account is saving, not an expense,
  even though it's a debit leaving checking. (Verified: recomputing
  `nonHousingLivingExpensesMonthly` from `transactions.xml` with housing lines,
  wedding, the linked-card flag, and these two savings lines all excluded reproduces
  the pre-aggregated figure in `home-affordability-data.xml` to within $0.20/mo.)

If you build this live-recompute path, verify it reproduces the pre-aggregated
figures in `home-affordability-data.xml` for the same window before trusting it for
anything else — that agreement (or a clearly-shown small residual, and why) is the
same "prove the two paths agree" principle used throughout the original spreadsheet
review.

## Data model (Firestore)

The core shift from the single-property version of this tool: **one household's
shared financial picture, many candidate properties compared against it.**
Everything that's true regardless of which house is being considered (income,
taxes, assets, the departing residence's carrying cost, the spouse
data-coverage-gap placeholder, closing-cost assumptions, the transaction ledger
and budget taxonomy) lives once, at the household level. Everything that's
specific to a candidate house (price, loan terms, property tax, carrying costs,
and this household's own comparison ratings/notes for it) lives per-property.

```
households/{householdId}
  ├─ meta: { asOf, version, allowlistedUids: [uid1, uid2, ...] }
  ├─ income: { adamW2Wages, spouseW2Wages, adjustedGrossIncome, ... }
  ├─ payrollDeductions: { adam401kAnnual, spouse401kAnnual, ... }
  ├─ taxes: { federalIncomeTaxActual, ficaComputed, ... }
  ├─ assetsAndDebts: { cashAndSavings, taxableBrokerage, ... }
  ├─ householdBudget: { currentAllInMonthlyHousingCost, ... }
  ├─ secondHomeCarryingCost: { mortgagePAndIMonthly, propertyTaxMonthlyAverage, ... }
  ├─ dataCoverageGap: { untrackedSpouseSpendingMonthly, ... }
  ├─ closingCostDetail: { prepaidInterestDays, ... }
  ├─ brokerageLiquidation: { embeddedGainPctOfTaxableAccount, ... }
  ├─ budgetLineTaxonomy: { validBudgetLines: [...], rawCategoryDefaults: {...} }
  ├─ standingNotes: [ ... ]
  ├─ defaultAssumptions: { loan: {...}, propertyTax: {...}, carryingCosts: {...} }
  │     — the fallback loan rate/term, insurance estimate, maintenance %, etc.
  │       applied to a new candidate property until overridden. Editing this
  │       document should NOT silently change every existing property's
  │       numbers — see "inheritance" note below.
  │
  ├─ transactions/{transactionId}   ← sub-collection, ~3,450 documents initially
  │     { date, description, amount, signedAmount, type, rawCategory, budgetLine,
  │       person, oneTimeExcluded?, linkedCardPaymentExcluded? }
  │
  └─ properties/{propertyId}   ← sub-collection, one document per candidate house
        {
          address, listPrice, zestimate, sqft, beds, bathsFull, bathsHalf,
          yearBuilt, architecturalStyle, hoaMonthly, lotSqft, garage,
          listingStatus: { asOf, text },
          status: "active-consideration" | "toured" | "offer-made" |
                  "under-contract" | "rejected" | "purchased",

          loan: { purchasePrice, downPaymentPct, downPaymentAmount, loanAmount,
                  interestRateAnnual, termYears, pmiMonthly },
          propertyTax: { taxableValuePctOfPrice, postSaleTaxableValue,
                         millageHomesteadPRE, annualPropertyTax, ... },
          carryingCosts: { homeownersInsuranceAnnual, maintenanceReservePctOfValueAnnual,
                           utilitiesMonthly, buyerClosingCostsPctOfPrice, ... },

          ratings: {
            adam: { stars: 0-5 | null, note: string },
            lauren: { stars: 0-5 | null, note: string }
          }
        }
```

**On "inheritance":** a new candidate property should start by copying
`defaultAssumptions` into its own `loan`/`propertyTax`/`carryingCosts` fields
(a one-time copy at creation time, not a live reference) so that editing the
household-wide defaults later doesn't retroactively change the numbers for
houses already being evaluated — those should only change if someone
deliberately edits that specific property's fields. Track which fields were
never edited from the default (e.g. an `inheritedFromDefault: true` flag per
field, or just diff against `defaultAssumptions` at render time) so the UI can
show "using the household default" vs. "custom for this property," similar in
spirit to how `needsReview` distinguishes a placeholder from a confirmed value.

Every leaf value should keep, alongside it, the metadata the source data
carried:
- `needsReview: boolean`
- `note: string` (the source/reasoning text)

e.g. instead of `homeownersInsuranceAnnual: 2200`, store:
```json
"homeownersInsuranceAnnual": {
  "value": 2200,
  "needsReview": true,
  "note": "PLACEHOLDER — get a real quote. A 1919 house with original systems can quote well above this."
}
```
This lets the UI render the color-coding and inline notes directly from the data,
without a separate hardcoded lookup table in the frontend code. This applies to
per-property fields exactly the same way it applies to household fields — a
property missing its sqft/beds/baths (because those haven't been pulled from the
listing yet) should show the same loud yellow "needs review" treatment as a
household-level financial guess.

## Firestore Security Rules (starting point — refine as needed)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /households/{householdId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in resource.data.meta.allowlistedUids;
      // Note: mirror this same check for anything nested under this document.
      // Never fall back to an "allow if authenticated" rule with no allowlist
      // check — that would let ANY Firebase Auth user in the project read it,
      // not just invited ones.
    }
  }
}
```

Test these rules with the Firebase Emulator Suite before deploying. The single most
important property to verify: **an authenticated-but-not-invited user cannot read
the household document.** Write an automated test for this specific case.

## Auth / "sharing the key" flow

1. The household owner creates their own Firebase Auth account (email + password)
   via a simple sign-up screen, once, during setup.
2. Their UID is added to `meta.allowlistedUids` on the household document
   (bootstrap this manually via the Firebase console the first time, since no one
   is allowlisted yet).
3. To "share the key" with someone else (spouse, financial advisor, whoever): they
   sign up for their own Firebase Auth account with their own email, and the
   household owner adds that new UID to `allowlistedUids`.
4. The app's landing page is a login form (email + password), not a raw
   credential-paste box. Once signed in, the app reads/writes the household
   document directly, subject to the Security Rules above.
5. Revoking access = removing a UID from `allowlistedUids`. No key rotation
   needed, unlike a shared-secret approach.

If, after reading the tradeoffs above, a literal "paste one shared string, no
per-person accounts" experience is still wanted, implement it as: a Cloud Function
that accepts a long random app-level secret (generated once, shared out-of-band —
e.g. in a password manager entry, never committed to the repo) and exchanges it
for a Firebase custom auth token, which the client then uses to sign in. This
preserves "one thing to share" UX while keeping an actual server-side check in the
loop. Treat this as an enhancement, not the default.

## Visual language — port the spreadsheet's color convention

The spreadsheet used a strict color convention throughout. Keep it:

| Meaning | Spreadsheet convention | Web app equivalent |
|---|---|---|
| Editable input, confirmed real data | Blue text | Blue text/border on the input field |
| Placeholder / guess — needs replacing | Yellow fill | Yellow/amber background + a small warning icon, always visible, not just on hover |
| Computed formula result | Black text | Normal text, visually distinct from inputs (e.g. a subtle "computed" badge) |
| Pulled from another section | Green text | Small green label showing the source section |
| Critical warning / deadline | Bold red | Bold red banner or callout, not a tooltip — these are load-bearing (PRE affidavit deadline, Section 121 exclusion window) |

Drive this directly from each field's `needsReview` boolean and `note` string in
Firestore, rather than a separate hardcoded frontend table — that way, if a
placeholder is resolved (e.g., a real insurance quote comes in) by editing the value
in the app and clearing the flag, the UI updates without a code change.

## Screens / structure

Single-page app with collapsible sections (accordion on mobile, sidebar nav on
desktop) rather than 11 separate spreadsheet-style tabs. **Every screen from
Monthly Cost onward is computed for a currently-selected property** — keep a
persistent property selector (e.g. a dropdown or the Compare screen itself)
visible across navigation, the way a shopping cart or account switcher stays
visible in other apps, so it's never ambiguous which house's numbers are on
screen.

### 0. Login
Email/password sign-in (see Auth flow above). If not authenticated, show nothing
else — no financial data, no cached values, nothing — until Firebase confirms the
session and the Security Rules allow the read.

### 1. Compare (default view after login, especially on mobile)
The property-list view, styled after the reference Aqi-Watch open-house page
(see Visual style below): a card per candidate property showing address, price,
core facts (beds/baths/sqft — or a visible "needs review" placeholder where
those aren't gathered yet), and each household member's star rating with their
note, exactly like the `A ★★★★★ / L ★★★★★` pattern already in use. Tapping a
card opens that property's full Dashboard (below). Support the same sort/filter
affordances as the reference page (price low-high/high-low, by rating, by
completeness-of-data) and a lightweight "select up to N to compare side-by-side"
mode, mirroring that page's existing Compare Properties panel — a simple table
of price / monthly cost / DTI / surplus across the selected properties is the
most useful version of this for the actual decision being made.

Ratings and notes are per-property, per-household-member, editable inline (tap a
star row, tap a star, done) and write straight to that property's document.

### 2. Dashboard / Summary (for the selected property)
The one screen that answers "can we afford *this* house":
- Big headline verdict (see Verdict Logic below), color-coded.
- Three key numbers as cards: monthly surplus during overlap, monthly surplus once
  the second home sells, cash needed at closing vs. cash on hand.
- A visible flag for the untracked-spouse-spending field and any other
  `needsReview` field that's currently a placeholder, with a one-tap way to edit it
  right there (writes straight back to Firestore).

### 3. Inputs (household-level + per-property overrides)
Two clearly separated groups, since conflating them is the easiest way to build a
confusing app:
- **Household inputs** (apply to every property): Income, Payroll Deductions,
  Taxes, Assets & Debts, Household Budget, Second-Home Carrying Cost, Data
  Coverage Gap, Closing Cost Detail, Brokerage Liquidation. Editing these changes
  every property's affordability numbers at once — that's correct, since they're
  genuinely shared facts about the household.
- **Property inputs** (specific to whichever house is selected): address/listing
  facts, Loan, Property Tax, Carrying Costs, and that property's Ratings. Editing
  these only affects the currently-selected property. A field left as "inherited
  from household default" (see the Data Model's inheritance note) should say so
  visibly, and editing it should detach it from the default going forward.

Each field shows its current value, its color-coded status
(confirmed/placeholder/computed/inherited-from-default), and its note text inline
(not hidden behind a tooltip — these notes contain real reasoning and citations,
e.g. "Detroit Treasury: $2,793.95 (9/2/25) + $559.69 (1/16/26)"). Edits write
directly to Firestore (debounce writes; don't fire one on every keystroke).

### 4. Monthly Cost (selected property)
PITI breakdown, then the "true all-in" figure adding maintenance reserve and
utilities. Simple stacked bar or itemized list.

### 5. Cash to Close (selected property)
- Total required at closing (down payment + closing costs + prepaids, broken into
  per-diem interest, insurance months collected, and tax proration).
- Cash on hand vs. shortfall.
- **Liquidity detail block:** the shortfall that must come from the taxable
  brokerage, grossed up for capital gains tax, and what % of the taxable account
  that represents. Never conflate cash and brokerage into one "available funds"
  number.
- Months of reserve on cash alone vs. cash + brokerage.

### 6. Affordability (selected property)
- Front-end DTI and back-end DTI, each shown next to the standard lending
  guideline thresholds (28%/36%).
- The take-home-basis test: all-in housing cost as % of monthly take-home pay
  (under 30% = comfortable, 30–40% = tight, over 40% = house-poor).
- Two scenarios side by side: "carrying both homes" (overlap) vs. "second home
  sold" (steady state) — always show both, not just the worst case.
- 401(k)/HSA payroll-deduction saving as a separate memo line.

### 7. Tax Impact (selected property)
- Federal/state/city tax comparison, before vs. after the move (a city-income-tax
  elimination, if moving between jurisdictions with different rates, shows up
  here as a genuine benefit).
- Mortgage interest + SALT itemization benefit, computed **bracket-aware** (see
  Calculation Notes).
- FICA computed from first principles, never hardcoded.

### 8. Scenarios / Sensitivity (selected property)
- Price × rate sensitivity grid.
- The two-variable grid that matters most: untracked spouse spending crossed with
  second-home status (carrying both vs. sold). Small table, not paragraph text.
- State plainly that the model is NOT fragile to market assumptions (price, rate,
  tax, insurance) — it's fragile to the two personal-data guesses. That asymmetry
  is the actual finding.

### 9. Amortization (optional / lower priority, selected property)
Year-by-year summary (principal paid, interest paid, remaining balance) is
probably enough; the full 360-row schedule is the least mobile-friendly part of
the original model and the lowest priority to rebuild richly.

### 10. Transactions (household-level)
A simple, searchable/filterable list (date, description, amount, budget line) of
the `transactions` sub-collection — mainly so the household can spot-check or
re-categorize an individual transaction (e.g., un-flagging something that turns
out to actually be recurring, or reclassifying a raw "Shopping" entry). Support
filtering by budget line, by person, and by date range, since that's what makes
the adjustable-window recompute in the previous section actually usable. This
doesn't need a desktop-spreadsheet-grade table on mobile — a simple scrollable
list with a tap-to-edit budget-line field is enough.

### 11. Reconciliation / methodology footer
If implemented, a small "how this was checked" section showing that a bottom-up
household budget and the top-down affordability calculation agree, with the
residual shown if nonzero.

### 12. Access management (new, needed because of Firestore)
A simple screen (visible only to the household owner, or just documented as a
manual Firebase-console step for v1) showing who's currently on
`allowlistedUids` and a way to add/remove access. Doesn't need to be fancy — even
a manual Firebase console workflow documented in the app's README is fine for a
first version, given this is a two-or-three-person household tool.

## Calculation notes (must get these right)

These are specific things that were wrong in an earlier draft of the spreadsheet
and were corrected — do not reintroduce these errors in the web app.

1. **Michigan property tax "uncapping."** Never use a seller's current tax bill to
   estimate what a buyer will owe. A sale resets Taxable Value to State Equalized
   Value (~50% of purchase price) the year after transfer. Compute the buyer's tax
   from the post-sale taxable value × millage, not from the seller's bill.

2. **FICA is computed, not hardcoded.** Social Security = 6.2% of each spouse's
   wages (add back 401(k) deferrals — they ARE subject to FICA; HSA is NOT), each
   individually capped at the Social Security wage base. Medicare = 1.45% of
   combined wages, uncapped, plus an Additional Medicare Tax of 0.9% on combined
   wages above the MFJ threshold.

3. **Bracket-aware itemizing benefit.** If the mortgage-interest + SALT deduction
   pulls taxable income back across a bracket boundary, split the calculation: the
   portion of the deduction that reduces income within the higher bracket is worth
   that bracket's rate; the portion crossing into the lower bracket is worth the
   lower rate. Don't apply one flat marginal rate across a deduction that spans two
   brackets.

4. **A second home's true carrying cost includes property tax and HOA separately
   from P&I**, even if a single "mortgage payment" line item might suggest they're
   escrowed together. Check actual statements/transaction data before assuming
   what's bundled vs. billed separately by a city treasurer or HOA.

5. **A linked credit card's payment should not be double-counted with its own
   purchases.** If a checking account "pays off" a card each month, and that card's
   individual purchases are ALSO itemized elsewhere in the same expense data,
   counting both is double-counting. But if a card's purchases are NOT itemized
   anywhere (only the lump-sum payment appears), that lump sum must stay counted.

6. **One-time life events (weddings, unusually large one-off purchases) must not
   be annualized into a recurring monthly budget.** If building expenses from
   transaction-level data, identify large one-time clusters and exclude them from
   any recurring-cost calculation, with a visible note about what was excluded.

7. **Forward-looking costs that don't exist yet (e.g., childcare with no children
   currently) belong only in a "future/with new house" scenario, never in a
   "current state" baseline** used for before/after comparison.

8. **Cash-to-close reserves are not the same as brokerage account value.** A
   taxable brokerage balance is illiquid on any given day, triggers capital gains
   tax when sold, and can decline in value. Always show (a) actual cash on hand,
   (b) the specific shortfall requiring liquidation, and (c) that shortfall grossed
   up for estimated capital gains tax.

9. **A household budget built from bank-transaction data for only one spouse is
   incomplete**, even if household income (from a joint tax return) is complete.
   Visibly flag this asymmetry and provide an explicit adjustment field rather than
   silently presenting an inflated surplus.

10. **Max-affordable-price calculations and actual-DTI calculations must use the
    same debt inputs.** If a second mortgage or other recurring debt is included
    in one, it must be included in the other, or the two will imply inconsistent
    conclusions at different price points.

11. **Every property's affordability math must use the same shared household
    inputs** (income, taxes, assets, the departing residence's carrying cost,
    the spouse spending gap). Only price, loan terms, property tax, and
    carrying costs should vary by property. If two properties show different
    take-home percentages for reasons other than their own price/loan/tax/
    carrying-cost fields, that's a bug — it means household-level data drifted
    or got duplicated per-property somewhere instead of being read from one
    shared source.

12. **A property missing basic facts (sqft, beds, baths, year built) should be
    visibly incomplete, not silently defaulted into looking equivalent to a
    fully-specced property.** Several candidate properties in the initial data
    only have a confirmed price — everything else is a placeholder. Don't let a
    property's affordability numbers imply more confidence than the underlying
    data supports.

13. **Not every 401(k)-style payroll deduction is pre-tax.** A prior version of
    this model assumed Adam's 401(k) contribution reduced his federal taxable
    wages (traditional/pre-tax) and therefore needed to be "added back" onto
    wages before computing the FICA wage base. A paystub review revealed it is
    actually a Roth (after-tax) contribution — confirmed by checking that Total
    Gross minus only the paystub's BEFORE-TAX deduction lines equals Fed Taxable
    Gross exactly, with the 401(k)/Roth line excluded from that subtraction.
    Because it was never subtracted from Box 1 wages, no "add-back" is needed
    or correct when computing FICA — doing so double-counts it and overstates
    FICA. Before assuming any deduction needs an add-back for a FICA/payroll-tax
    calculation, verify from source documents (paystub before/after-tax
    deduction sections) whether it was pre-tax or post-tax; don't infer it from
    the label alone ("401(k)" and "Roth 401(k)" are taxed differently despite
    the similar name).

14. **When merging a new export into an existing ledger, check for exact
    duplicates before trusting the combined total — an account may already be
    indirectly represented via an aggregator's own account-linking.** Merging a
    raw Discover card CSV export into this model initially looked additive
    (114 new transactions), but an audit pass found that most of them — 95 of
    114, including DTE utility charges, subscription charges, and ordinary
    purchases — were exact duplicates (same date, amount, and household
    member) of transactions the original Credit Karma ledger had already
    surfaced through its own linked-account aggregation. Only 19 were
    genuinely new. The fix isn't just "check the one bill you're suspicious
    of" (DTE, in this case) — it's a full date+amount+person duplicate scan
    across the entire new export against the entire existing ledger, since
    the same root cause (an aggregator already covering an account) can
    duplicate any category, not just the one that happens to be easy to
    spot. Do this scan before computing any aggregate figure from a merged
    ledger, not after.

15. **A spending gap flagged as "unknown" should be closed with real data as soon as it's
    available, and even then, check whether it's actually fully closed.** The single
    biggest open item in this model for months was a $1,800/mo guess standing in for one
    spouse's entire spending. Reviewing her Citi and small-card statements got real
    itemized spending to $1,147.58/mo, but her checking account also revealed a large
    recurring payment to a card whose own statement hadn't been provided yet — American
    Express, averaging an estimated $1,737/mo based only on the payment amounts. That
    interim estimate was itself flagged as the next gap to close, not treated as done.
    When the real, itemized Amex export (QBO/OFX format) arrived, actual spending came to
    $1,950/mo — higher than even the interim estimate — bringing the fully-itemized total
    to $3,097.72/mo, nearly double the original placeholder. The 36 payment amounts in the
    real Amex data matched the checking-account debits to the penny, which is what
    confirmed the itemization was both correct and complete, not just another partial
    view. Closing one gap can reveal a bigger one, and even a data source that looks
    complete (a full checking-account payment history) can still be estimating rather
    than itemizing what it's paying for. Verify completeness with an independent
    cross-check (matching payment amounts between two sources, as done here) rather than
    assuming a new data source has closed the gap just because it's real data.

## Verdict logic

```
IF cash_required_at_closing > (cash_on_hand + liquidatable_brokerage_after_tax):
    "SHORT ON CASH TO CLOSE" — hard stop, show this before anything else.
ELSE IF monthly_surplus_during_overlap < 0:
    "DOES NOT CLEAR" during the overlap period — identify which single assumption
    (usually the untracked-spouse-spending placeholder) is most responsible.
ELSE IF monthly_surplus_during_overlap < some low threshold (e.g. $1,000):
    "CLEARS, BUT THIN DURING THE OVERLAP" — show that lender DTI tests pass with
    large margin even when household cash-flow margin is thin; explain the
    tightness comes from carrying two properties + childcare + the spouse gap
    simultaneously; show the steady-state number once the second home sells.
ELSE:
    "AFFORDABLE" — clears every test with real room in both the overlap period
    and the steady state.
```

Always show both the overlap-period number and the post-sale steady-state number
side by side on the dashboard.

## Visual style — match the existing Aqi-Watch / Royal Oak Open Houses page

The person has an existing GitHub Pages site at
`https://schubatis1.github.io/Aqi-Watch/open_haus1.html` (a Royal Oak open-house
tracker/comparison tool) whose look and feel this app should match — same repo
family, same person, same devices (phone/iPad/desktop), so visual consistency
across their tools matters more than any generic design-system choice below.

**Before writing any CSS, fetch and inspect that live page's actual stylesheet**
(view source / inspect the rendered DOM and computed styles — don't rely on a
description) and extract:
- The color palette (background, card/surface colors, text colors, accent color(s)).
- Typography (font family, weight, sizing scale for headings vs. body vs. labels).
- Card/panel styling — border radius, shadow depth, spacing/padding rhythm.
- Button and form-control styling (the page has filter dropdowns, a sort-by
  control, and a settings modal — match their shape and states).
- Modal/overlay treatment (it has at least two modals — a "Photo Settings" dialog
  and a "Compare Properties" panel — match their entrance/backdrop style).
- Any dark-mode or dark-surface convention. One confirmed data point: the page
  declares `<meta name="theme-color" content="#2c3e50">` (a dark slate-navy) and
  `apple-mobile-web-app-status-bar-style: black-translucent`, both of which signal
  a dark or dark-leaning aesthetic and a PWA-style presentation on iOS home
  screen. Treat this app the same way — same `theme-color`, same
  apple-mobile-web-app meta tags, so it behaves consistently if added to an iPhone
  home screen.

**Apply that same visual system to this app**, while still following the
functional/behavioral requirements elsewhere in this spec (the blue/yellow/
green/red data-status convention, the verdict banner, etc.) — those are semantic
color meanings layered on top of the base aesthetic, not a competing color
scheme. If the Aqi-Watch page's accent color conflicts with red/yellow/green/blue
semantic meanings (e.g., its accent happens to be a color already used for a
status meaning here), keep the semantic colors as specified and use the site's
accent color for non-semantic UI chrome (buttons, headers, active nav states,
selection highlights) instead.

Card-based layouts, filter/sort bars, and modal overlays are already proven
patterns on that other page for browsing a list of real-estate options on a
phone — reuse those same UI patterns here where they fit naturally (e.g., the
Transactions screen's filterable list, or a future "compare this house vs. that
house" view), rather than inventing new ones.

## What NOT to do

- **Don't commit `home-affordability-data.xml`, `transactions.xml`, any Firestore
  export, or any service account key to the (public) repo.** Add them to
  `.gitignore` explicitly — the transaction ledger in particular contains 3,450
  individually dated, itemized real bank transactions.
- Don't design the auth flow around the Firebase API key as if it were a secret —
  it isn't, and Security Rules + real authentication are the actual protection.
- Don't fall back to a Firestore rule that only checks `request.auth != null` — that
  allows *any* authenticated Firebase user in the project, not just invited ones.
  Always check against the allowlist.
- Don't turn this into a generic "mortgage calculator" product with marketing copy
  or ads.
- Don't hide the placeholder/guess fields behind a settings page — they need to be
  visible on the main flow.
- Don't silently combine cash and brokerage into one "available funds" number
  anywhere in the UI.
- Don't apply a flat marginal tax rate to a deduction that spans two brackets.

## Files in this handoff

- `home-affordability-data.xml` — household-level shared inputs, plus the
  budget-line taxonomy, plus five candidate properties (707 S Laurel, 915 E 6th,
  1029 Longfellow, 116 S Kenwood, 1102 N Lafayette), each with its own
  loan/tax/carrying-cost fields and a ratings block. **Migration source only.**
  Use it to write the one-time seed script into Firestore, then keep it out of
  the public repo.
- `transactions.xml` — 3,450 individual bank transactions backing the shared
  household budget (1,440 from the original Credit Karma export, plus 114 from a
  7/26/26 Discover CSV merge), with correction flags for one-time and
  double-counted entries, plus a flagged/unresolved question about possible
  double-counted DTE utility charges (see the file's own header comment).
  **Migration source only, same handling as above.** Currently 100% tagged to
  one spouse — see `dataCoverageGap`.
- `Home_Affordability_707_S_Laurel.xlsx` — the original spreadsheet, useful as a
  cross-check while building: if a computed number disagrees with the
  spreadsheet's output for the same inputs on the 707 S Laurel property, treat
  that as a bug until proven otherwise. Also not for the public repo.

## Suggested build order

1. Set up Firebase project (Auth + Firestore), write and test Security Rules with
   the emulator, confirm the "authenticated but not allowlisted" case is blocked.
2. Write the one-time local migration script (both XML files → Firestore), run it
   once, verify the household document, the `properties` sub-collection (all
   five candidate houses), and the `transactions` sub-collection all read back
   correctly, confirm both XML files and the service-account key are
   `.gitignore`'d and not staged for commit.
3. Login screen + auth wiring.
4. Compare screen (property cards + ratings, styled after the Aqi-Watch
   reference page) with a working property selector — get the multi-property
   list and selection state working before building anything that depends on
   "which property is currently selected."
5. Dashboard screen (for the selected property) with the verdict logic and the
   two headline surplus numbers — get *something* correct and visible on a
   phone screen, reading from Firestore, first. It's fine to start this against
   the pre-aggregated `householdBudget` figures before the live-recompute path
   exists, and against the fully-specced 707 S Laurel property before the
   others have their placeholder fields filled in.
6. Full Inputs screen with color-coded field states, clearly separating
   household-level fields from the selected property's fields, writing edits
   back to Firestore.
7. Transactions screen (list, filter, tap-to-recategorize) plus the
   live-recompute logic described above; verify it reproduces the
   pre-aggregated figures for the same window before switching the
   Dashboard/Household Budget over to it.
8. Monthly Cost, Cash to Close, Affordability screens — all per selected
   property, all reading the same shared household inputs.
9. Tax Impact with the bracket-aware calculation.
10. Scenarios / sensitivity grids, plus the Compare screen's side-by-side
    multi-property table.
11. Amortization summary (low priority, can be cut if time-constrained).
12. Access-management doc/screen.
13. Polish pass: verify every breakpoint on phone/iPad/desktop, verify every
    `needsReview` field is visually loud (including incomplete property facts),
    verify the bracket-aware and capital-gains calculations against the
    spreadsheet's output for identical inputs on the 707 S Laurel property, and
    do a final repo scan (`git log -p` / `git grep`) confirming no financial
    figures, transactions, ratings, or keys were ever committed.
