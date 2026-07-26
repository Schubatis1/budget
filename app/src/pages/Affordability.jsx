import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability, computeDTI } from "../lib/affordability";
import { formatCurrency, formatPercent } from "../lib/format";
import { fieldValue } from "../lib/fields";

const FRONT_END_GUIDELINE = 0.28;
const BACK_END_GUIDELINE = 0.36;

export default function Affordability() {
  const { household, selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const calc = computeAffordability(household, selectedProperty);
  const dti = computeDTI(household, selectedProperty, calc);

  return (
    <div className="dashboard-screen">
      <h2>Affordability — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <div className="card">
        <h3>Debt-to-income</h3>
        <DTIBar label="Front-end DTI" value={dti.frontEndDTI} guideline={FRONT_END_GUIDELINE} />
        <DTIBar label="Back-end DTI — overlap (carrying both homes)" value={dti.backEndDTIOverlap} guideline={BACK_END_GUIDELINE} />
        <DTIBar label="Back-end DTI — steady state (after sale)" value={dti.backEndDTISteadyState} guideline={BACK_END_GUIDELINE} />
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 10 }}>
          Based on {formatCurrency(dti.grossMonthlyIncome)}/mo gross wages-only income (lenders
          generally require a 2-year history before counting interest/dividend income) and
          {" "}{formatCurrency(dti.otherMonthlyDebt)}/mo other debt.
        </p>
      </div>

      <div className="card">
        <h3>Take-home-basis test</h3>
        <p style={{ fontSize: "0.85rem", marginBottom: 8 }}>
          All-in housing cost as a share of monthly take-home pay:
        </p>
        <div className={"take-home-badge " + dti.takeHomeBand}>
          {formatPercent(dti.takeHomePct)} — {labelForBand(dti.takeHomeBand)}
        </div>
        <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 10 }}>
          Under 30% = comfortable, 30–40% = tight, over 40% = house-poor.
        </p>
      </div>

      <div className="card">
        <h3>Overlap vs. steady state, side by side</h3>
        <div className="scenario-columns">
          <div className="scenario-col">
            <div className="scenario-col-title">Carrying both homes</div>
            <ScenarioRow label="Monthly surplus" value={formatCurrency(calc.surplusOverlap)} />
            <ScenarioRow label="Back-end DTI" value={formatPercent(dti.backEndDTIOverlap)} />
          </div>
          <div className="scenario-col">
            <div className="scenario-col-title">After second home sells</div>
            <ScenarioRow label="Monthly surplus" value={formatCurrency(calc.surplusSteadyState)} />
            <ScenarioRow label="Back-end DTI" value={formatPercent(dti.backEndDTISteadyState)} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Memo: payroll savings</h3>
        <p style={{ fontSize: "0.85rem" }}>
          <strong>{formatCurrency(dti.payrollSavingsMonthly)}/mo</strong> going into 401(k)/HSA
          via payroll deduction -- not reflected in take-home pay above, but real household
          savings happening in parallel.
        </p>
      </div>
    </div>
  );
}

function labelForBand(band) {
  if (band === "comfortable") return "comfortable";
  if (band === "tight") return "tight";
  return "house-poor";
}

function DTIBar({ label, value, guideline }) {
  const overGuideline = value > guideline;
  const pct = Math.min(value / (guideline * 1.5), 1) * 100;
  return (
    <div className="dti-bar-block">
      <div className="dti-bar-label">
        <span>{label}</span>
        <span className={overGuideline ? "dti-over" : "dti-under"}>
          {formatPercent(value)} <span style={{ color: "var(--muted)", fontWeight: 500 }}>(guideline {formatPercent(guideline, { digits: 0 })})</span>
        </span>
      </div>
      <div className="dti-bar-track">
        <div className="dti-bar-guideline" style={{ left: `${Math.min((guideline / (guideline * 1.5)) * 100, 100)}%` }} />
        <div className={"dti-bar-fill" + (overGuideline ? " over" : "")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ScenarioRow({ label, value }) {
  return (
    <div className="cost-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
