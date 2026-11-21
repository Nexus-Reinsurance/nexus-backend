const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const protect = require('../middleware/auth');
const { calculateLossRatio, MAX_LOSS_RATIO } = require('../lib/treatyRules');
const { createTreaty } = require('../lib/treatyStore');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TREATY_TYPES = ['Quota Share', 'Excess of Loss', 'Stop Loss', 'Surplus']; // the frontend's TreatyType
const DECISION_ACTIONS = ['renew', 'review', 'reprice', 'escalate']; // the decision.action CHECK constraint
const MAX_AMOUNT = 999999999999.99; // NUMERIC(14,2)

const TREATY_SELECT = `
  SELECT t.*, c.name as cedent_name, c.email as cedent_email, c.region as cedent_region
  FROM treaty t
  LEFT JOIN cedent c ON t.cedent_id = c.cedent_id`;

const text = (v, max) => typeof v === 'string' && v.trim() !== '' && v.trim().length <= max;
const amount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_AMOUNT;
// A real calendar date as YYYY-MM-DD: the round trip rejects values such as 2026-02-30.
const isDate = (v) => typeof v === 'string' && /^[12]\d{3}-\d{2}-\d{2}$/.test(v) &&
  !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().startsWith(v);

// Returns the first problem with a new treaty, or undefined when it is valid.
const treatyError = (t) => {
  const checks = [
    [UUID_RE.test(t.cedent_id), 'cedent_id must be a cedent ID'],
    [text(t.treaty_code, 20), 'treaty_code is required (up to 20 characters)'],
    [text(t.name, 150), 'name is required (up to 150 characters)'],
    [TREATY_TYPES.includes(t.treaty_type), `treaty_type must be one of: ${TREATY_TYPES.join(', ')}`],
    [text(t.business_line, 100), 'business_line is required (up to 100 characters)'],
    [amount(t.earned_premium) && t.earned_premium > 0, 'earned_premium must be a positive number'],
    [amount(t.claims_incurred), 'claims_incurred must be a number, 0 or more'],
    [calculateLossRatio(t.earned_premium, t.claims_incurred) <= MAX_LOSS_RATIO,
      'claims_incurred must be less than 100 times earned_premium'],
    [isDate(t.treaty_effective_date), 'treaty_effective_date must be a date (YYYY-MM-DD)'],
    [isDate(t.treaty_renewal_date), 'treaty_renewal_date must be a date (YYYY-MM-DD)'],
    [t.treaty_renewal_date > t.treaty_effective_date, 'treaty_renewal_date must be after treaty_effective_date'],
  ];
  return checks.find(([ok]) => !ok)?.[1];
};

// Every treaty route needs a valid token; it is checked before the ID below.
router.use(protect);

router.param('id', (req, res, next, id) => {
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ success: false, message: 'Invalid treaty ID' });
  }
  next();
});

router.get('/', async (req, res) => {
  // treaty_code breaks ties: seeded treaties share one creation timestamp.
  const result = await pool.query(`${TREATY_SELECT} ORDER BY t.treaty_created_on DESC, t.treaty_code`);
  res.json({ success: true, treaties: result.rows });
});

router.post('/', async (req, res) => {
  const t = req.body ?? {};
  const error = treatyError(t);
  if (error) {
    return res.status(400).json({ success: false, message: error });
  }

  const cedent = await pool.query('SELECT 1 FROM cedent WHERE cedent_id = $1', [t.cedent_id]);
  if (cedent.rows.length === 0) {
    return res.status(400).json({ success: false, message: 'Cedent not found' });
  }

  const treatyId = await createTreaty(pool, {
    cedentId: t.cedent_id, code: t.treaty_code.trim(), name: t.name.trim(), type: t.treaty_type,
    businessLine: t.business_line.trim(), earnedPremium: t.earned_premium, claimsIncurred: t.claims_incurred,
    effectiveDate: t.treaty_effective_date, renewalDate: t.treaty_renewal_date,
  });
  if (!treatyId) {
    return res.status(409).json({ success: false, message: 'A treaty with this treaty_code already exists' });
  }

  const result = await pool.query(`${TREATY_SELECT} WHERE t.treaty_id = $1`, [treatyId]);
  res.status(201).json({ success: true, treaty: result.rows[0] });
});

router.get('/:id', async (req, res) => {
  const result = await pool.query(`${TREATY_SELECT} WHERE t.treaty_id = $1`, [req.params.id]);

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Treaty not found' });
  }

  res.json({ success: true, treaty: result.rows[0] });
});

// Decision history, newest first. Decisions are never edited, so every row is kept.
router.get('/:id/decisions', async (req, res) => {
  const treaty = await pool.query('SELECT 1 FROM treaty WHERE treaty_id = $1', [req.params.id]);
  if (treaty.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Treaty not found' });
  }

  const result = await pool.query(
    `SELECT d.*, u.first_name || ' ' || u.last_name AS user_name
     FROM decision d
     JOIN app_user u ON u.user_id = d.user_id
     WHERE d.treaty_id = $1
     ORDER BY d.created_on DESC, d.decision_id`,
    [req.params.id]
  );

  res.json({ success: true, decisions: result.rows });
});

// Records the logged-in user's decision on a treaty.
router.post('/:id/decisions', async (req, res) => {
  const { action, notes } = req.body ?? {};
  if (!DECISION_ACTIONS.includes(action)) {
    return res.status(400).json({ success: false, message: `action must be one of: ${DECISION_ACTIONS.join(', ')}` });
  }
  if (notes != null && typeof notes !== 'string') {
    return res.status(400).json({ success: false, message: 'notes must be text' });
  }

  // Selecting from treaty makes an unknown treaty insert nothing (404) instead of failing the foreign key.
  const result = await pool.query(
    `INSERT INTO decision (treaty_id, user_id, action, notes)
     SELECT treaty_id, $2, $3, $4 FROM treaty WHERE treaty_id = $1
     RETURNING *`,
    [req.params.id, req.user.user_id, action, notes?.trim() || null]
  );
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Treaty not found' });
  }

  const user_name = `${req.user.first_name} ${req.user.last_name}`;
  res.status(201).json({ success: true, decision: { ...result.rows[0], user_name } });
});

module.exports = router;
