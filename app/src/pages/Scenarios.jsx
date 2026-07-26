import { useHousehold } from "../lib/HouseholdContext";
import { computeAffordability } from "../lib/affordability";
import { monthlyPrincipalAndInterest } from "../lib/mortgage";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";

const PRICE_DELTAS = [-0.05, -0.025, 0, 0.025, 0.05];
const RATE_DELTAS = [-0.005, -0.0025, 0, 0.0025, 0.005];
const SPENDING_MULTIPLIERS = [0.9, 1.0, 1.1, 1.25];

export default function Scenarios() {
  const { household, selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const v = fieldValue;
  const baseCalc = computeAffordability(household, selectedProperty);
  const basePrice = v(selectedProperty.listPrice) || 0;
  const downPct = v(selectedProperty.loan?.downPaymentPct) || 0;
  const baseRate = v(selectedProperty.loan?.interestRateAnnual) || 0;
  const term = v(selectedProperty.loan?.termYears) || 30;
  const taxableValuePct = v(selectedProperty.propertyTax?.taxableValuePctOfPrice) || 0;
  const millage = v(selectedProperty.propertyTax?.millageHomesteadPRE) || 0;
  const fixedMonthlyCosts =
    baseCalc.insuranceMonthly + baseCalc.utilitiesMonthly + baseCalc.hoaMonthly;
  const maintenancePct = v(selectedProperty.carryingCosts?.maintenanceReservePctOfValueAnnual) || 0;

  function allInMonthlyAt(price, rate) {
    const loanAmount = price * (1 - downPct);
    const pi = monthlyPrincipalAndInterest(loanAmount, rate, term);
    const propertyTaxMonthly = (price * taxableValuePct * (millage / 1000)) / 12;
    const maintenanceMonthly = (price * maintenancePct) / 12;
    return pi + propertyTaxMonthly + maintenanceMonthly + fixedMonthlyCosts;
  }

  function surplusAt(spendingMultiplier, carryingBoth) {
    const expenses = baseCalc.nonHousingExpensesMonthly * spendingMultiplier;
    const currentHouse = carryingBoth ? baseCalc.currentHouseCarryMonthly : 0;
    return baseCalc.netMonthlyIncome - expenses - baseCalc.childcareMonthly - currentHouse - baseCalc.allInMonthlyNewHouse;
  }

  return (
    <div className="dashboard-screen">
      <h2>Scenarios — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>

      <div className="card">
        <h3>Price × rate sensitivity — all-in monthly cost</h3>
        <div className="compare-table-wrap">
          <table className="compare-table sensitivity-table">
            <thead>
              <tr>
                <th>Price \ Rate</th>
                {RATE_DELTAS.map((rd) => (
                  <th key={rd}>{((baseRate + rd) * 100).toFixed(2)}%</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PRICE_DELTAS.map((pd) => (
                <tr key={pd}>
                  <td>{formatCurrency(basePrice * (1 + pd))}</td>
                  {RATE_DELTAS.map((rd) => (
                    <td key={rd} className={pd === 0 && rd === 0 ? "sensitivity-base" : ""}>
                      {formatCurrency(allInMonthlyAt(basePrice * (1 + pd), baseRate + rd))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Spending × second-home status — monthly surplus</h3>
        <div className="compare-table-wrap">
          <table className="compare-table sensitivity-table">
            <thead>
              <tr>
                <th>Non-housing spending</th>
                <th>Carrying both homes</th>
                <th>Second home sold</th>
              </tr>
            </thead>
            <tbody>
              {SPENDING_MULTIPLIERS.map((m) => (
                <tr key={m}>
                  <td>{m === 1 ? "Current" : `${m > 1 ? "+" : ""}${((m - 1) * 100).toFixed(0)}%`}</td>
                  <td className={surplusAt(m, true) < 0 ? "sensitivity-negative" : ""}>{formatCurrency(surplusAt(m, true))}</td>
                  <td className={surplusAt(m, false) < 0 ? "sensitivity-negative" : ""}>{formatCurrency(surplusAt(m, false))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: 12 }}>
          The finding that matters: this model is not especially fragile to market assumptions
          (price, rate, tax, insurance) -- see the grid above, where even a 5% price swing and a
          0.5-point rate swing move the monthly cost by a few hundred dollars. It's far more
          sensitive to the two personal-data assumptions: how much non-housing spending actually
          runs, and whether the current home is sold before or after the new one closes.
        </p>
      </div>
    </div>
  );
}
