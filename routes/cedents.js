const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const protect = require('../middleware/auth');

// Cedents for pickers such as the Add Treaty form, by name. cedent_id breaks ties: names are not unique.
router.get('/', protect, async (req, res) => {
  const result = await pool.query(
    'SELECT cedent_id, name, region, email FROM cedent ORDER BY name, cedent_id'
  );
  res.json({ success: true, cedents: result.rows });
});

module.exports = router;
