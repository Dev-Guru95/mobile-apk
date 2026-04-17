const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bittrixpay.db');

let db = null;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT NOT NULL,
      password TEXT NOT NULL,
      balance REAL DEFAULT 0.00,
      kyc_status TEXT DEFAULT 'pending',
      nin TEXT,
      bvn TEXT,
      transaction_pin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Add missing columns to existing users table (for database migration)
  const addColumnIfNotExists = (table, column, definition) => {
    try {
      const tableInfo = db.exec(`PRAGMA table_info(${table})`);
      if (tableInfo.length > 0) {
        const columns = tableInfo[0].values.map(row => row[1]);
        if (!columns.includes(column)) {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        }
      }
    } catch (e) {
      // Column might already exist, ignore error
    }
  };

  addColumnIfNotExists('users', 'kyc_status', "TEXT DEFAULT 'pending'");
  addColumnIfNotExists('users', 'nin', 'TEXT');
  addColumnIfNotExists('users', 'bvn', 'TEXT');
  addColumnIfNotExists('users', 'transaction_pin', 'TEXT');

  // Update existing users with NULL kyc_status to 'pending'
  try {
    db.run("UPDATE users SET kyc_status = 'pending' WHERE kyc_status IS NULL");
  } catch (e) {
    // Ignore if update fails
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS crypto_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      crypto_name TEXT NOT NULL,
      crypto_symbol TEXT NOT NULL,
      amount REAL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS giftcard_trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_type TEXT NOT NULL,
      card_value REAL NOT NULL,
      naira_value REAL NOT NULL,
      trade_type TEXT NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS bill_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      bill_type TEXT NOT NULL,
      provider TEXT NOT NULL,
      account_number TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      account_type TEXT NOT NULL,
      followers INTEGER NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'available',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS social_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      price REAL NOT NULL,
      status TEXT DEFAULT 'completed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS virtual_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      number_type TEXT NOT NULL,
      price REAL NOT NULL,
      duration TEXT NOT NULL,
      status TEXT DEFAULT 'available'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_virtual_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      virtual_number_id INTEGER NOT NULL,
      phone_number TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed social media accounts if empty
  const socialCount = db.exec("SELECT COUNT(*) as count FROM social_accounts")[0];
  if (socialCount && socialCount.values[0][0] === 0) {
    const socialAccounts = [
      ['Instagram', 'Personal', 15000, 45000, 'Aged account with active engagement, lifestyle niche'],
      ['Instagram', 'Business', 50000, 150000, 'Verified business account, fashion niche'],
      ['Instagram', 'Creator', 100000, 350000, 'High engagement creator account, entertainment niche'],
      ['Twitter', 'Personal', 8000, 25000, 'Active account with good engagement history'],
      ['Twitter', 'Verified', 25000, 120000, 'Blue verified account, tech niche'],
      ['TikTok', 'Creator', 75000, 200000, 'Monetized account with viral content history'],
      ['TikTok', 'Personal', 20000, 55000, 'Growing account with consistent views'],
      ['Facebook', 'Page', 30000, 80000, 'Business page with active community'],
      ['YouTube', 'Channel', 10000, 250000, 'Monetized channel, gaming niche'],
      ['YouTube', 'Channel', 5000, 100000, 'Partner program eligible, tech reviews'],
      ['LinkedIn', 'Premium', 5000, 35000, 'Professional network, B2B connections'],
      ['Snapchat', 'Personal', 12000, 30000, 'Active account with good snap score'],
    ];

    socialAccounts.forEach(account => {
      db.run(
        `INSERT INTO social_accounts (platform, account_type, followers, price, description) VALUES (?, ?, ?, ?, ?)`,
        account
      );
    });
  }

  // Seed virtual numbers if empty
  const numbersCount = db.exec("SELECT COUNT(*) as count FROM virtual_numbers")[0];
  if (numbersCount && numbersCount.values[0][0] === 0) {
    const virtualNumbers = [
      ['United States', '+1', 'SMS Verification', 500, '20 minutes'],
      ['United States', '+1', 'Voice & SMS', 2500, '30 days'],
      ['United Kingdom', '+44', 'SMS Verification', 600, '20 minutes'],
      ['United Kingdom', '+44', 'Voice & SMS', 3000, '30 days'],
      ['Canada', '+1', 'SMS Verification', 550, '20 minutes'],
      ['Canada', '+1', 'Voice & SMS', 2800, '30 days'],
      ['Germany', '+49', 'SMS Verification', 650, '20 minutes'],
      ['Germany', '+49', 'Voice & SMS', 3200, '30 days'],
      ['France', '+33', 'SMS Verification', 600, '20 minutes'],
      ['Netherlands', '+31', 'SMS Verification', 700, '20 minutes'],
      ['Australia', '+61', 'SMS Verification', 750, '20 minutes'],
      ['Australia', '+61', 'Voice & SMS', 3500, '30 days'],
      ['India', '+91', 'SMS Verification', 300, '20 minutes'],
      ['Brazil', '+55', 'SMS Verification', 450, '20 minutes'],
      ['Russia', '+7', 'SMS Verification', 400, '20 minutes'],
      ['China', '+86', 'SMS Verification', 800, '20 minutes'],
      ['Japan', '+81', 'SMS Verification', 850, '20 minutes'],
      ['South Korea', '+82', 'SMS Verification', 800, '20 minutes'],
    ];

    virtualNumbers.forEach(number => {
      db.run(
        `INSERT INTO virtual_numbers (country, country_code, number_type, price, duration) VALUES (?, ?, ?, ?, ?)`,
        number
      );
    });
  }

  saveDatabase();
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

function getDb() {
  return db;
}

// Helper functions to mimic better-sqlite3 API
function prepare(sql) {
  return {
    run: (...params) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      stmt.step();
      stmt.free();
      saveDatabase();
      return { lastInsertRowid: getLastInsertId() };
    },
    get: (...params) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => row[col] = values[i]);
        stmt.free();
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      const stmt = db.prepare(sql);
      if (params.length > 0) stmt.bind(params);
      const rows = [];
      while (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => row[col] = values[i]);
        rows.push(row);
      }
      stmt.free();
      return rows;
    }
  };
}

function getLastInsertId() {
  const result = db.exec("SELECT last_insert_rowid() as id");
  return result[0]?.values[0][0] || 0;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveDatabase();
}

module.exports = {
  initDatabase,
  getDb,
  prepare,
  run,
  saveDatabase
};
