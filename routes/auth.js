// routes/auth.js
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { getDb } = require('../db');

router.post('/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) return res.status(400).json({ error: 'Email and password are required' });

  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email.toLowerCase().trim());
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  if (!bcrypt.compareSync(password, admin.password)) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: admin.id, email: admin.email, name: admin.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  res.json({ token, admin: { id: admin.id, email: admin.email, name: admin.name } });
});

router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  res.json({ admin: req.admin });
});

router.post('/change-password', require('../middleware/auth').requireAuth, (req, res) => {
  const db = getDb();
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords are required' });
  if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.admin.id);
  if (!bcrypt.compareSync(current_password, admin.password)) return res.status(401).json({ error: 'Current password is incorrect' });

  const hash = bcrypt.hashSync(new_password, 12);
  db.prepare("UPDATE admins SET password = ? WHERE id = ?").run(hash, req.admin.id);
  res.json({ message: 'Password updated successfully' });
});

module.exports = router;
