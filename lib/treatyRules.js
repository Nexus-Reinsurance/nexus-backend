// Phase 1 business rules. The thresholds are project assumptions, not real underwriting rules.
const HIGH_RISK = 0.8;
const MEDIUM_RISK = 0.6;
const MAX_LOSS_RATIO = 99.9999; // treaty.loss_ratio is NUMERIC(6,4)

// Rounded to 4 decimals, the precision of treaty.loss_ratio, so the stored value and its risk label agree.
const calculateLossRatio = (earnedPremium, claimsIncurred) => {
  const premium = Number(earnedPremium);
  const claims = Number(claimsIncurred);
  if (!(premium > 0) || !(claims >= 0)) return null;
  return Math.round((claims / premium) * 10000) / 10000;
};

const classifyRisk = (lossRatio) => {
  if (lossRatio == null) return null;
  if (lossRatio >= HIGH_RISK) return 'High';
  if (lossRatio >= MEDIUM_RISK) return 'Medium';
  return 'Low';
};

const pct = (ratio, digits) => `${(ratio * 100).toFixed(digits)}%`;

// The recommendation states the suggested action and why, so the user can see the reason for the flag.
const getRecommendation = (lossRatio) => {
  const lr = lossRatio == null ? null : pct(lossRatio, 2);
  switch (classifyRisk(lossRatio)) {
    case 'High':
      return `Reprice or escalate: loss ratio ${lr} is at or above the ${pct(HIGH_RISK, 0)} high-risk threshold.`;
    case 'Medium':
      return `Review terms: loss ratio ${lr} is between the ${pct(MEDIUM_RISK, 0)} and ${pct(HIGH_RISK, 0)} thresholds.`;
    case 'Low':
      return `Renew: loss ratio ${lr} is below the ${pct(MEDIUM_RISK, 0)} threshold.`;
    default:
      return null;
  }
};

module.exports = { HIGH_RISK, MEDIUM_RISK, MAX_LOSS_RATIO, calculateLossRatio, classifyRisk, getRecommendation };
