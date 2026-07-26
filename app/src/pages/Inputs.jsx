import { doc } from "firebase/firestore";
import { db, HOUSEHOLD_ID } from "../lib/firebase";
import { useHousehold } from "../lib/HouseholdContext";
import InputSection from "../components/InputSection";
import { fieldValue } from "../lib/fields";
import { humanizeKey } from "../lib/labels";

// Per BUILD_SPEC.md's Inputs screen: household-wide fields (apply to every
// property) and this property's own fields, kept in two clearly separated
// groups since conflating them is "the easiest way to build a confusing app."
const HOUSEHOLD_SECTIONS = [
  "income",
  "payrollDeductions",
  "taxes",
  "assetsAndDebts",
  "householdBudget",
  "secondHomeCarryingCost",
  "dataCoverageGap",
  "closingCostDetail",
  "brokerageLiquidation",
  "defaultAssumptions",
];

export default function Inputs() {
  const { household, selectedProperty } = useHousehold();
  const householdRef = doc(db, "households", HOUSEHOLD_ID);

  if (!selectedProperty) return <div className="card">Pick a property from the selector above.</div>;
  const propertyRef = doc(db, "households", HOUSEHOLD_ID, "properties", selectedProperty.id);

  return (
    <div className="inputs-screen">
      <details className="input-group" open>
        <summary>Household inputs <span className="input-group-hint">apply to every property</span></summary>
        <div className="input-group-body">
          {HOUSEHOLD_SECTIONS.map((key) => (
            <details key={key} className="input-accordion">
              <summary>{humanizeKey(key)}</summary>
              <InputSection
                data={household[key]}
                docRef={householdRef}
                fieldPathPrefix={key}
              />
            </details>
          ))}
        </div>
      </details>

      <details className="input-group" open>
        <summary>
          {fieldValue(selectedProperty.address) || selectedProperty.id}
          <span className="input-group-hint">this property only</span>
        </summary>
        <div className="input-group-body">
          <details className="input-accordion" open>
            <summary>Address & listing facts</summary>
            <InputSection
              data={selectedProperty}
              docRef={propertyRef}
              skipKeys={["loan", "propertyTax", "carryingCosts", "ratings", "id"]}
            />
          </details>
          <details className="input-accordion">
            <summary>Loan</summary>
            <InputSection data={selectedProperty.loan} docRef={propertyRef} fieldPathPrefix="loan" />
          </details>
          <details className="input-accordion">
            <summary>Property tax</summary>
            <InputSection data={selectedProperty.propertyTax} docRef={propertyRef} fieldPathPrefix="propertyTax" />
          </details>
          <details className="input-accordion">
            <summary>Carrying costs</summary>
            <InputSection data={selectedProperty.carryingCosts} docRef={propertyRef} fieldPathPrefix="carryingCosts" />
          </details>
        </div>
      </details>
    </div>
  );
}
