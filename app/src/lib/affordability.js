// Dashboard-level affordability math, computed from the shared household
// document plus the currently-selected property -- per BUILD_SPEC.md calc
// note #11, every property must read the SAME household inputs (income,
// taxes, assets, the departing residence's carrying cost); only price, loan
// terms, property tax, and carrying costs vary by property.
//
// Net income here uses the same bracket-aware itemization benefit and
// first-principles FICA as the Tax Impact and Household Budget screens
// (via computeFICA/computeItemizationBenefit), so all three screens agree
// with each other rather than each keeping a slightly different net-income
// approximation that has to be reconciled after the fact.
import { fieldValue } from "./fields";
import { monthlyPrincipalAndInterest } from "./mortgage";
import { generateSchedule, yearlyTotals } from "./amortization";
import { computeFICA, computeItemizationBenefit } from "./tax";

const LOW_SURPLUS_THRESHOLD = 1000;

export function computeAffordability(household, property) {
  if (!household || !property) return null;
  const v = fieldValue;

  const listPrice = v(property.listPrice) || 0;
  const loanAmount = v(property.loan?.loanAmount) || 0;
  const rate = v(property.loan?.interestRateAnnual) || 0;
  const term = v(property.loan?.termYears) || 30;
  const pmiMonthly = v(property.loan?.pmiMonthly) || 0;
  const downPaymentAmount = v(property.loan?.downPaymentAmount) || 0;

  const annualPropertyTax = v(property.propertyTax?.annualPropertyTax) || 0;
  const propertyTaxMonthly = annualPropertyTax / 12;

  const insuranceAnnual = v(property.carryingCosts?.homeownersInsuranceAnnual) || 0;
  const insuranceMonthly = insuranceAnnual / 12;
  const maintenancePct = v(property.carryingCosts?.maintenanceReservePctOfValueAnnual) || 0;
  const maintenanceMonthly = (listPrice * maintenancePct) / 12;
  const utilitiesMonthly = v(property.carryingCosts?.utilitiesMonthly) || 0;
  const hoaMonthly = v(property.hoaMonthly) || v(property.carryingCosts?.hoaMonthly) || 0;

  const monthlyPI = monthlyPrincipalAndInterest(loanAmount, rate, term);
  const pitiMonthly = monthlyPI + propertyTaxMonthly + pmiMonthly;
  const allInMonthlyNewHouse =
    pitiMonthly + insuranceMonthly + maintenanceMonthly + utilitiesMonthly + hoaMonthly;

  // --- Net household income: gross wages/investment income minus federal
  // (itemization-adjusted), MI, and FICA (first-principles, no city tax --
  // eliminated by the move). Same methodology as the Household Budget and
  // Tax Impact screens' "With House" figures. ---
  const grossAnnualIncome =
    (v(household.income?.adamW2Wages) || 0) +
    (v(household.payrollDeductions?.adam401kAnnual) || 0) +
    (v(household.payrollDeductions?.adamHsaAnnual) || 0) +
    (v(household.income?.spouseW2Wages) || 0) +
    (v(household.payrollDeductions?.spouse401kAnnual) || 0) +
    (v(household.income?.taxableInterest) || 0) +
    (v(household.income?.ordinaryDividends) || 0);

  const year1Interest = (yearlyTotals(generateSchedule(loanAmount, rate, term))[0] || { interestPaid: 0 }).interestPaid;
  const itemization = computeItemizationBenefit(household, year1Interest, annualPropertyTax);
  const fedTaxAfterItemizing = (v(household.taxes?.federalIncomeTaxActual2025) || 0) - itemization.benefit;
  const miTax = v(household.taxes?.michiganIncomeTaxActual2025) || 0;
  const fica = computeFICA(household).total;

  const netAnnualIncome = grossAnnualIncome - fedTaxAfterItemizing - miTax - fica;
  const netMonthlyIncome = netAnnualIncome / 12;

  // --- Recurring expenses ---
  const nonHousingExpensesMonthly = v(household.householdBudget?.nonHousingLivingExpensesMonthly) || 0;
  const childcareMonthly = v(household.householdBudget?.childcareMonthly) || 0;
  const currentHouseCarryMonthly = v(household.secondHomeCarryingCost?.totalMonthlyCashCarry) || 0;
  // Real recurring debt (e.g. Lauren's student loan) -- omitting this would
  // silently inflate the surplus, per BUILD_SPEC.md calc note #10 (the same
  // debt inputs used for DTI must also be used here).
  const otherMonthlyDebtPayments = v(household.assetsAndDebts?.otherMonthlyDebtPayments) || 0;
  // netMonthlyIncome above is gross wages MINUS TAXES ONLY -- 401(k)/HSA/
  // health-premium payroll deductions are deliberately not subtracted yet
  // (same convention as the original spreadsheet's "Total Income (A)" row:
  // "401(k), HSA, and health insurance premiums are NOT subtracted here --
  // they show up as real expense lines below"). They have to be subtracted
  // here, or the surplus is overstated by the full deduction amount.
  const payrollDeductionsMonthly =
    ((v(household.payrollDeductions?.adam401kAnnual) || 0) +
      (v(household.payrollDeductions?.spouse401kAnnual) || 0) +
      (v(household.payrollDeductions?.adamHsaAnnual) || 0) +
      (v(household.payrollDeductions?.healthInsurancePremiumsAnnual) || 0)) /
    12;

  const surplusOverlap =
    netMonthlyIncome - payrollDeductionsMonthly - nonHousingExpensesMonthly - childcareMonthly - currentHouseCarryMonthly - allInMonthlyNewHouse - otherMonthlyDebtPayments;
  const surplusSteadyState =
    netMonthlyIncome - payrollDeductionsMonthly - nonHousingExpensesMonthly - childcareMonthly - allInMonthlyNewHouse - otherMonthlyDebtPayments;

  // --- Cash to close ---
  const buyerClosingCostsPct = v(property.carryingCosts?.buyerClosingCostsPctOfPrice) || 0;
  const buyerClosingCosts = listPrice * buyerClosingCostsPct;
  const prepaidInterestDays = v(household.closingCostDetail?.prepaidInterestDays) || 0;
  const prepaidInterest = (loanAmount * rate * prepaidInterestDays) / 365;
  const insuranceMonthsCollected = v(household.closingCostDetail?.insuranceMonthsCollectedAtClosing) || 0;
  const insurancePrepaid = (insuranceAnnual / 12) * insuranceMonthsCollected;
  const taxProrationMonths = v(household.closingCostDetail?.propertyTaxProrationOwedToSellerMonths) || 0;
  const taxProration = (annualPropertyTax / 12) * taxProrationMonths;

  const cashRequiredAtClosing =
    downPaymentAmount + buyerClosingCosts + prepaidInterest + insurancePrepaid + taxProration;

  // --- Cash on hand vs brokerage (never conflated -- BUILD_SPEC.md "what not to do") ---
  const cashOnHand = v(household.assetsAndDebts?.cashAndSavings) || 0;
  const taxableBrokerage = v(household.assetsAndDebts?.taxableBrokerage) || 0;
  const embeddedGainPct = v(household.brokerageLiquidation?.embeddedGainPctOfTaxableAccount) || 0;
  const capGainsRate = v(household.brokerageLiquidation?.capitalGainsRateCombined) || 0;
  const brokerageGain = taxableBrokerage * embeddedGainPct;
  const brokerageAfterTaxIfFullyLiquidated = taxableBrokerage - brokerageGain * capGainsRate;

  const cashShortfall = Math.max(0, cashRequiredAtClosing - cashOnHand);
  // Gross up only the portion of the shortfall that's actually gain, at the
  // combined cap-gains rate, per calc note #8.
  const shortfallGrossedUpForTax =
    cashShortfall > 0 ? cashShortfall / (1 - embeddedGainPct * capGainsRate) : 0;

  const totalLiquidity = cashOnHand + brokerageAfterTaxIfFullyLiquidated;

  // --- Reserve runway, cash-only vs cash+brokerage, never conflated ---
  const emergencyReserveTargetMonths = v(household.householdBudget?.emergencyReserveTargetMonths) || 0;
  const monthlyBurn = nonHousingExpensesMonthly + childcareMonthly + allInMonthlyNewHouse;
  const remainingCashAfterClosing = cashOnHand - cashRequiredAtClosing;
  const remainingCashAndBrokerageAfterClosing = totalLiquidity - cashRequiredAtClosing;
  const reserveMonthsCashOnly = monthlyBurn > 0 ? Math.max(0, remainingCashAfterClosing) / monthlyBurn : 0;
  const reserveMonthsWithBrokerage = monthlyBurn > 0 ? Math.max(0, remainingCashAndBrokerageAfterClosing) / monthlyBurn : 0;

  const verdict = computeVerdict({
    cashRequiredAtClosing,
    totalLiquidity,
    surplusOverlap,
  });

  return {
    listPrice,
    monthlyPI,
    propertyTaxMonthly,
    insuranceMonthly,
    maintenanceMonthly,
    utilitiesMonthly,
    hoaMonthly,
    pmiMonthly,
    pitiMonthly,
    allInMonthlyNewHouse,
    netMonthlyIncome,
    payrollDeductionsMonthly,
    nonHousingExpensesMonthly,
    childcareMonthly,
    currentHouseCarryMonthly,
    otherMonthlyDebtPayments,
    surplusOverlap,
    surplusSteadyState,
    cashRequiredAtClosing,
    downPaymentAmount,
    buyerClosingCosts,
    prepaidInterest,
    insurancePrepaid,
    taxProration,
    cashOnHand,
    taxableBrokerage,
    brokerageAfterTaxIfFullyLiquidated,
    cashShortfall,
    shortfallGrossedUpForTax,
    totalLiquidity,
    emergencyReserveTargetMonths,
    monthlyBurn,
    remainingCashAfterClosing,
    remainingCashAndBrokerageAfterClosing,
    reserveMonthsCashOnly,
    reserveMonthsWithBrokerage,
    verdict,
  };
}

// DTI and take-home-basis figures, per BUILD_SPEC.md screen #6 (Affordability).
// Kept separate from computeAffordability() so that function's return shape
// stays focused on the Dashboard/Monthly Cost/Cash to Close numbers.
//
// Per calc note #10: the SAME debt inputs (otherMonthlyDebtPayments, the
// current home's PITI+HOA during overlap) must be used here as anywhere else
// a "max affordable price" or DTI figure is computed, so they never imply
// inconsistent conclusions.
export function computeDTI(household, property, calc) {
  const v = fieldValue;
  const grossMonthlyIncome = (v(household.income?.lenderQualifyingIncomeWagesOnly) || 0) / 12;
  const otherMonthlyDebt = v(household.assetsAndDebts?.otherMonthlyDebtPayments) || 0;
  const currentHousePitiPlusHoa = v(household.secondHomeCarryingCost?.pitiPlusHoa) || 0;

  const frontEndDTI = grossMonthlyIncome > 0 ? calc.pitiMonthly / grossMonthlyIncome : 0;
  const backEndDTIOverlap = grossMonthlyIncome > 0
    ? (calc.pitiMonthly + currentHousePitiPlusHoa + otherMonthlyDebt) / grossMonthlyIncome
    : 0;
  const backEndDTISteadyState = grossMonthlyIncome > 0
    ? (calc.pitiMonthly + otherMonthlyDebt) / grossMonthlyIncome
    : 0;

  const takeHomePct = calc.netMonthlyIncome > 0 ? calc.allInMonthlyNewHouse / calc.netMonthlyIncome : 0;
  const takeHomeBand = takeHomePct < 0.3 ? "comfortable" : takeHomePct <= 0.4 ? "tight" : "house-poor";

  const adam401k = (v(household.payrollDeductions?.adam401kAnnual) || 0) / 12;
  const spouse401k = (v(household.payrollDeductions?.spouse401kAnnual) || 0) / 12;
  const adamHsa = (v(household.payrollDeductions?.adamHsaAnnual) || 0) / 12;
  const payrollSavingsMonthly = adam401k + spouse401k + adamHsa;

  return {
    grossMonthlyIncome,
    otherMonthlyDebt,
    currentHousePitiPlusHoa,
    frontEndDTI,
    backEndDTIOverlap,
    backEndDTISteadyState,
    takeHomePct,
    takeHomeBand,
    payrollSavingsMonthly,
  };
}

function computeVerdict({ cashRequiredAtClosing, totalLiquidity, surplusOverlap }) {
  if (cashRequiredAtClosing > totalLiquidity) {
    return {
      level: "critical",
      headline: "SHORT ON CASH TO CLOSE",
      detail: "Cash on hand plus liquidatable brokerage (after estimated capital gains tax) doesn't cover the estimated cash needed at closing.",
    };
  }
  if (surplusOverlap < 0) {
    return {
      level: "critical",
      headline: "DOES NOT CLEAR DURING THE OVERLAP",
      detail: "Monthly surplus while carrying both homes is negative at current assumptions.",
    };
  }
  if (surplusOverlap < LOW_SURPLUS_THRESHOLD) {
    return {
      level: "warning",
      headline: "CLEARS, BUT THIN DURING THE OVERLAP",
      detail: `Overlap-period surplus is positive but under the $${LOW_SURPLUS_THRESHOLD.toLocaleString()}/mo comfort threshold -- carrying two homes plus other obligations at once makes cash flow tight even though lender DTI tests likely pass with room. The steady-state number (after the second home sells) is the one that matters most going forward.`,
    };
  }
  return {
    level: "good",
    headline: "AFFORDABLE",
    detail: "Clears with real room in both the overlap period and the steady state, at current assumptions.",
  };
}
