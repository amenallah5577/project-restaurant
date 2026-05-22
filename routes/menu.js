// routes/menu.js
const router = require('express').Router();
const { getDb } = require('../db');
const { requireAuth } = require('../middleware/auth');

// Public
router.get('/', (req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM menu_items WHERE available = 1 ORDER BY sort_order ASC').all();
  const grouped = items.reduce((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
  res.json({ items, grouped });
});

router.get('/admin/all', requireAuth, (req, res) => {
  const db = getDb();
  res.json({ items: db.prepare('SELECT * FROM menu_items ORDER BY sort_order ASC').all() });
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  res.json(item);
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { category, name, description, price, currency, emoji, available, sort_order } = req.body;
  if (!category || !name || price == null) return res.status(400).json({ error: 'category, name, price required' });
  const result = db.prepare('INSERT INTO menu_items (category,name,description,price,currency,emoji,available,sort_order) VALUES (?,?,?,?,?,?,?,?)')
    .run(category, name, description||null, parseFloat(price), currency||'JPY', emoji||'🍽', available!==false?1:0, parseInt(sort_order)||0);
  res.status(201).json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  const { category, name, description, price, currency, emoji, available, sort_order } = req.body;
  db.prepare("UPDATE menu_items SET category=?,name=?,description=?,price=?,currency=?,emoji=?,available=?,sort_order=?,updated_at=datetime('now') WHERE id=?")
    .run(category??item.category, name??item.name, description??item.description,
         price!=null?parseFloat(price):item.price, currency??item.currency, emoji??item.emoji,
         available!=null?(available?1:0):item.available, sort_order!=null?parseInt(sort_order):item.sort_order,
         req.params.id);
  res.json(db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id));
});

router.patch('/:id/toggle', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT * FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  db.prepare("UPDATE menu_items SET available=?,updated_at=datetime('now') WHERE id=?").run(item.available?0:1, req.params.id);
  res.json({ available: !item.available });
});

router.delete('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const item = db.prepare('SELECT id FROM menu_items WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Menu item not found' });
  db.prepare('DELETE FROM menu_items WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

module.exports = router;
