const { calculateLossRatio, classifyRisk, getRecommendation } = require('./treatyRules');

// `db` is the pool or a client inside a transaction; both have .query().

// cedent.name has no unique constraint, so look the name up first to keep re-runs from duplicating.
const getOrCreateCedent = async (db, { name, region, email, phone = null }) => {
  const found = await db.query(
    'SELECT cedent_id FROM cedent WHERE name = $1 ORDER BY cedent_id LIMIT 1',
    [name]
  );
  if (found.rows.length) return found.rows[0].cedent_id;
  const created = await db.query(
    `INSERT INTO cedent (name, region, email, phone_number)
     VALUES ($1, $2, $3, $4) RETURNING cedent_id`,
    [name, region, email, phone]
  );
  return created.rows[0].cedent_id;
};

// Loss ratio, risk level and recommendation are always derived here from premium and claims,
// so they cannot disagree with them. Every treaty write goes through this.
const derived = (t) => {
  const lossRatio = calculateLossRatio(t.earnedPremium, t.claimsIncurred);
  return [lossRatio, classifyRisk(lossRatio), getRecommendation(lossRatio)];
};

// Seed and import: inserts or updates a treaty by treaty_code. The renewal date is
// `daysUntilRenewal` from today and the effective date one year earlier.
const upsertTreaty = async (db, t) => {
  await db.query(
    `INSERT INTO treaty
       (cedent_id, name, treaty_code, treaty_type, business_line,
        earned_premium, claims_incurred, loss_ratio, risk_level, recommendation,
        treaty_effective_date, treaty_renewal_date, treaty_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
             CURRENT_DATE + $11::int - 365, CURRENT_DATE + $11::int, 'active')
     ON CONFLICT (treaty_code) DO UPDATE SET
       cedent_id = EXCLUDED.cedent_id,
       name = EXCLUDED.name,
       treaty_type = EXCLUDED.treaty_type,
       business_line = EXCLUDED.business_line,
       earned_premium = EXCLUDED.earned_premium,
       claims_incurred = EXCLUDED.claims_incurred,
       loss_ratio = EXCLUDED.loss_ratio,
       risk_level = EXCLUDED.risk_level,
       recommendation = EXCLUDED.recommendation,
       treaty_effective_date = EXCLUDED.treaty_effective_date,
       treaty_renewal_date = EXCLUDED.treaty_renewal_date,
       treaty_status = EXCLUDED.treaty_status,
       treaty_updated = now()`,
    [t.cedentId, t.name, t.code, t.type, t.businessLine, t.earnedPremium, t.claimsIncurred,
      ...derived(t), t.daysUntilRenewal]
  );
};

// API: inserts a new active treaty with the given dates. Never overwrites an existing treaty:
// returns the new treaty_id, or null when treaty_code is already taken.
const createTreaty = async (db, t) => {
  const result = await db.query(
    `INSERT INTO treaty
       (cedent_id, name, treaty_code, treaty_type, business_line,
        earned_premium, claims_incurred, loss_ratio, risk_level, recommendation,
        treaty_effective_date, treaty_renewal_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (treaty_code) DO NOTHING
     RETURNING treaty_id`,
    [t.cedentId, t.name, t.code, t.type, t.businessLine, t.earnedPremium, t.claimsIncurred,
      ...derived(t), t.effectiveDate, t.renewalDate]
  );
  return result.rows[0]?.treaty_id ?? null;
};

module.exports = { getOrCreateCedent, upsertTreaty, createTreaty };
