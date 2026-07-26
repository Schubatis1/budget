import { doc } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability } from "../lib/affordability";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";
import EditableField from "../components/EditableField";

export default function Dashboard() {
  const { household, selectedProperty, propertyList } = useHousehold();

  if (propertyList.length === 0) {
    return <div className="card">No properties yet.</div>;
  }
  if (!selectedProperty) {
    return <div className="card">Pick a property from the selector above.</div>;
  }

  const calc = computeAffordability(household, selectedProperty);
  const householdRef = doc(db, "households", HOUSEHOLD_ID);
  const propertyRef = doc(db, "households", HOUSEHOLD_ID, "properties", selectedProperty.id);

  return (
    <div className="dashboard-screen">
      <h2>{fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <VerdictBanner verdict={calc.verdict} />

      <div className="dashboard-cards">
        <SurplusCard
          title="Monthly surplus — carrying both homes"
          subtitle="Overlap period, before the current home sells"
          value={calc.surplusOverlap}
        />
        <SurplusCard
          title="Monthly surplus — steady state"
          subtitle="After the current home sells"
          value={calc.surplusSteadyState}
        />
        <div className="card dashboard-card">
          <div className="dashboard-card-title">Cash to close</div>
          <div className="dashboard-card-value">{formatCurrency(calc.cashRequiredAtClosing)}</div>
          <div className="dashboard-card-subtitle">
            vs. {formatCurrency(calc.cashOnHand)} cash on hand
            {calc.cashShortfall > 0 && (
              <> — short {formatCurrency(calc.cashShortfall)}, ~{formatCurrency(calc.shortfallGrossedUpForTax)} after
                tax if funded from brokerage</>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>All-in monthly cost, this house</h3>
        <dl className="cost-breakdown">
          <Row label="Principal & interest" value={calc.monthlyPI} />
          <Row label="Property tax" value={calc.propertyTaxMonthly} />
          {calc.pmiMonthly > 0 && <Row label="PMI" value={calc.pmiMonthly} />}
          <Row label="Homeowners insurance" value={calc.insuranceMonthly} />
          <Row label="Maintenance reserve" value={calc.maintenanceMonthly} />
          <Row label="Utilities" value={calc.utilitiesMonthly} />
          {calc.hoaMonthly > 0 && <Row label="HOA" value={calc.hoaMonthly} />}
          <Row label="All-in total" value={calc.allInMonthlyNewHouse} strong />
        </dl>
      </div>

      <div className="card">
        <h3>Needs your input</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          These placeholders feed the numbers above directly. Fixing them updates the dashboard immediately.
        </p>
        <div className="flags-list">
          <EditableField
            docRef={propertyRef}
            fieldPath="carryingCosts.homeownersInsuranceAnnual"
            field={selectedProperty.carryingCosts?.homeownersInsuranceAnnual}
            label="Homeowners insurance (annual) — get a real quote"
            format={(v) => formatCurrency(v)}
          />
          <EditableField
            docRef={householdRef}
            fieldPath="brokerageLiquidation.embeddedGainPctOfTaxableAccount"
            field={household.brokerageLiquidation?.embeddedGainPctOfTaxableAccount}
            label="Brokerage embedded gain % — check actual unrealized gain"
            format={(v) => `${(v * 100).toFixed(0)}%`}
          />
          <EditableField
            docRef={householdRef}
            fieldPath="closingCostDetail.prepaidInterestDays"
            field={household.closingCostDetail?.prepaidInterestDays}
            label="Prepaid interest days — depends on actual closing date"
          />
          <EditableField
            docRef={householdRef}
            fieldPath="closingCostDetail.propertyTaxProrationOwedToSellerMonths"
            field={household.closingCostDetail?.propertyTaxProrationOwedToSellerMonths}
            label="Tax proration months owed to seller — depends on closing date"
          />
          <EditableField
            docRef={householdRef}
            fieldPath="assetsAndDebts.otherMonthlyDebtPayments"
            field={household.assetsAndDebts?.otherMonthlyDebtPayments}
            label="Other monthly debt payments — Lauren's student loan amount is unconfirmed"
            format={(v) => formatCurrency(v)}
          />
        </div>
      </div>

      <p style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
        Net income is currently based on 2025 actual federal/MI tax and computed FICA -- a
        forward-looking, bracket-aware version will live on the Tax Impact screen.
      </p>
    </div>
  );
}

function VerdictBanner({ verdict }) {
  const cls =
    verdict.level === "critical" ? "critical-banner" :
    verdict.level === "warning" ? "warning-banner" : "good-banner";
  return (
    <div className={cls}>
      <div>
        <div className="verdict-headline">{verdict.headline}</div>
        <div className="verdict-detail">{verdict.detail}</div>
      </div>
    </div>
  );
}

function SurplusCard({ title, subtitle, value }) {
  const negative = value < 0;
  return (
    <div className="card dashboard-card">
      <div className="dashboard-card-title">{title}</div>
      <div className={"dashboard-card-value" + (negative ? " negative" : "")}>
        {formatCurrency(value)}<span className="per-mo">/mo</span>
      </div>
      <div className="dashboard-card-subtitle">{subtitle}</div>
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
