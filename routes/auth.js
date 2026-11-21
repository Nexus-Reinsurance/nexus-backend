const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/database');

// Compared against when the email is unknown, so the response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('no-such-user', 10);

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '1d'
  });
};

router.post('/login', async (req, res) => {
  // Express 5 leaves req.body undefined when the request has no parsable body.
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const result = await pool.query(
    'SELECT user_id, first_name, last_name, email, role, password_hash FROM app_user WHERE email = $1',
    [email.trim()]
  );
  const user = result.rows[0];

  // A user without a password_hash cannot log in.
  const matches = await bcrypt.compare(password, user?.password_hash || DUMMY_HASH);
  if (!user?.password_hash || !matches) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  await pool.query('UPDATE app_user SET last_login = now() WHERE user_id = $1', [user.user_id]);

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
});

module.exports = router;
