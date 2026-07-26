// Standard fixed-rate amortization formula. Shared by the Compare panel,
// Dashboard, and Monthly Cost screens so there is exactly one implementation
// of "monthly P&I" in the app, per BUILD_SPEC.md's correctness priority.
export function monthlyPrincipalAndInterest(principal, annualRate, termYears) {
  if (!principal || !termYears) return 0;
  const n = termYears * 12;
  if (!annualRate) return principal / n;
  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}
