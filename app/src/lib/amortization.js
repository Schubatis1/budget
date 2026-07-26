// Month-by-month amortization schedule, grouped into yearly totals. Shared
// by the Tax Impact screen (needs real year-1 interest, not principal*rate)
// and the Amortization screen (BUILD_SPEC.md screen #9).
export function generateSchedule(principal, annualRate, termYears) {
  const months = termYears * 12;
  const monthlyRate = annualRate / 12;
  const payment = monthlyRate
    ? (principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months))
    : principal / months;

  let balance = principal;
  const schedule = [];
  for (let m = 1; m <= months && balance > 0.005; m++) {
    const interest = balance * monthlyRate;
    let principalPaid = payment - interest;
    if (principalPaid > balance) principalPaid = balance;
    balance -= principalPaid;
    schedule.push({ month: m, interest, principalPaid, balance });
  }
  return schedule;
}

export function yearlyTotals(schedule) {
  const years = [];
  for (let i = 0; i < schedule.length; i += 12) {
    const yearMonths = schedule.slice(i, i + 12);
    years.push({
      year: Math.floor(i / 12) + 1,
      principalPaid: yearMonths.reduce((s, m) => s + m.principalPaid, 0),
      interestPaid: yearMonths.reduce((s, m) => s + m.interest, 0),
      endingBalance: yearMonths[yearMonths.length - 1].balance,
    });
  }
  return years;
}
