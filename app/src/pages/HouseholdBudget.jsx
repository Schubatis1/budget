import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability } from "../lib/affordability";
import { computeFICA, computeItemizationBenefit } from "../lib/tax";
import { generateSchedule, yearlyTotals } from "../lib/amortization";
import { computeLineBreakdown } from "../lib/recompute";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";
import EditableLeafRow from "../components/EditableLeafRow";

// Modeled on the original spreadsheet's "Household Budget" worksheet (Now
// vs. With House, live SUMIFS pulls from Transactions, a reconciliation
// section at the bottom). Split into three columns instead of the
// spreadsheet's two -- Now / With House during the overlap / With House
// steady state -- to match how the rest of this app (Dashboard,
// Affordability) already treats that distinction, rather than blending both
// into one ambiguous "With House" column the way the spreadsheet did.
//
// The current residence's line items (Electric, Gas, HOA, etc.) are shown
// as their own sub-block, live from actual transactions, unchanged in the
// Overlap column (still being paid) and zeroed in Steady State (sold). The
// new house's costs are a SEPARATE sub-block from the property's own Inputs
// -- not a fabricated split of a single utilities estimate into per-category
// guesses.

function todayISO() { return new Date().toISOString().slice(0, 10); }
function isoMinusDays(iso, days) { const d = new Date(iso); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }

const DEBT_LINES_EXCLUDING_PALMER = ["Automobile Loan", "Student Loans", "Major Credit Cards", "Other Purchase Cards"];
// HOA/Condo Fees is deliberately excluded here -- it's already embedded in
// secondHomeCarryingCost.pitiPlusHoa (the "Rent/Mortgage (all-in)" row
// below), so listing it again from transactions would double-count it.
const CURRENT_HOUSING_LINES = ["Electric", "Gas/Oil", "Water/Sewer", "Lawn Care", "Maintenance/Repairs"];
const OTHER_FIXED_GROUPS = ["insurance", "family", "fixed"];
const OTHER_FIXED_EXCLUDE = ["Renter/Home Insurance", "Child Care"]; // handled in their own sub-blocks
const FLEXIBLE_GROUPS = ["living", "auto", "unitemized", "savings"];

export default function HouseholdBudget() {
  const { household, selectedProperty } = useHousehold();
  const [transactions, setTransactions] = useState(null);

  useEffect(() => {
    const ref = collection(db, "households", HOUSEHOLD_ID, "transactions");
    const unsub = onSnapshot(ref, (snap) => {
      const list = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      setTransactions(list);
    });
    return unsub;
  }, []);

  const end = todayISO();
  const [startDate, setStartDate] = useState(isoMinusDays(end, 365));
  const [endDate, setEndDate] = useState(end);

  const v = fieldValue;
  const taxonomy = household.budgetLineTaxonomy;
  const groupOf = useMemo(() => {
    const map = {};
    (taxonomy?.validBudgetLines || []).forEach((l) => { map[l.name] = l.group; });
    return map;
  }, [taxonomy]);

  const { monthlyByLine } = useMemo(
    () => transactions ? computeLineBreakdown(transactions, { startDate, endDate }) : { monthlyByLine: {} },
    [transactions, startDate, endDate]
  );
  const lineNow = (name) => monthlyByLine[name] || 0;

  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;
  if (!transactions) return <div className="card">Loading…</div>;

  const calc = computeAffordability(household, selectedProperty);
  const fica = computeFICA(household);

  const loanAmount = v(selectedProperty.loan?.loanAmount) || 0;
  const rate = v(selectedProperty.loan?.interestRateAnnual) || 0;
  const term = v(selectedProperty.loan?.termYears) || 30;
  const year1Interest = (yearlyTotals(generateSchedule(loanAmount, rate, term))[0] || { interestPaid: 0 }).interestPaid;
  const propertyTaxAnnual = v(selectedProperty.propertyTax?.annualPropertyTax) || 0;
  const itemization = computeItemizationBenefit(household, year1Interest, propertyTaxAnnual);

  // --- Gross income (identical across all 3 columns) ---
  const adamGross = (v(household.income?.adamW2Wages) || 0) / 12
    + (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12
    + (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12;
  const laurenGross = (v(household.income?.spouseW2Wages) || 0) / 12
    + (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12;
  const investmentIncome = ((v(household.income?.taxableInterest) || 0) + (v(household.income?.ordinaryDividends) || 0)) / 12;
  const totalGrossIncome = adamGross + laurenGross + investmentIncome;

  // --- Income taxes: Now (actual) vs With House (itemization benefit + no city tax) ---
  const fedTaxNow = (v(household.taxes?.federalIncomeTaxActual2025) || 0) / 12;
  const fedTaxWithHouse = fedTaxNow - itemization.benefit / 12;
  const miTax = (v(household.taxes?.michiganIncomeTaxActual2025) || 0) / 12;
  const localTaxNow = (v(household.taxes?.detroitCityTaxFullYearRunRate) || 0) / 12;
  const ficaMonthly = fica.total / 12;

  const totalTaxNow = fedTaxNow + miTax + localTaxNow + ficaMonthly;
  const totalTaxWithHouse = fedTaxWithHouse + miTax + 0 + ficaMonthly;

  const netIncomeNow = totalGrossIncome - totalTaxNow;
  const netIncomeWithHouse = totalGrossIncome - totalTaxWithHouse;

  // --- Payroll deductions (identical across all 3 columns) ---
  const payrollDeductions = (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12
    + (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12
    + (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12
    + (v(household.payrollDeductions?.healthInsurancePremiumsAnnual) || 0) / 12;

  // --- Fixed: current residence sub-block ---
  const currentRentMortgageNow = v(household.secondHomeCarryingCost?.pitiPlusHoa) || 0;
  const currentInsuranceNow = lineNow("Renter/Home Insurance");

  // --- Fixed: new house sub-block ---
  const newHouseLines = [
    { label: "Mortgage P&I + property tax", value: calc.pitiMonthly },
    { label: "Homeowners insurance", value: calc.insuranceMonthly },
    { label: "Maintenance reserve", value: calc.maintenanceMonthly },
    { label: "Utilities", value: calc.utilitiesMonthly },
    ...(calc.hoaMonthly > 0 ? [{ label: "HOA", value: calc.hoaMonthly }] : []),
  ];
  const newHouseTotal = newHouseLines.reduce((s, l) => s + l.value, 0);

  // --- Fixed: other lines (insurance/family/fixed groups, minus special-cased ones) ---
  const otherFixedLines = (taxonomy?.validBudgetLines || [])
    .filter((l) => OTHER_FIXED_GROUPS.includes(l.group) && !OTHER_FIXED_EXCLUDE.includes(l.name))
    .map((l) => ({ name: l.name, now: lineNow(l.name) }));
  const otherFixedTotal = otherFixedLines.reduce((s, l) => s + l.now, 0);

  const childcareWithHouse = v(household.householdBudget?.childcareMonthly) || 0;

  const currentHousingTotal = currentRentMortgageNow + CURRENT_HOUSING_LINES.reduce((s, n) => s + lineNow(n), 0) + currentInsuranceNow;

  const fixedNow = currentHousingTotal + otherFixedTotal; // no childcare, no new house yet
  const fixedOverlap = currentHousingTotal + newHouseTotal + otherFixedTotal + childcareWithHouse;
  const fixedSteadyState = newHouseTotal + otherFixedTotal + childcareWithHouse; // current residence sold

  // --- Debt (excluding Palmer St, already captured above; identical across columns) ---
  const debtLines = DEBT_LINES_EXCLUDING_PALMER.map((name) => ({ name, now: lineNow(name) }));
  const debtTotal = debtLines.reduce((s, l) => s + l.now, 0);

  // --- Flexible (identical across columns -- spending habits assumed unchanged) ---
  const flexibleLines = (taxonomy?.validBudgetLines || [])
    .filter((l) => FLEXIBLE_GROUPS.includes(l.group))
    .map((l) => ({ name: l.name, now: lineNow(l.name) }));
  const flexibleTotal = flexibleLines.reduce((s, l) => s + l.now, 0);

  // --- Summary ---
  const expensesNow = payrollDeductions + fixedNow + debtTotal + flexibleTotal;
  const expensesOverlap = payrollDeductions + fixedOverlap + debtTotal + flexibleTotal;
  const expensesSteadyState = payrollDeductions + fixedSteadyState + debtTotal + flexibleTotal;

  const surplusNow = netIncomeNow - expensesNow;
  const surplusOverlap = netIncomeWithHouse - expensesOverlap;
  const surplusSteadyState = netIncomeWithHouse - expensesSteadyState;

  // The Dashboard's surplus treats savings as a use of surplus, not a
  // pre-committed expense, so it never subtracts Savings/Investing. This
  // tab (matching the original worksheet) lists Savings as its own
  // Flexible line, same as any other expense. Add it back for an
  // apples-to-apples comparison, mirroring the original spreadsheet's own
  // "Less: [adjustment]" reconciliation step.
  const savingsLineMonthly = lineNow("Savings") + lineNow("Savings/Investing");
  const adjustedSurplusOverlap = surplusOverlap + savingsLineMonthly;
  const adjustedSurplusSteadyState = surplusSteadyState + savingsLineMonthly;

  const overlapResidual = adjustedSurplusOverlap - calc.surplusOverlap;
  const steadyResidual = adjustedSurplusSteadyState - calc.surplusSteadyState;

  const familyRef = doc(db, "households", HOUSEHOLD_ID);

  return (
    <div className="dashboard-screen household-budget-screen">
      <h2>Household Budget</h2>

      <div className="card">
        <div className="filter-row">
          <div>
            <label className="field-label">Window from</label>
            <input type="text" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Window to</label>
            <input type="text" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 8 }}>
          "Now" columns are live SUMIFS-style pulls from the Transactions ledger over this
          window. Change a transaction's budget line on the Transactions screen and this
          recalculates.
        </p>
      </div>

      <div className="card">
        <h3>Family size</h3>
        <div className="hb-family-row">
          <EditableLeafRow docRef={familyRef} fieldPath="familySize.adults" field={household.familySize?.adults} label="adults" />
          <EditableLeafRow docRef={familyRef} fieldPath="familySize.children" field={household.familySize?.children} label="children" />
        </div>
      </div>

      <BudgetTable
        title="Gross monthly income"
        rows={[
          ["Adam's gross pay (Box 1 + 401(k) + HSA)", adamGross, adamGross, adamGross],
          ["Lauren's gross pay (Box 1 + 401(k))", laurenGross, laurenGross, laurenGross],
          ["Investment income (interest & dividends)", investmentIncome, investmentIncome, investmentIncome],
        ]}
        total={["Total gross income", totalGrossIncome, totalGrossIncome, totalGrossIncome]}
      />

      <BudgetTable
        title="Less: income taxes"
        rows={[
          ["Federal income tax", -fedTaxNow, -fedTaxWithHouse, -fedTaxWithHouse],
          ["Michigan state income tax", -miTax, -miTax, -miTax],
          ["Local income tax (Detroit / Royal Oak)", -localTaxNow, 0, 0],
          ["FICA (Social Security + Medicare)", -ficaMonthly, -ficaMonthly, -ficaMonthly],
        ]}
        total={["Total income taxes", -totalTaxNow, -totalTaxWithHouse, -totalTaxWithHouse]}
      />

      <BudgetTable
        title="Net monthly income (take-home)"
        rows={[]}
        total={["Total income (A)", netIncomeNow, netIncomeWithHouse, netIncomeWithHouse]}
      />

      <BudgetTable
        title="Payroll deductions (money you never see, but still spent)"
        rows={[
          ["401(k) - Adam", (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12, (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12, (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12],
          ["403(b) - Lauren", (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12, (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12, (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12],
          ["HSA - Adam", (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12, (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12, (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12],
          ["Health insurance premiums", (v(household.payrollDeductions?.healthInsurancePremiumsAnnual) || 0) / 12, (v(household.payrollDeductions?.healthInsurancePremiumsAnnual) || 0) / 12, (v(household.payrollDeductions?.healthInsurancePremiumsAnnual) || 0) / 12],
        ]}
        total={["Total payroll deductions", payrollDeductions, payrollDeductions, payrollDeductions]}
      />

      <div className="card">
        <h3>Fixed expenses</h3>
        <div className="hb-subblock-title">Current residence (288 E Palmer St)</div>
        <BudgetRows
          rows={[
            ["Rent/Mortgage (all-in, P&I + tax + HOA)", currentRentMortgageNow, currentRentMortgageNow, 0],
            ...CURRENT_HOUSING_LINES.map((n) => [n, lineNow(n), lineNow(n), 0]),
            ["Renter/Home insurance", currentInsuranceNow, currentInsuranceNow, 0],
          ]}
        />
        <div className="hb-subblock-title">New house — {fieldValue(selectedProperty.address) || selectedProperty.id}</div>
        <BudgetRows rows={newHouseLines.map((l) => [l.label, 0, l.value, l.value])} />
        <div className="hb-subblock-title">Other fixed (insurance, family, misc)</div>
        <BudgetRows
          rows={[
            ...otherFixedLines.map((l) => [l.name, l.now, l.now, l.now]),
            ["Child care", 0, childcareWithHouse, childcareWithHouse],
          ]}
        />
        <TotalRow label="Total fixed (B)" now={fixedNow} overlap={fixedOverlap} steady={fixedSteadyState} />
      </div>

      <div className="card">
        <h3>Debt payments</h3>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: 8 }}>
          The current residence's carrying cost is already counted above as a Fixed line, not
          repeated here.
        </p>
        <BudgetRows rows={debtLines.map((l) => [l.name, l.now, l.now, l.now])} />
        <TotalRow label="Total debt (C)" now={debtTotal} overlap={debtTotal} steady={debtTotal} />
      </div>

      <div className="card">
        <h3>Flexible expenses</h3>
        <BudgetRows rows={flexibleLines.map((l) => [l.name, l.now, l.now, l.now])} />
        <TotalRow label="Total flexible (D)" now={flexibleTotal} overlap={flexibleTotal} steady={flexibleTotal} />
      </div>

      <div className="card">
        <h3>Expenses summary</h3>
        <BudgetRows
          rows={[
            ["Payroll deductions", payrollDeductions, payrollDeductions, payrollDeductions],
            ["Fixed (B)", fixedNow, fixedOverlap, fixedSteadyState],
            ["Debt (C)", debtTotal, debtTotal, debtTotal],
            ["Flexible (D)", flexibleTotal, flexibleTotal, flexibleTotal],
          ]}
        />
        <TotalRow label="Total expenses (E)" now={expensesNow} overlap={expensesOverlap} steady={expensesSteadyState} />
      </div>

      <div className="card">
        <h3>Income minus expenses (A − E)</h3>
        <BudgetRows
          rows={[
            ["Total income (A)", netIncomeNow, netIncomeWithHouse, netIncomeWithHouse],
            ["Total expenses (E)", expensesNow, expensesOverlap, expensesSteadyState],
          ]}
        />
        <TotalRow label="Surplus" now={surplusNow} overlap={surplusOverlap} steady={surplusSteadyState} negativeAware />
      </div>

      <div className="card">
        <h3>Reconciliation to the Dashboard</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          This tab and the Dashboard answer the same question by different routes -- they should
          agree. This tab's Flexible section lists Savings ({formatCurrency(savingsLineMonthly)}/mo)
          as its own expense line, matching the original worksheet; the Dashboard treats savings as
          a use of surplus, not a pre-committed cost, so it's added back below before comparing.
        </p>
        <ReconciliationRow label="Overlap" here={surplusOverlap} adjusted={adjustedSurplusOverlap} dashboard={calc.surplusOverlap} residual={overlapResidual} savingsLine={savingsLineMonthly} />
        <ReconciliationRow label="Steady state" here={surplusSteadyState} adjusted={adjustedSurplusSteadyState} dashboard={calc.surplusSteadyState} residual={steadyResidual} savingsLine={savingsLineMonthly} />
      </div>
    </div>
  );
}

function BudgetTable({ title, rows, total }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <BudgetRows rows={rows.map(([label, now, overlap, steady]) => [label, now, overlap, steady])} />
      {total && <TotalRow label={total[0]} now={total[1]} overlap={total[2]} steady={total[3]} />}
    </div>
  );
}

function BudgetRows({ rows }) {
  if (rows.length === 0) return null;
  return (
    <div className="hb-table">
      <div className="hb-row hb-header">
        <span></span><span>Now</span><span>Overlap</span><span>Steady state</span>
      </div>
      {rows.map(([label, now, overlap, steady]) => (
        <div className="hb-row" key={label}>
          <span>{label}</span>
          <span>{formatCurrency(now)}</span>
          <span>{formatCurrency(overlap)}</span>
          <span>{formatCurrency(steady)}</span>
        </div>
      ))}
    </div>
  );
}

function TotalRow({ label, now, overlap, steady, negativeAware }) {
  return (
    <div className="hb-row hb-total">
      <span>{label}</span>
      <span className={negativeAware && now < 0 ? "negative" : ""}>{formatCurrency(now)}</span>
      <span className={negativeAware && overlap < 0 ? "negative" : ""}>{formatCurrency(overlap)}</span>
      <span className={negativeAware && steady < 0 ? "negative" : ""}>{formatCurrency(steady)}</span>
    </div>
  );
}

function ReconciliationRow({ label, here, adjusted, dashboard, residual, savingsLine }) {
  const drifted = Math.abs(residual) > 100;
  return (
    <div className="hb-reconcile-row">
      <strong>{label}:</strong> this tab {formatCurrency(here)}, plus {formatCurrency(savingsLine)} savings
      added back = {formatCurrency(adjusted)}, vs. Dashboard {formatCurrency(dashboard)}
      {" "}— residual {formatCurrency(residual)}
      {drifted && (
        <span className="needs-review-note" style={{ display: "block", marginTop: 4 }}>
          Still off by more than $100/mo after the savings adjustment. The Dashboard's
          non-housing spending figure is the pre-aggregated spreadsheet snapshot
          (household.householdBudget.nonHousingLivingExpensesMonthly) over its own fixed window;
          this tab recomputes every line live over the window set above -- a different window, or
          the linked-card-payment residual documented on the Transactions screen, is the likely
          driver. Worth tightening once both screens compute from the identical live window.
        </span>
      )}
    </div>
  );
}
