import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability } from "../lib/affordability";
import { formatCurrency, formatPercent } from "../lib/format";
import { fieldValue } from "../lib/fields";

export default function CashToClose() {
  const { household, selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const calc = computeAffordability(household, selectedProperty);
  const brokeragePctNeeded = calc.taxableBrokerage > 0
    ? calc.shortfallGrossedUpForTax / calc.taxableBrokerage
    : 0;

  return (
    <div className="dashboard-screen">
      <h2>Cash to close — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <div className="card">
        <h3>Total required at closing</h3>
        <dl className="cost-breakdown">
          <Row label="Down payment" value={calc.downPaymentAmount} />
          <Row label="Buyer closing costs" value={calc.buyerClosingCosts} />
          <Row label="Prepaid interest (per-diem)" value={calc.prepaidInterest} />
          <Row label="Insurance collected at closing" value={calc.insurancePrepaid} />
          <Row label="Property tax proration owed to seller" value={calc.taxProration} />
          <Row label="Total cash required" value={calc.cashRequiredAtClosing} strong />
        </dl>
      </div>

      <div className="dashboard-cards">
        <div className="card dashboard-card">
          <div className="dashboard-card-title">Cash on hand</div>
          <div className="dashboard-card-value">{formatCurrency(calc.cashOnHand)}</div>
        </div>
        <div className="card dashboard-card">
          <div className="dashboard-card-title">Cash required</div>
          <div className="dashboard-card-value">{formatCurrency(calc.cashRequiredAtClosing)}</div>
        </div>
        <div className="card dashboard-card">
          <div className="dashboard-card-title">Shortfall</div>
          <div className={"dashboard-card-value" + (calc.cashShortfall > 0 ? " negative" : "")}>
            {formatCurrency(calc.cashShortfall)}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Liquidity detail</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          Cash and brokerage are shown separately, never combined into one "available funds"
          number -- a taxable brokerage balance is illiquid day-to-day, triggers capital gains
          tax on sale, and can decline in value.
        </p>
        {calc.cashShortfall > 0 ? (
          <dl className="cost-breakdown">
            <Row label="Shortfall to fund from brokerage" value={calc.cashShortfall} />
            <Row label="Grossed up for est. capital gains tax" value={calc.shortfallGrossedUpForTax} strong />
            <Row label="% of taxable brokerage account this represents" value={null} customValue={formatPercent(brokeragePctNeeded)} />
          </dl>
        ) : (
          <p style={{ color: "var(--status-inherited)", fontWeight: 700 }}>
            Cash on hand covers the full amount required at closing -- no brokerage liquidation needed.
          </p>
        )}
        <dl className="cost-breakdown" style={{ marginTop: 12 }}>
          <Row label="Taxable brokerage balance" value={calc.taxableBrokerage} />
          <Row label="Est. value after tax if fully liquidated" value={calc.brokerageAfterTaxIfFullyLiquidated} />
        </dl>
      </div>

      <div className="card">
        <h3>Reserve runway after closing</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          Household target: {calc.emergencyReserveTargetMonths} months of expenses. Based on
          {" "}{formatCurrency(calc.monthlyBurn)}/mo (non-housing living expenses + childcare + new
          all-in housing cost).
        </p>
        <dl className="cost-breakdown">
          <Row label="Months of reserve, cash only" value={null} customValue={`${calc.reserveMonthsCashOnly.toFixed(1)} mo`} />
          <Row label="Months of reserve, cash + brokerage" value={null} customValue={`${calc.reserveMonthsWithBrokerage.toFixed(1)} mo`} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, strong, customValue }) {
  return (
    <div className={"cost-row" + (strong ? " strong" : "")}>
      <dt>{label}</dt>
      <dd>{customValue !== undefined ? customValue : formatCurrency(value)}</dd>
    </div>
  );
}
