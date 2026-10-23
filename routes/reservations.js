// routes/reservations.js
const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');
const email = require('../email');

function validateReservation(data) {
  const errors = [];
  if (typeof data.first_name !== 'string' || !data.first_name.trim()) errors.push('First name is required');
  if (typeof data.last_name !== 'string' || !data.last_name.trim()) errors.push('Last name is required');
  if (typeof data.email !== 'string' || !data.email.trim()) errors.push('Email is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) errors.push('Valid email is required');
  const dateValid = typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.date)
    && Number.isFinite(Date.parse(data.date)) && new Date(data.date).toISOString().slice(0, 10) === data.date;
  if (!dateValid) errors.push('A valid reservation date is required');
  if (typeof data.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) errors.push('A valid reservation time is required');
  const guests = typeof data.guests === 'number' || typeof data.guests === 'string' ? Number(data.guests) : NaN;
  if (!Number.isInteger(guests) || guests < 1 || guests > 20) errors.push('Guests must be a whole number between 1 and 20');
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (dateValid && data.date < today) errors.push('Reservation date must not be in the past');
  for (const field of ['phone', 'notes', 'experience']) {
    if (data[field] != null && typeof data[field] !== 'string') errors.push(`${field} must be text`);
  }
  return errors;
}

// Public — create reservation
router.post('/', async (req, res) => {
  const db = getDb();
  const data = req.body;
  const errors = validateReservation(data);
  if (errors.length) return res.status(400).json({ errors });

  const id = uuidv4();
  const reservation = {
    id,
    first_name: data.first_name.trim(),
    last_name:  data.last_name.trim(),
    email:      data.email.trim().toLowerCase(),
    phone:      data.phone?.trim() || null,
    date:       data.date,
    time:       data.time,
    guests:     parseInt(data.guests),
    experience: data.experience || 'a-la-carte',
    notes:      data.notes?.trim() || null,
    status:     'pending',
  };

  db.prepare(`INSERT INTO reservations (id,first_name,last_name,email,phone,date,time,guests,experience,notes,status)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, reservation.first_name, reservation.last_name, reservation.email,
         reservation.phone, reservation.date, reservation.time, reservation.guests,
         reservation.experience, reservation.notes, reservation.status);

  Promise.all([
    email.sendReservationConfirmation(reservation).catch(console.error),
    email.sendReservationAdminAlert(reservation).catch(console.error),
  ]);

  res.status(201).json({ message: 'Reservation received!', reservation_id: id });
});

// Admin — list
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { status, date } = req.query;
  let sql = 'SELECT * FROM reservations WHERE 1=1';
  const params = [];
  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (date)   { sql += ' AND date = ?';   params.push(date); }
  sql += ' ORDER BY date ASC, time ASC';
  const reservations = db.prepare(sql).all(...params);
  res.json({ total: reservations.length, reservations });
});

// Admin — stats
router.get('/stats/summary', requireAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  res.json({
    total:     db.prepare('SELECT COUNT(*) as c FROM reservations').get().c,
    pending:   db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status='pending'").get().c,
    confirmed: db.prepare("SELECT COUNT(*) as c FROM reservations WHERE status='confirmed'").get().c,
    today:     db.prepare('SELECT COUNT(*) as c FROM reservations WHERE date=?').get(today).c,
    upcoming:  db.prepare("SELECT COUNT(*) as c FROM reservations WHERE date >= ? AND status NOT IN ('cancelled','completed')").get(today).c,
  });
});

// Admin — single
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Reservation not found' });
  res.json(row);
});

// Admin — update status
router.patch('/:id/status', requireAuth, async (req, res) => {
  const db = getDb();
  const { status } = req.body;
  const valid = ['pending','confirmed','cancelled','completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const row = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Reservation not found' });

  db.prepare("UPDATE reservations SET status = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, req.params.id);

  const updated = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.params.id);
  if (['confirmed','cancelled'].includes(status)) email.sendStatusUpdate(updated).catch(console.error);
  res.json({ message: `Status updated to ${status}`, reservation: updated });
});

// Admin — delete
router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare('SELECT id FROM reservations WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Reservation not found' });
  db.prepare('DELETE FROM reservations WHERE id = ?').run(req.params.id);
  res.json({ message: 'Reservation deleted' });
});

module.exports = router;
