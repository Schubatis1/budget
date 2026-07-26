import { useHousehold } from "../lib/HouseholdContext";
import { computeFICA, computeItemizationBenefit } from "../lib/tax";
import { generateSchedule, yearlyTotals } from "../lib/amortization";
import { formatCurrency, formatPercent } from "../lib/format";
import { fieldValue } from "../lib/fields";

export default function TaxImpact() {
  const { household, selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const v = fieldValue;
  const fica = computeFICA(household);

  const loanAmount = v(selectedProperty.loan?.loanAmount) || 0;
  const rate = v(selectedProperty.loan?.interestRateAnnual) || 0;
  const term = v(selectedProperty.loan?.termYears) || 30;
  const schedule = generateSchedule(loanAmount, rate, term);
  const year1 = yearlyTotals(schedule)[0] || { interestPaid: 0 };
  const propertyTaxAnnual = v(selectedProperty.propertyTax?.annualPropertyTax) || 0;

  const itemization = computeItemizationBenefit(household, year1.interestPaid, propertyTaxAnnual);

  const fedTax = v(household.taxes?.federalIncomeTaxActual2025) || 0;
  const miTax = v(household.taxes?.michiganIncomeTaxActual2025) || 0;
  const detroitCityTaxBefore = v(household.taxes?.detroitCityTaxFullYearRunRate) || 0;
  const detroitCityTaxAfter = 0; // Royal Oak has no municipal income tax

  const storedFica = v(household.taxes?.ficaComputed) || 0;
  const ficaResidual = fica.total - storedFica;

  return (
    <div className="dashboard-screen">
      <h2>Tax impact — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <div className="card">
        <h3>City income tax: before vs. after the move</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          Royal Oak has no municipal income tax. Michigan's flat state tax applies either way.
        </p>
        <div className="scenario-columns">
          <div className="scenario-col">
            <div className="scenario-col-title">Detroit (current)</div>
            <ScenarioRow label="City income tax" value={formatCurrency(detroitCityTaxBefore)} />
          </div>
          <div className="scenario-col">
            <div className="scenario-col-title">Royal Oak (after move)</div>
            <ScenarioRow label="City income tax" value={formatCurrency(detroitCityTaxAfter)} />
          </div>
        </div>
        <div className="good-banner" style={{ marginTop: 14 }}>
          <div className="verdict-headline">Saves {formatCurrency(detroitCityTaxBefore)}/yr</div>
          <div className="verdict-detail">City income tax eliminated entirely by the move.</div>
        </div>
      </div>

      <div className="card">
        <h3>Mortgage interest + SALT itemization benefit</h3>
        <dl className="cost-breakdown">
          <Row label="Year-1 mortgage interest" value={itemization.itemizedTotal - itemization.saltDeduction} />
          <Row label={`SALT (MI income tax + property tax${itemization.saltCapped ? ", capped" : ""})`} value={itemization.saltDeduction} />
          <Row label="Total itemized deductions" value={itemization.itemizedTotal} />
          <Row label="Standard deduction (MFJ)" value={itemization.standardDeduction} />
          <Row label="Incremental deduction from itemizing" value={itemization.incrementalDeduction} strong />
        </dl>
        {itemization.spansTwoBrackets ? (
          <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 10 }}>
            Bracket-aware: {formatCurrency(itemization.portionAtTopRate)} of the deduction reduces
            income while still in the {formatPercent(itemization.topRate, { digits: 0 })} bracket,
            {" "}{formatCurrency(itemization.portionAtLowerRate)} crosses into the{" "}
            {formatPercent(itemization.lowerRate, { digits: 0 })} bracket -- not one flat rate
            across the whole deduction.
          </p>
        ) : null}
        <div className="dashboard-cards" style={{ marginTop: 10 }}>
          <div className="card dashboard-card">
            <div className="dashboard-card-title">Annual tax benefit</div>
            <div className="dashboard-card-value">{formatCurrency(itemization.benefit)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3>FICA, computed from first principles</h3>
        <dl className="cost-breakdown">
          <Row label="Social Security (6.2%, each spouse capped at wage base)" value={fica.socialSecurity} />
          <Row label="Medicare (1.45%, uncapped, combined)" value={fica.medicare} />
          <Row label="Additional Medicare (0.9% above $250k MFJ)" value={fica.additionalMedicare} />
          <Row label="Total FICA" value={fica.total} strong />
        </dl>
        {Math.abs(ficaResidual) > 1 && (
          <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginTop: 10 }}>
            Differs from the spreadsheet's stored figure ({formatCurrency(storedFica)}) by{" "}
            {formatCurrency(ficaResidual)} -- this live calculation adds back Lauren's genuinely
            pre-tax 403(b) deferral to her Social Security wage base (confirmed pre-tax from her
            paystub), which the stored figure's own revision notes don't appear to include.
          </p>
        )}
      </div>

      <div className="card">
        <h3>Federal / Michigan income tax (2025 actuals)</h3>
        <dl className="cost-breakdown">
          <Row label="Federal income tax" value={fedTax} />
          <Row label="Michigan income tax (4.25% flat, unaffected by the move)" value={miTax} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, strong }) {
  return (
    <div className={"cost-row" + (strong ? " strong" : "")}>
      <dt>{label}</dt>
      <dd>{formatCurrency(value)}</dd>
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
