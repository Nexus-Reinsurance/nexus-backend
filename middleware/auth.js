const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const protect = async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ success: false, message: 'Not authorized, invalid token' });
  }

  // Database errors go to the central error handler (500) instead of being reported as a bad token.
  const result = await pool.query(
    'SELECT user_id, first_name, last_name, role, email FROM app_user WHERE user_id = $1',
    [decoded.id]
  );

  if (result.rows.length === 0) {
    return res.status(401).json({ success: false, message: 'User not found' });
  }

  req.user = result.rows[0];
  next();
};

module.exports = protect;
