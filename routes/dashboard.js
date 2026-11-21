const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const protect = require('../middleware/auth');

router.get('/metrics', protect, async (req, res) => {
  // One pass over treaty; ::int and ::float8 make pg return JS numbers instead of strings.
  const result = await pool.query(`
    SELECT
      COUNT(*)::int AS "totalTreaties",
      COUNT(*) FILTER (WHERE treaty_status = 'active')::int AS "activeTreaties",
      COUNT(*) FILTER (
        WHERE treaty_renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
      )::int AS "upcomingRenewals",
      COALESCE(SUM(earned_premium), 0)::float8 AS "totalPremium",
      COALESCE(SUM(claims_incurred), 0)::float8 AS "totalClaims"
    FROM treaty
  `);

  res.json({ success: true, metrics: result.rows[0] });
});

module.exports = router;
