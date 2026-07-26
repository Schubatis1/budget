import { useHousehold } from "../lib/HouseholdContext";
import { generateSchedule, yearlyTotals } from "../lib/amortization";
import { formatCurrency } from "../lib/format";
import { fieldValue } from "../lib/fields";

// Year-by-year summary only, per BUILD_SPEC.md screen #9 -- "the full
// 360-row schedule is the least mobile-friendly part of the original model
// and the lowest priority to rebuild richly."
export default function Amortization() {
  const { selectedProperty } = useHousehold();
  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;

  const v = fieldValue;
  const loanAmount = v(selectedProperty.loan?.loanAmount) || 0;
  const rate = v(selectedProperty.loan?.interestRateAnnual) || 0;
  const term = v(selectedProperty.loan?.termYears) || 30;
  const years = yearlyTotals(generateSchedule(loanAmount, rate, term));

  return (
    <div className="dashboard-screen">
      <h2>Amortization — {fieldValue(selectedProperty.address) || selectedProperty.id}</h2>
      <div className="card">
        <div className="compare-table-wrap">
          <table className="compare-table">
            <thead>
              <tr><th>Year</th><th>Principal paid</th><th>Interest paid</th><th>Ending balance</th></tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year}>
                  <td>{y.year}</td>
                  <td>{formatCurrency(y.principalPaid)}</td>
                  <td>{formatCurrency(y.interestPaid)}</td>
                  <td>{formatCurrency(y.endingBalance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
