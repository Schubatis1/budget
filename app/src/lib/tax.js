// FICA and itemization-benefit math for the Tax Impact screen, per
// BUILD_SPEC.md calc notes #2, #3, and #13. Computed from first principles
// every time, never read from a stored pre-aggregated figure -- so this
// automatically stays correct if wages or the SALT cap change in Inputs.
import { fieldValue } from "./fields";

// Note on Adam vs Lauren's payroll deductions (calc note #13): Adam's
// 401(k) is Roth (after-tax) -- it was never subtracted from his Box 1
// wages, so no add-back is needed or correct for his Social Security wage
// base. Lauren's 403(b) (GRA/GSRA) IS genuinely pre-tax -- confirmed by her
// paystub's own Fed Taxable Gross math -- so it WAS subtracted from her Box
// 1 wages and must be added back to reach her true FICA wage base. HSA is
// never added back for either spouse (also genuinely pre-tax, and not
// subject to FICA in the first place).
export function computeFICA(household) {
  const v = fieldValue;
  const adamWages = v(household.income?.adamW2Wages) || 0;
  const spouseWagesBox1 = v(household.income?.spouseW2Wages) || 0;
  const spouse401k = v(household.payrollDeductions?.spouse401kAnnual) || 0;

  const wageBase = v(household.taxes?.ficaSocialSecurityWageBase2025) || 0;
  const ssRate = v(household.taxes?.ficaSocialSecurityRate) || 0;
  const medicareRate = v(household.taxes?.ficaMedicareRate) || 0;
  const addlMedicareRate = v(household.taxes?.ficaAdditionalMedicareRate) || 0;
  const addlMedicareThreshold = v(household.taxes?.ficaAdditionalMedicareThresholdMFJ) || 0;

  const adamTrueWages = adamWages; // Roth -- no add-back
  const spouseTrueWages = spouseWagesBox1 + spouse401k; // pre-tax 403(b) -- add back

  const adamSSWages = Math.min(adamTrueWages, wageBase);
  const spouseSSWages = Math.min(spouseTrueWages, wageBase);
  const socialSecurity = (adamSSWages + spouseSSWages) * ssRate;

  const combinedMedicareWages = adamTrueWages + spouseTrueWages;
  const medicare = combinedMedicareWages * medicareRate;
  const additionalMedicare = Math.max(0, combinedMedicareWages - addlMedicareThreshold) * addlMedicareRate;

  return {
    adamTrueWages,
    spouseTrueWages,
    socialSecurity,
    medicare,
    additionalMedicare,
    total: socialSecurity + medicare + additionalMedicare,
  };
}

// The 22%/24% MFJ bracket boundary itself isn't a household-specific
// assumption (it's a published IRS bracket, unlike e.g. the mortgage rate),
// so it's a plain constant here rather than a Firestore field -- matching
// how ssRate/medicareRate are treated as structural constants elsewhere.
const FEDERAL_RATE_BELOW_TOP_BRACKET = 0.22;

// Bracket-aware: only the portion of the itemizing deduction that reduces
// income while still inside the top bracket is worth the top rate; the
// portion crossing into the lower bracket is worth the lower rate.
export function computeItemizationBenefit(household, mortgageInterestYear1, propertyTaxAnnual) {
  const v = fieldValue;
  const agi = v(household.income?.adjustedGrossIncome) || 0;
  const standardDeduction = v(household.taxes?.standardDeductionMFJ2026Est) || 0;
  const saltCap = v(household.taxes?.saltCap2026) || 0;
  const topRate = v(household.taxes?.federalMarginalRateTop) || 0;
  const bracketThreshold = v(household.taxes?.federalBracket22to24ThresholdMFJTaxableIncome) || 0;
  const miIncomeTax = v(household.taxes?.michiganIncomeTaxActual2025) || 0;

  const saltUncapped = miIncomeTax + propertyTaxAnnual;
  const saltDeduction = Math.min(saltUncapped, saltCap);
  const itemizedTotal = mortgageInterestYear1 + saltDeduction;

  const incrementalDeduction = Math.max(0, itemizedTotal - standardDeduction);
  const taxableIncomeWithStandard = Math.max(0, agi - standardDeduction);
  const taxableIncomeWithItemized = Math.max(0, taxableIncomeWithStandard - incrementalDeduction);

  const portionAtTopRate = Math.max(
    0,
    taxableIncomeWithStandard - Math.max(taxableIncomeWithItemized, bracketThreshold)
  );
  const portionAtLowerRate = incrementalDeduction - portionAtTopRate;

  const benefit = portionAtTopRate * topRate + portionAtLowerRate * FEDERAL_RATE_BELOW_TOP_BRACKET;

  return {
    saltUncapped,
    saltDeduction,
    saltCapped: saltUncapped > saltCap,
    itemizedTotal,
    standardDeduction,
    incrementalDeduction,
    portionAtTopRate,
    portionAtLowerRate,
    topRate,
    lowerRate: FEDERAL_RATE_BELOW_TOP_BRACKET,
    spansTwoBrackets: portionAtTopRate > 0 && portionAtLowerRate > 0,
    benefit,
  };
}
