import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability } from "../lib/affordability";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";

const SEGMENTS = [
  { key: "monthlyPI", label: "Principal & interest", color: "var(--navy)" },
  { key: "propertyTaxMonthly", label: "Property tax", color: "var(--coral)" },
  { key: "pmiMonthly", label: "PMI", color: "var(--status-critical)" },
  { key: "insuranceMonthly", label: "Homeowners insurance", color: "var(--status-confirmed)" },
  { key: "maintenanceMonthly", label: "Maintenance reserve", color: "var(--status-inherited)" },
  { key: "utilitiesMonthly", label: "Utilities", color: "var(--muted)" },
  { key: "hoaMonthly", label: "HOA", color: "var(--status-needsreview)" },
];

export default function MonthlyCost() {
  const { household, selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const calc = computeAffordability(household, selectedProperty);
  const piti = calc.monthlyPI + calc.propertyTaxMonthly + calc.pmiMonthly;
  const segments = SEGMENTS.filter((s) => calc[s.key] > 0);

  return (
    <div className="dashboard-screen">
      <h2>Monthly cost — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <div className="card">
        <h3>PITI</h3>
        <StackedBar segments={segments} calc={calc} total={piti} />
        <dl className="cost-breakdown">
          <Row label="Principal & interest" value={calc.monthlyPI} />
          <Row label="Property tax" value={calc.propertyTaxMonthly} />
          {calc.pmiMonthly > 0 && <Row label="PMI" value={calc.pmiMonthly} />}
          <Row label="PITI total" value={piti} strong />
        </dl>
      </div>

      <div className="card">
        <h3>True all-in monthly cost</h3>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: 10 }}>
          PITI plus the maintenance reserve and utilities the spreadsheet always included but a
          single "mortgage payment" line item tends to hide.
        </p>
        <StackedBar segments={SEGMENTS.filter((s) => calc[s.key] > 0)} calc={calc} total={calc.allInMonthlyNewHouse} />
        <dl className="cost-breakdown">
          <Row label="PITI" value={piti} />
          <Row label="Maintenance reserve" value={calc.maintenanceMonthly} />
          <Row label="Utilities" value={calc.utilitiesMonthly} />
          {calc.hoaMonthly > 0 && <Row label="HOA" value={calc.hoaMonthly} />}
          <Row label="All-in total" value={calc.allInMonthlyNewHouse} strong />
        </dl>
      </div>
    </div>
  );
}

function StackedBar({ segments, calc, total }) {
  if (!total) return null;
  return (
    <div className="stacked-bar">
      {segments.map((s) => (
        <div
          key={s.key}
          className="stacked-bar-seg"
          style={{ width: `${(calc[s.key] / total) * 100}%`, background: s.color }}
          title={`${s.label}: ${formatCurrency(calc[s.key])}`}
        />
      ))}
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
