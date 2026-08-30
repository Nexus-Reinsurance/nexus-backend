const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE
  });
};

router.post('/login', async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query(
      'SELECT * FROM app_user WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: 'User not found. Please use demo@nexus.com' 
      });
    }

    const user = result.rows[0];

    res.json({
      success: true,
      user: {
        id: user.user_id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role
      },
      token: generateToken(user.user_id)
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;