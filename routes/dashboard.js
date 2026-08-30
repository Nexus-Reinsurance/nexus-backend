const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const protect = require('../middleware/auth');

router.get('/metrics', protect, async (req, res) => {
  try {
    const totalTreatiesResult = await pool.query(
      'SELECT COUNT(*) as count FROM treaty'
    );
    const totalTreaties = parseInt(totalTreatiesResult.rows[0].count);

    const activeTreatiesResult = await pool.query(
      "SELECT COUNT(*) as count FROM treaty WHERE treaty_status = 'active'"
    );
    const activeTreaties = parseInt(activeTreatiesResult.rows[0].count);

    const upcomingRenewalsResult = await pool.query(
      `SELECT COUNT(*) as count FROM treaty 
       WHERE treaty_renewal_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`
    );
    const upcomingRenewals = parseInt(upcomingRenewalsResult.rows[0].count);

    const totalPremiumResult = await pool.query(
      'SELECT COALESCE(SUM(earned_premium), 0) as total FROM treaty'
    );
    const totalPremium = parseFloat(totalPremiumResult.rows[0].total);

    const totalClaimsResult = await pool.query(
      'SELECT COALESCE(SUM(claims_incurred), 0) as total FROM treaty'
    );
    const totalClaims = parseFloat(totalClaimsResult.rows[0].total);

    res.json({
      success: true,
      metrics: {
        totalTreaties,
        activeTreaties,
        upcomingRenewals,
        totalPremium,
        totalClaims
      }
    });
  } catch (error) {
    console.error('Dashboard metrics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;