import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import { computeBudgetFromTransactions, housingLineSet } from "../lib/recompute";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";

const RENDER_CAP = 250;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function isoMinusDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function Transactions() {
  const { household } = useHousehold();
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    const ref = collection(db, "households", HOUSEHOLD_ID, "transactions");
    const unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.date < b.date ? 1 : -1));
      setTransactions(list);
    });
    return unsub;
  }, []);

  const end = todayISO();
  const start = isoMinusDays(end, 365);
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [person, setPerson] = useState("all");
  const [budgetLine, setBudgetLine] = useState("all");
  const [search, setSearch] = useState("");
  const [excludeLinkedCard, setExcludeLinkedCard] = useState(true);

  const validBudgetLines = household.budgetLineTaxonomy?.validBudgetLines || [];
  const housingLines = useMemo(() => housingLineSet(household.budgetLineTaxonomy), [household.budgetLineTaxonomy]);

  const filtered = useMemo(() => {
    if (!transactions) return [];
    return transactions.filter((t) => {
      if (t.date < startDate || t.date > endDate) return false;
      if (person !== "all" && t.person !== person) return false;
      if (budgetLine !== "all" && t.budgetLine !== budgetLine) return false;
      if (search && !t.description?.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, startDate, endDate, person, budgetLine, search]);

  const recompute = useMemo(
    () => computeBudgetFromTransactions(filtered, { startDate, endDate, housingLines, excludeLinkedCard }),
    [filtered, startDate, endDate, housingLines, excludeLinkedCard]
  );

  const storedMonthly = fieldValue(household.householdBudget?.nonHousingLivingExpensesMonthly) || 0;
  const residual = recompute.monthly - storedMonthly;

  async function recategorize(txnId, newBudgetLine) {
    await updateDoc(doc(db, "households", HOUSEHOLD_ID, "transactions", txnId), { budgetLine: newBudgetLine });
  }

  if (!transactions) return <div className="card">Loading transactions…</div>;

  return (
    <div className="dashboard-screen">
      <h2>Transactions</h2>

      <div className="card">
        <h3>Live budget recompute</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
          Recomputed from {recompute.count.toLocaleString()} matching transactions over{" "}
          {recompute.months.toFixed(1)} months ({startDate} to {endDate}).
        </p>
        <div className="dashboard-cards" style={{ marginTop: 10 }}>
          <div className="card dashboard-card">
            <div className="dashboard-card-title">Live recomputed</div>
            <div className="dashboard-card-value">{formatCurrency(recompute.monthly)}<span className="per-mo">/mo</span></div>
          </div>
          <div className="card dashboard-card">
            <div className="dashboard-card-title">Spreadsheet snapshot</div>
            <div className="dashboard-card-value">{formatCurrency(storedMonthly)}<span className="per-mo">/mo</span></div>
          </div>
          <div className="card dashboard-card">
            <div className="dashboard-card-title">Residual</div>
            <div className={"dashboard-card-value" + (Math.abs(residual) > 50 ? " negative" : "")}>
              {formatCurrency(residual)}<span className="per-mo">/mo</span>
            </div>
          </div>
        </div>
        <label className="recompute-toggle">
          <input type="checkbox" checked={excludeLinkedCard} onChange={(e) => setExcludeLinkedCard(e.target.checked)} />
          Exclude linked-card-payment transactions (per BUILD_SPEC.md's written rule)
        </label>
        {excludeLinkedCard && Math.abs(residual) > 50 && (
          <p className="needs-review-note" style={{ marginTop: 6 }}>
            Known finding: applying this rule to Adam's pre-CSV "Discover Card" checking
            payments removes real spending that isn't actually double-counted by the small
            19-transaction Discover CSV import (those entries don't have a matching offsetting
            credit the way Lauren's Citi/Amex payment pairs do). Unchecking the box above gets
            within ~$7/mo of the spreadsheet's snapshot. Flagged here rather than silently
            "fixed" -- worth deciding deliberately rather than picking whichever number matches.
          </p>
        )}
      </div>

      <div className="card transactions-filters">
        <div className="filter-row">
          <div>
            <label className="field-label">From</label>
            <input type="text" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">To</label>
            <input type="text" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Person</label>
            <select value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="all">All</option>
              <option value="Adam">Adam</option>
              <option value="Lauren">Lauren</option>
            </select>
          </div>
          <div>
            <label className="field-label">Budget line</label>
            <select value={budgetLine} onChange={(e) => setBudgetLine(e.target.value)}>
              <option value="all">All</option>
              {validBudgetLines.map((l) => (
                <option key={l.name} value={l.name}>{l.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <label className="field-label">Search description</label>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="e.g. Kroger" />
          </div>
        </div>
        <div className="quick-windows">
          <button className="btn-secondary" onClick={() => { setStartDate(isoMinusDays(end, 365)); setEndDate(end); }}>Last 12 months</button>
          <button className="btn-secondary" onClick={() => { setStartDate(`${new Date().getFullYear() - 1}-01-01`); setEndDate(`${new Date().getFullYear() - 1}-12-31`); }}>Last calendar year</button>
          <button className="btn-secondary" onClick={() => { setStartDate("2024-07-01"); setEndDate(end); }}>All time</button>
        </div>
      </div>

      <div className="card">
        <p style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: 8 }}>
          Showing {Math.min(filtered.length, RENDER_CAP).toLocaleString()} of {filtered.length.toLocaleString()} matching
          transactions{filtered.length > RENDER_CAP ? " -- narrow the filters to see more" : ""}.
        </p>
        <div className="transactions-list">
          {filtered.slice(0, RENDER_CAP).map((t) => (
            <TransactionRow key={t.id} txn={t} validBudgetLines={validBudgetLines} onRecategorize={recategorize} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TransactionRow({ txn, validBudgetLines, onRecategorize }) {
  const [editing, setEditing] = useState(false);
  const flags = [
    txn.oneTimeExcluded && "one-time",
    txn.linkedCardPaymentExcluded && "linked-card",
    txn.rewardsCreditExcluded && "rewards",
  ].filter(Boolean);

  return (
    <div className="transaction-row">
      <div className="transaction-row-date">{txn.date}</div>
      <div className="transaction-row-desc">
        {txn.description}
        <span className="transaction-row-person">{txn.person}</span>
        {flags.map((f) => <span key={f} className="transaction-flag">{f}</span>)}
      </div>
      <div className={"transaction-row-amount" + (txn.signedAmount < 0 ? " credit" : "")}>
        {formatCurrency(txn.signedAmount, { cents: true })}
      </div>
      <div className="transaction-row-line">
        {editing ? (
          <select
            autoFocus
            value={txn.budgetLine || ""}
            onChange={(e) => { onRecategorize(txn.id, e.target.value); setEditing(false); }}
            onBlur={() => setEditing(false)}
          >
            {validBudgetLines.map((l) => <option key={l.name} value={l.name}>{l.name}</option>)}
          </select>
        ) : (
          <button className="transaction-line-btn" onClick={() => setEditing(true)}>
            {txn.budgetLine || "Uncategorized"}
          </button>
        )}
      </div>
    </div>
  );
}
