// db.js — SQLite via sql.js (pure JS, no build tools needed on Windows)
const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DB_PATH = path.join(__dirname, 'data', 'project_restaurant.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const initSqlJs = require('sql.js');

let _wrapper = null;
let _rawDb   = null;

function persist() {
  if (!_rawDb) return;
  const data = _rawDb.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

let dirty = false;
setInterval(() => { if (dirty) { persist(); dirty = false; } }, 5000);
process.on('exit',   () => persist());
process.on('SIGINT', () => { persist(); process.exit(); });

function makeWrapper(rawDb) {
  function exec(sql) {
    rawDb.run(sql);
    dirty = true;
  }

  function prepare(sql) {
    return {
      run(...params) {
        const p = (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0]))
          ? params[0] : params;
        rawDb.run(sql, p);
        dirty = true;
        const r = rawDb.exec('SELECT last_insert_rowid() as id');
        return { lastInsertRowid: r[0]?.values[0][0] ?? null };
      },
      get(...params) {
        const p = (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0]))
          ? params[0] : params;
        const stmt = rawDb.prepare(sql);
        stmt.bind(p);
        const row = stmt.step() ? stmt.getAsObject() : undefined;
        stmt.free();
        return row;
      },
      all(...params) {
        const p = (params.length === 1 && params[0] !== null && typeof params[0] === 'object' && !Array.isArray(params[0]))
          ? params[0] : params;
        const results = [];
        const stmt = rawDb.prepare(sql);
        stmt.bind(p);
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
      },
    };
  }

  function transaction(fn) {
    return (arg) => {
      rawDb.run('BEGIN');
      try { fn(arg); rawDb.run('COMMIT'); dirty = true; }
      catch(e) { rawDb.run('ROLLBACK'); throw e; }
    };
  }

  function pragma(str) {
    try { rawDb.run('PRAGMA ' + str); } catch(e) {}
  }

  return { exec, prepare, transaction, pragma };
}

async function init() {
  const SQL = await initSqlJs();
  const existing = fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH) : null;
  _rawDb   = existing ? new SQL.Database(existing) : new SQL.Database();
  _wrapper = makeWrapper(_rawDb);

  _wrapper.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      guests INTEGER NOT NULL,
      experience TEXT NOT NULL DEFAULT 'a-la-carte',
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'JPY',
      emoji TEXT DEFAULT '🍽',
      available INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT,
      body TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const adminExists = _wrapper.prepare('SELECT id FROM admins WHERE email = ?')
    .get(process.env.ADMIN_EMAIL || 'admin@projectrestaurant.local');
  if (!adminExists) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'ProjectRestaurantAdmin2024!', 12);
    _wrapper.prepare('INSERT INTO admins (email, password, name) VALUES (?, ?, ?)')
      .run(process.env.ADMIN_EMAIL || 'admin@projectrestaurant.local', hash, 'Head Admin');
    console.log('Admin account seeded');
  }

  const menuCount = _wrapper.prepare('SELECT COUNT(*) as c FROM menu_items').get();
  if (!menuCount || !menuCount.c || menuCount.c === 0) {
    const items = [
      ['Omakase',    "Chef's Tasting Menu",    'Twelve courses curated daily by Chef Kenji.',              18500, 'JPY', '🌿', 1],
      ['Signature',  'Bluefin Nigiri Set',     'Hand-pressed shari with aged akami, chutoro, and otoro.', 4200,  'JPY', '🍣', 2],
      ['Beverage',   'Tea Ceremony Pairing',   'A curated flight of matcha, gyokuro, and hojicha.',       2800,  'JPY', '🍵', 3],
      ['A La Carte', 'Wagyu Tataki',           'Lightly seared A5 Wagyu with ponzu, micro-shiso.',        5600,  'JPY', '🥢', 4],
      ['Dessert',    'Sakura Mochi Souffle',   'Warm souffle infused with preserved cherry blossom.',     1900,  'JPY', '🌸', 5],
      ['Sake',       'Junmai Daiginjo Flight', 'Three premium unfiltered sakes by our sommelier.',        3400,  'JPY', '🍶', 6],
    ];
    items.forEach(i => {
      _wrapper.prepare('INSERT INTO menu_items (category,name,description,price,currency,emoji,sort_order) VALUES (?,?,?,?,?,?,?)')
        .run(i[0], i[1], i[2], i[3], i[4], i[5], i[6]);
    });
    console.log('Menu seeded');
  }

  persist();
  return _wrapper;
}

module.exports = { init, getDb: () => _wrapper };
