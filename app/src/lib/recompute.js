// Live budget recompute from the transactions ledger, per BUILD_SPEC.md's
// "Building the budget live from transactions" section. Follows the
// documented exclusion rules literally:
//  - drop any "Exclude - *" budget line
//  - drop the Savings / Savings/Investing lines (saving isn't an expense)
//  - drop housing-group lines (tracked separately on Monthly Cost/Dashboard)
//  - drop any transaction with oneTimeExcluded set (checked by PRESENCE, not
//    a specific string value -- transactions.xml uses both "wedding" and
//    "true" for this flag)
//  - drop linkedCardPaymentExcluded and rewardsCreditExcluded transactions
//
// A real residual was found (and documented) when reconciling this against
// the spreadsheet's stored nonHousingLivingExpensesMonthly snapshot: see
// Transactions.jsx's reconciliation panel and the migration notes. This
// function still implements the spec's written rule rather than silently
// picking whatever happens to match -- the UI shows both numbers.
export function computeBudgetFromTransactions(transactions, { startDate, endDate, housingLines, excludeLinkedCard = true }) {
  const savingsLines = new Set(["Savings", "Savings/Investing"]);
  const byBudgetLine = {};
  const byPerson = {};
  let total = 0;
  let count = 0;

  for (const t of transactions) {
    if (startDate && t.date < startDate) continue;
    if (endDate && t.date > endDate) continue;
    if (!t.budgetLine) continue;
    if (t.budgetLine.startsWith("Exclude - ")) continue;
    if (savingsLines.has(t.budgetLine)) continue;
    if (housingLines.has(t.budgetLine)) continue;
    if (t.oneTimeExcluded) continue;
    if (excludeLinkedCard && t.linkedCardPaymentExcluded) continue;
    if (t.rewardsCreditExcluded) continue;

    total += t.signedAmount;
    count++;
    byBudgetLine[t.budgetLine] = (byBudgetLine[t.budgetLine] || 0) + t.signedAmount;
    if (t.person) byPerson[t.person] = (byPerson[t.person] || 0) + t.signedAmount;
  }

  const months = monthsBetween(startDate, endDate);

  return { total, monthly: months > 0 ? total / months : 0, byBudgetLine, byPerson, count, months };
}

export function monthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return 12;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = (end - start) / (1000 * 60 * 60 * 24);
  return Math.max(days / 30.4368, 1 / 30.4368);
}

// Per-budget-line monthly breakdown, for the Household Budget screen. Unlike
// computeBudgetFromTransactions above, this does NOT drop housing or savings
// lines -- it's used to render every line individually, not collapse them
// into one non-housing total.
export function computeLineBreakdown(transactions, { startDate, endDate, excludeLinkedCard = true }) {
  const byLine = {};
  for (const t of transactions) {
    if (startDate && t.date < startDate) continue;
    if (endDate && t.date > endDate) continue;
    if (!t.budgetLine) continue;
    if (t.budgetLine.startsWith("Exclude - ")) continue;
    if (t.oneTimeExcluded) continue;
    if (excludeLinkedCard && t.linkedCardPaymentExcluded) continue;
    if (t.rewardsCreditExcluded) continue;
    byLine[t.budgetLine] = (byLine[t.budgetLine] || 0) + t.signedAmount;
  }
  const months = monthsBetween(startDate, endDate);
  const monthlyByLine = {};
  for (const [line, total] of Object.entries(byLine)) {
    monthlyByLine[line] = months > 0 ? total / months : 0;
  }
  return { monthlyByLine, months };
}

export function housingLineSet(budgetLineTaxonomy) {
  const set = new Set();
  if (!budgetLineTaxonomy) return set;
  for (const line of budgetLineTaxonomy.validBudgetLines) {
    if (line.group === "housing") set.add(line.name);
  }
  return set;
}
