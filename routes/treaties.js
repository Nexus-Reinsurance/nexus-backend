const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const protect = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.name as cedent_name, c.email as cedent_email, c.region as cedent_region
      FROM treaty t
      LEFT JOIN cedent c ON t.cedent_id = c.cedent_id
      ORDER BY t.treaty_created_on DESC
    `);

    res.json({ success: true, treaties: result.rows });
  } catch (error) {
    console.error('Get treaties error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, c.name as cedent_name, c.email as cedent_email, c.region as cedent_region
      FROM treaty t
      LEFT JOIN cedent c ON t.cedent_id = c.cedent_id
      WHERE t.treaty_id = $1
    `, [req.params.id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Treaty not found' });
    }

    res.json({ success: true, treaty: result.rows[0] });
  } catch (error) {
    console.error('Get treaty error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;