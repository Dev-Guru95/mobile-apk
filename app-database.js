// Client-side SQLite Database Module for BITTRIXPAY
// Uses sql.js to run SQLite in the browser

let db = null;
let SQL = null;
let _sqlLoadPromise = null;
const DB_KEY = 'bittrixpay_db';
let _saveTimeout = null;
const SAVE_DEBOUNCE_MS = 500;
let _pinAttempts = 0;
const MAX_PIN_ATTEMPTS = 5;
let _pinLockoutUntil = 0;

// Load sql.js locally (bundled with the app)
async function loadSqlJs() {
  if (SQL) return SQL;
  if (_sqlLoadPromise) return _sqlLoadPromise;

  _sqlLoadPromise = new Promise((resolve, reject) => {
    // Check if already loaded globally
    if (typeof initSqlJs === 'function') {
      initSqlJs({ locateFile: file => file })
        .then(sql => { SQL = sql; resolve(SQL); })
        .catch(err => { _sqlLoadPromise = null; reject(err); });
      return;
    }

    const script = document.createElement('script');
    script.src = 'sql-wasm.js';
    script.onload = async () => {
      try {
        SQL = await initSqlJs({ locateFile: file => file });
        resolve(SQL);
      } catch (err) {
        _sqlLoadPromise = null;
        reject(err);
      }
    };
    script.onerror = () => {
      _sqlLoadPromise = null;
      reject(new Error('Failed to load SQL.js library'));
    };
    document.head.appendChild(script);
  });

  return _sqlLoadPromise;
}

// Initialize database
let _dbInitPromise = null;
async function initDatabase() {
  if (db) return db;
  if (_dbInitPromise) return _dbInitPromise;

  _dbInitPromise = _doInitDatabase().catch(err => {
    _dbInitPromise = null;
    throw err;
  });
  return _dbInitPromise;
}

async function _doInitDatabase() {
  await loadSqlJs();

  // Try to load existing database from localStorage
  const savedDb = localStorage.getItem(DB_KEY);
  if (savedDb) {
    try {
      const uint8Array = new Uint8Array(JSON.parse(savedDb));
      db = new SQL.Database(uint8Array);
    } catch (e) {
      console.warn('Corrupted database, creating new one');
      db = new SQL.Database();
      createTables();
      insertSampleData();
      return db;
    }
    // Migrate: add description column to social_accounts if missing
    try {
      const tableInfo = db.exec("PRAGMA table_info(social_accounts)");
      if (tableInfo.length > 0) {
        const columns = tableInfo[0].values.map(row => row[1]);
        if (!columns.includes('description')) {
          db.run("ALTER TABLE social_accounts ADD COLUMN description TEXT");
          saveDatabase();
        }
      }
    } catch (e) {
      // Migration error - non-critical, log and continue
      console.warn('Migration check:', e.message);
    }
  } else {
    db = new SQL.Database();
    createTables();
    insertSampleData();
  }

  return db;
}

// Debounced save - prevents excessive localStorage writes
function saveDatabase() {
  if (!db) return;
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(_doSave, SAVE_DEBOUNCE_MS);
}

// Immediate save for critical operations
function saveDatabaseNow() {
  if (!db) return;
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _doSave();
}

function _doSave() {
  try {
    const data = db.export();
    const arr = Array.from(data);
    const json = JSON.stringify(arr);
    // Check localStorage capacity before writing
    if (json.length > 4 * 1024 * 1024) {
      console.warn('Database approaching localStorage limit');
    }
    localStorage.setItem(DB_KEY, json);
  } catch (e) {
    console.error('Failed to save database:', e.message);
  }
}

// Create tables
function createTables() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fullname TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      balance REAL DEFAULT 0,
      kyc_status TEXT DEFAULT 'pending',
      nin TEXT,
      bvn TEXT,
      transaction_pin TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Index for fast transaction lookups
  db.run(`CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id, created_at DESC)`);

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
      followers INTEGER DEFAULT 0,
      price REAL NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'available'
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS social_purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS virtual_numbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      country TEXT NOT NULL,
      country_code TEXT NOT NULL,
      number_type TEXT NOT NULL,
      duration TEXT NOT NULL,
      price REAL NOT NULL,
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  saveDatabaseNow();
}

// Insert sample data using batch insert
function insertSampleData() {
  const socialAccounts = [
    ['Instagram', 'Personal', 5000, 15000, 'Active personal account with good engagement'],
    ['Instagram', 'Business', 10000, 25000, 'Verified business account, fashion niche'],
    ['Instagram', 'Personal', 50000, 75000, 'High engagement account, lifestyle niche'],
    ['Twitter', 'Personal', 2000, 8000, 'Active account with good engagement history'],
    ['Twitter', 'Business', 15000, 35000, 'Business account with tech audience'],
    ['TikTok', 'Personal', 10000, 20000, 'Growing account with consistent views'],
    ['TikTok', 'Business', 100000, 150000, 'Monetized account with viral content history'],
    ['Facebook', 'Page', 5000, 12000, 'Business page with active community'],
    ['YouTube', 'Channel', 1000, 50000, 'Partner program eligible, tech reviews'],
  ];

  socialAccounts.forEach(([platform, type, followers, price, description]) => {
    db.run('INSERT INTO social_accounts (platform, account_type, followers, price, description) VALUES (?, ?, ?, ?, ?)',
      [platform, type, followers, price, description]);
  });

  const virtualNumbers = [
    ['USA', '+1', 'SMS Verification', '20 minutes', 500],
    ['USA', '+1', 'Full Number', '30 days', 5000],
    ['UK', '+44', 'SMS Verification', '20 minutes', 600],
    ['UK', '+44', 'Full Number', '30 days', 5500],
    ['Canada', '+1', 'SMS Verification', '20 minutes', 550],
    ['Germany', '+49', 'SMS Verification', '20 minutes', 700],
    ['Nigeria', '+234', 'SMS Verification', '20 minutes', 300],
    ['Nigeria', '+234', 'Full Number', '30 days', 3000],
  ];

  virtualNumbers.forEach(([country, code, type, duration, price]) => {
    db.run('INSERT INTO virtual_numbers (country, country_code, number_type, duration, price) VALUES (?, ?, ?, ?, ?)',
      [country, code, type, duration, price]);
  });

  saveDatabaseNow();
}

// SHA-256 hash helper (works in all WebView contexts)
async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  // Try crypto.subtle first (requires secure context)
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fall through to software fallback
    }
  }
  // Software SHA-256 fallback (deterministic, no crypto.subtle needed)
  return softSha256(str);
}

// Minimal software SHA-256 implementation for fallback
function softSha256(str) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  function rr(n,x){return(x>>>n)|(x<<(32-n));}
  function ch(x,y,z){return(x&y)^(~x&z);}
  function maj(x,y,z){return(x&y)^(x&z)^(y&z);}
  function s0(x){return rr(2,x)^rr(13,x)^rr(22,x);}
  function s1(x){return rr(6,x)^rr(11,x)^rr(25,x);}
  function g0(x){return rr(7,x)^rr(18,x)^(x>>>3);}
  function g1(x){return rr(17,x)^rr(19,x)^(x>>>10);}

  // Convert string to UTF-8 bytes
  const msg = [];
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 128) msg.push(c);
    else if (c < 2048) { msg.push(192|(c>>6)); msg.push(128|(c&63)); }
    else { msg.push(224|(c>>12)); msg.push(128|((c>>6)&63)); msg.push(128|(c&63)); }
  }

  // SHA-256 padding: append 1 bit, zeros, then 64-bit big-endian length
  const bitLen = msg.length * 8;
  msg.push(0x80);
  while (msg.length % 64 !== 56) msg.push(0);
  // 64-bit big-endian length (high 32 bits are 0 for strings < 512MB)
  msg.push(0, 0, 0, 0);
  msg.push((bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);

  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];

  for (let off = 0; off < msg.length; off += 64) {
    const W = [];
    for (let i = 0; i < 16; i++) W[i] = (msg[off+i*4]<<24)|(msg[off+i*4+1]<<16)|(msg[off+i*4+2]<<8)|msg[off+i*4+3];
    for (let i = 16; i < 64; i++) W[i] = (g1(W[i-2]) + W[i-7] + g0(W[i-15]) + W[i-16]) | 0;

    let [a,b,c,d,e,f,g,h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + s1(e) + ch(e,f,g) + K[i] + W[i]) | 0;
      const t2 = (s0(a) + maj(a,b,c)) | 0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    H = [H[0]+a|0, H[1]+b|0, H[2]+c|0, H[3]+d|0, H[4]+e|0, H[5]+f|0, H[6]+g|0, H[7]+h|0];
  }

  return H.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// Password hashing with salt
async function hashPassword(password) {
  const salted = password + 'bittrixpay_salt_2024';
  return await sha256(salted);
}

async function verifyPassword(password, storedHash) {
  const hash = await hashPassword(password);
  return constantTimeEquals(hash, storedHash);
}

// Constant-time string comparison to prevent timing attacks
function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

// Hash PIN before storing
async function hashPin(pin) {
  return await sha256(pin + 'bittrixpay_pin_salt');
}

// Session management
function setCurrentUser(userId) {
  localStorage.setItem('currentUserId', userId);
  localStorage.setItem('sessionTimestamp', Date.now().toString());
}

function getCurrentUserId() {
  const userId = localStorage.getItem('currentUserId');
  const timestamp = parseInt(localStorage.getItem('sessionTimestamp') || '0');
  // Session expires after 24 hours
  if (userId && (Date.now() - timestamp) > 24 * 60 * 60 * 1000) {
    clearCurrentUser();
    return null;
  }
  return userId;
}

function clearCurrentUser() {
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('sessionTimestamp');
}

function isAuthenticated() {
  return !!getCurrentUserId();
}

// ============ INPUT VALIDATION ============

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email) && email.length <= 255;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^[\d+\-() ]{7,20}$/.test(phone);
}

function validatePassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 128;
}

function validateAmount(amount) {
  return typeof amount === 'number' && isFinite(amount) && amount > 0 && amount <= 100000000;
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().substring(0, 500);
}

// ============ AUTH FUNCTIONS ============

async function register(fullname, email, phone, password) {
  await initDatabase();

  fullname = sanitizeString(fullname);
  email = sanitizeString(email).toLowerCase();
  phone = sanitizeString(phone);

  if (!fullname || fullname.length < 2) throw new Error('Full name is required (min 2 characters)');
  if (!validateEmail(email)) throw new Error('Please enter a valid email address');
  if (!validatePhone(phone)) throw new Error('Please enter a valid phone number');
  if (!validatePassword(password)) throw new Error('Password must be 6-128 characters');

  // Check if user exists
  const existing = db.exec('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    throw new Error('Email already registered');
  }

  const hashedPassword = await hashPassword(password);

  db.run('INSERT INTO users (fullname, email, phone, password) VALUES (?, ?, ?, ?)',
    [fullname, email, phone, hashedPassword]);

  const result = db.exec('SELECT last_insert_rowid() as id');
  const userId = (result.length > 0 && result[0].values.length > 0) ? result[0].values[0][0] : null;
  if (!userId) throw new Error('Registration failed - could not create user');

  saveDatabaseNow();
  setCurrentUser(userId);

  return { success: true, userId };
}

async function login(email, password) {
  await initDatabase();

  email = sanitizeString(email).toLowerCase();
  if (!validateEmail(email)) throw new Error('Invalid email or password');
  if (!password) throw new Error('Invalid email or password');

  const result = db.exec('SELECT * FROM users WHERE email = ?', [email]);

  if (result.length === 0 || result[0].values.length === 0) {
    // Prevent timing attacks - still hash even when user not found
    await hashPassword(password);
    throw new Error('Invalid email or password');
  }

  const user = rowToObject(result[0]);
  const validPassword = await verifyPassword(password, user.password);

  if (!validPassword) {
    throw new Error('Invalid email or password');
  }

  setCurrentUser(user.id);
  return { success: true, user };
}

function logout() {
  clearCurrentUser();
  return { success: true };
}

function getAuthStatus() {
  const userId = getCurrentUserId();
  if (!userId) {
    return { authenticated: false };
  }

  const result = db.exec('SELECT id, fullname, email, phone, balance, kyc_status, created_at FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    clearCurrentUser();
    return { authenticated: false };
  }

  return { authenticated: true, user: rowToObject(result[0]) };
}

// ============ USER FUNCTIONS ============

function getUserProfile() {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = db.exec('SELECT id, fullname, email, phone, balance, kyc_status, created_at FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    clearCurrentUser();
    throw new Error('User not found');
  }
  return rowToObject(result[0]);
}

function getUserTransactions(limit = 50, offset = 0) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  limit = Math.min(Math.max(1, parseInt(limit) || 50), 200);
  offset = Math.max(0, parseInt(offset) || 0);

  const result = db.exec('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', [userId, limit, offset]);
  return rowsToArray(result[0]);
}

function fundAccount(amount) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(amount)) throw new Error('Invalid amount');

  const user = getUserProfile();
  if (user.kyc_status !== 'verified') {
    throw new Error('Please complete KYC verification before funding your wallet');
  }

  // Atomic-like: run both in sequence, save once
  db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [amount, userId]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'credit', 'deposit', 'Account funding', amount]);

  saveDatabaseNow();
  return { success: true, message: `Successfully added ₦${amount.toLocaleString()} to your account` };
}

function withdrawFunds(amount, bankName, accountNumber) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(amount)) throw new Error('Invalid amount');

  const user = getUserProfile();
  if (user.kyc_status !== 'verified') {
    throw new Error('Please complete KYC verification before withdrawing');
  }

  if (user.balance < amount) {
    throw new Error('Insufficient funds');
  }

  if (amount < 1000) {
    throw new Error('Minimum withdrawal amount is ₦1,000');
  }

  bankName = sanitizeString(bankName);
  accountNumber = sanitizeString(accountNumber);

  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'debit', 'withdrawal', `Withdrawal to ${bankName} - ${accountNumber}`, amount]);

  saveDatabaseNow();
  return { success: true, message: `Successfully withdrawn ₦${amount.toLocaleString()} to your bank account` };
}

// ============ KYC FUNCTIONS ============

function getKycStatus() {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = db.exec('SELECT kyc_status, nin, bvn FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    return { status: 'pending', hasNin: false, hasBvn: false };
  }
  const user = rowToObject(result[0]);

  return {
    status: user.kyc_status,
    hasNin: !!user.nin,
    hasBvn: !!user.bvn
  };
}

function submitKyc(nin, bvn) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const user = getUserProfile();
  if (user.kyc_status === 'verified') {
    throw new Error('KYC already completed');
  }

  nin = sanitizeString(nin);
  bvn = sanitizeString(bvn);

  if (!nin || nin.length !== 11 || !/^\d{11}$/.test(nin)) {
    throw new Error('Invalid NIN. Must be exactly 11 digits');
  }

  if (!bvn || bvn.length !== 11 || !/^\d{11}$/.test(bvn)) {
    throw new Error('Invalid BVN. Must be exactly 11 digits');
  }

  db.run('UPDATE users SET nin = ?, bvn = ?, kyc_status = ? WHERE id = ?', [nin, bvn, 'pending_pin', userId]);
  saveDatabaseNow();

  return { success: true, message: 'KYC information submitted. Please set your transaction PIN.' };
}

async function setTransactionPin(pin) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('Invalid PIN. Must be exactly 4 digits');
  }

  // Reject weak PINs
  const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '0123', '3210'];
  if (weakPins.includes(pin)) {
    throw new Error('PIN is too simple. Please choose a stronger PIN');
  }

  const hashedPin = await hashPin(pin);
  db.run('UPDATE users SET transaction_pin = ?, kyc_status = ? WHERE id = ?', [hashedPin, 'verified', userId]);
  saveDatabaseNow();

  return { success: true, message: 'Transaction PIN set successfully. KYC completed!' };
}

async function verifyPin(pin) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  // Rate limit PIN attempts
  if (Date.now() < _pinLockoutUntil) {
    const remaining = Math.ceil((_pinLockoutUntil - Date.now()) / 1000);
    throw new Error(`Too many attempts. Please wait ${remaining} seconds`);
  }

  const result = db.exec('SELECT transaction_pin, kyc_status FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error('User not found');
  }
  const user = rowToObject(result[0]);

  if (!user || !user.transaction_pin || user.kyc_status !== 'verified') {
    throw new Error('Please complete KYC verification first');
  }

  const hashedPin = await hashPin(pin);
  let pinMatch = constantTimeEquals(user.transaction_pin, hashedPin);

  // Fallback: check if stored PIN is legacy plaintext (4 digits)
  if (!pinMatch && user.transaction_pin.length === 4 && /^\d{4}$/.test(user.transaction_pin)) {
    pinMatch = user.transaction_pin === pin;
    if (pinMatch) {
      // Auto-migrate to hashed PIN
      db.run('UPDATE users SET transaction_pin = ? WHERE id = ?', [hashedPin, userId]);
      saveDatabaseNow();
    }
  }

  if (!pinMatch) {
    _pinAttempts++;
    if (_pinAttempts >= MAX_PIN_ATTEMPTS) {
      _pinLockoutUntil = Date.now() + 60000; // Lock for 60 seconds
      _pinAttempts = 0;
      throw new Error('Too many incorrect attempts. Locked for 60 seconds');
    }
    throw new Error('Incorrect PIN');
  }

  _pinAttempts = 0;
  return { valid: true };
}

async function resetPin(currentPin, newPin) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = db.exec('SELECT transaction_pin, kyc_status FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) {
    throw new Error('User not found');
  }
  const user = rowToObject(result[0]);

  if (!user || !user.transaction_pin || user.kyc_status !== 'verified') {
    throw new Error('Please complete KYC verification first');
  }

  const currentHashed = await hashPin(currentPin);
  let currentMatch = constantTimeEquals(user.transaction_pin, currentHashed);

  // Legacy plaintext PIN check
  if (!currentMatch && user.transaction_pin.length === 4 && /^\d{4}$/.test(user.transaction_pin)) {
    currentMatch = user.transaction_pin === currentPin;
  }

  if (!currentMatch) {
    throw new Error('Current PIN is incorrect');
  }

  if (!newPin || newPin.length !== 4 || !/^\d{4}$/.test(newPin)) {
    throw new Error('New PIN must be exactly 4 digits');
  }

  const weakPins = ['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321'];
  if (weakPins.includes(newPin)) {
    throw new Error('PIN is too simple. Please choose a stronger PIN');
  }

  const newHashed = await hashPin(newPin);
  db.run('UPDATE users SET transaction_pin = ? WHERE id = ?', [newHashed, userId]);
  saveDatabaseNow();

  return { success: true, message: 'Transaction PIN updated successfully' };
}

// ============ CRYPTO FUNCTIONS ============

const EXCHANGE_RATE = 1580;

function getCryptoRates() {
  return [
    { symbol: 'BTC', name: 'Bitcoin', price: 67500, change: 2.5 },
    { symbol: 'ETH', name: 'Ethereum', price: 3450, change: 1.8 },
    { symbol: 'USDT', name: 'Tether', price: 1, change: 0.01 },
    { symbol: 'BNB', name: 'Binance Coin', price: 580, change: -0.5 },
    { symbol: 'SOL', name: 'Solana', price: 175, change: 4.2 },
    { symbol: 'XRP', name: 'Ripple', price: 0.52, change: 1.1 },
    { symbol: 'DOGE', name: 'Dogecoin', price: 0.12, change: -1.2 },
    { symbol: 'ADA', name: 'Cardano', price: 0.45, change: 0.8 },
    { symbol: 'LTC', name: 'Litecoin', price: 85, change: 1.5 },
    { symbol: 'LINK', name: 'Chainlink', price: 14.5, change: 2.1 },
  ];
}

function buyCrypto(symbol, name, amount, totalCost) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(amount)) throw new Error('Invalid amount');
  if (!validateAmount(totalCost)) throw new Error('Invalid total cost');

  symbol = sanitizeString(symbol).toUpperCase();
  name = sanitizeString(name);

  // Validate symbol against known rates
  const validSymbols = getCryptoRates().map(r => r.symbol);
  if (!validSymbols.includes(symbol)) throw new Error('Invalid cryptocurrency');

  // Re-read balance right before update to minimize race window
  const balResult = db.exec('SELECT balance FROM users WHERE id = ?', [userId]);
  if (balResult.length === 0 || balResult[0].values.length === 0) throw new Error('User not found');
  const currentBalance = balResult[0].values[0][0];
  if (currentBalance < totalCost) throw new Error('Insufficient balance');

  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [totalCost, userId]);

  // Use INSERT OR REPLACE pattern via upsert logic
  const existing = db.exec('SELECT id, amount FROM crypto_holdings WHERE user_id = ? AND crypto_symbol = ?', [userId, symbol]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    db.run('UPDATE crypto_holdings SET amount = amount + ? WHERE user_id = ? AND crypto_symbol = ?', [amount, userId, symbol]);
  } else {
    db.run('INSERT INTO crypto_holdings (user_id, crypto_name, crypto_symbol, amount) VALUES (?, ?, ?, ?)',
      [userId, name, symbol, amount]);
  }

  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'debit', 'crypto', `Bought ${amount} ${symbol}`, totalCost]);

  saveDatabaseNow();
  return { success: true, message: `Successfully bought ${amount} ${symbol}` };
}

function sellCrypto(symbol, amount, totalValue) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(amount)) throw new Error('Invalid amount');
  if (!validateAmount(totalValue)) throw new Error('Invalid total value');

  symbol = sanitizeString(symbol).toUpperCase();

  const holding = db.exec('SELECT amount FROM crypto_holdings WHERE user_id = ? AND crypto_symbol = ?', [userId, symbol]);
  if (holding.length === 0 || holding[0].values.length === 0) {
    throw new Error('Insufficient crypto balance');
  }

  const holdingAmount = holding[0].values[0][0];
  if (holdingAmount < amount) {
    throw new Error('Insufficient crypto balance');
  }

  db.run('UPDATE crypto_holdings SET amount = amount - ? WHERE user_id = ? AND crypto_symbol = ?', [amount, userId, symbol]);
  db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [totalValue, userId]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'credit', 'crypto', `Sold ${amount} ${symbol}`, totalValue]);

  saveDatabaseNow();
  return { success: true, message: `Successfully sold ${amount} ${symbol}` };
}

function getCryptoHoldings() {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = db.exec('SELECT * FROM crypto_holdings WHERE user_id = ? AND amount > 0', [userId]);
  return rowsToArray(result[0]);
}

// ============ GIFT CARD FUNCTIONS ============

function getGiftCardRates() {
  return [
    { name: 'Amazon', buyRate: 1400, sellRate: 1350 },
    { name: 'iTunes', buyRate: 1350, sellRate: 1300 },
    { name: 'Google Play', buyRate: 1380, sellRate: 1320 },
    { name: 'Steam', buyRate: 1320, sellRate: 1280 },
    { name: 'eBay', buyRate: 1300, sellRate: 1250 },
    { name: 'Walmart', buyRate: 1280, sellRate: 1230 },
    { name: 'Nike', buyRate: 1260, sellRate: 1210 },
    { name: 'Netflix', buyRate: 1400, sellRate: 1350 },
    { name: 'Spotify', buyRate: 1370, sellRate: 1320 },
    { name: 'Xbox', buyRate: 1340, sellRate: 1290 },
    { name: 'PlayStation', buyRate: 1350, sellRate: 1300 },
    { name: 'Sephora', buyRate: 1290, sellRate: 1240 },
  ];
}

function tradeGiftCard(cardType, cardValue, tradeType, rate) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(cardValue)) throw new Error('Invalid card value');
  if (!validateAmount(rate)) throw new Error('Invalid rate');

  cardType = sanitizeString(cardType);
  tradeType = sanitizeString(tradeType);

  // Validate trade type
  if (tradeType !== 'buy' && tradeType !== 'sell') throw new Error('Invalid trade type');

  // Validate card type exists
  const validCards = getGiftCardRates().map(c => c.name);
  if (!validCards.includes(cardType)) throw new Error('Invalid gift card type');

  const nairaValue = cardValue * rate;
  if (!validateAmount(nairaValue)) throw new Error('Invalid transaction value');

  if (tradeType === 'buy') {
    const balResult = db.exec('SELECT balance FROM users WHERE id = ?', [userId]);
    const balance = balResult[0]?.values[0]?.[0] || 0;
    if (balance < nairaValue) throw new Error('Insufficient balance');

    db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [nairaValue, userId]);
    db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
      [userId, 'debit', 'giftcard', `Bought $${cardValue} ${cardType} gift card`, nairaValue]);
  } else {
    db.run('UPDATE users SET balance = balance + ? WHERE id = ?', [nairaValue, userId]);
    db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
      [userId, 'credit', 'giftcard', `Sold $${cardValue} ${cardType} gift card`, nairaValue]);
  }

  db.run('INSERT INTO giftcard_trades (user_id, card_type, card_value, naira_value, trade_type) VALUES (?, ?, ?, ?, ?)',
    [userId, cardType, cardValue, nairaValue, tradeType]);

  saveDatabaseNow();
  return { success: true, message: `Successfully ${tradeType === 'buy' ? 'bought' : 'sold'} ${cardType} gift card` };
}

// ============ BILL PAYMENT FUNCTIONS ============

function getBillProviders() {
  return {
    electricity: [
      { id: 'eko', name: 'Eko Electricity (EKEDC)', minAmount: 1000 },
      { id: 'ikeja', name: 'Ikeja Electricity (IKEDC)', minAmount: 1000 },
      { id: 'abuja', name: 'Abuja Electricity (AEDC)', minAmount: 1000 },
      { id: 'ibadan', name: 'Ibadan Electricity (IBEDC)', minAmount: 1000 },
      { id: 'ph', name: 'Port Harcourt Electricity (PHED)', minAmount: 1000 },
    ],
    airtime: [
      { id: 'mtn', name: 'MTN', minAmount: 50 },
      { id: 'airtel', name: 'Airtel', minAmount: 50 },
      { id: 'glo', name: 'Glo', minAmount: 50 },
      { id: '9mobile', name: '9Mobile', minAmount: 50 },
    ],
    data: [
      { id: 'mtn', name: 'MTN Data', plans: [
        { id: '500mb', name: '500MB - 30 Days', price: 500 },
        { id: '1gb', name: '1GB - 30 Days', price: 1000 },
        { id: '2gb', name: '2GB - 30 Days', price: 2000 },
        { id: '5gb', name: '5GB - 30 Days', price: 3500 },
        { id: '10gb', name: '10GB - 30 Days', price: 5000 },
      ]},
      { id: 'airtel', name: 'Airtel Data', plans: [
        { id: '500mb', name: '500MB - 30 Days', price: 500 },
        { id: '1gb', name: '1GB - 30 Days', price: 1000 },
        { id: '2gb', name: '2GB - 30 Days', price: 2000 },
        { id: '5gb', name: '5GB - 30 Days', price: 3500 },
      ]},
      { id: 'glo', name: 'Glo Data', plans: [
        { id: '1gb', name: '1GB - 30 Days', price: 800 },
        { id: '2gb', name: '2GB - 30 Days', price: 1500 },
        { id: '5gb', name: '5GB - 30 Days', price: 3000 },
      ]},
    ],
    cable: [
      { id: 'dstv', name: 'DSTV', packages: [
        { id: 'padi', name: 'DStv Padi', price: 2500 },
        { id: 'yanga', name: 'DStv Yanga', price: 3500 },
        { id: 'confam', name: 'DStv Confam', price: 6200 },
        { id: 'compact', name: 'DStv Compact', price: 10500 },
        { id: 'compactplus', name: 'DStv Compact Plus', price: 16600 },
        { id: 'premium', name: 'DStv Premium', price: 24500 },
      ]},
      { id: 'gotv', name: 'GOtv', packages: [
        { id: 'smallie', name: 'GOtv Smallie', price: 1100 },
        { id: 'jinja', name: 'GOtv Jinja', price: 2250 },
        { id: 'jolli', name: 'GOtv Jolli', price: 3300 },
        { id: 'max', name: 'GOtv Max', price: 5100 },
      ]},
      { id: 'startimes', name: 'StarTimes', packages: [
        { id: 'nova', name: 'StarTimes Nova', price: 1200 },
        { id: 'basic', name: 'StarTimes Basic', price: 1850 },
        { id: 'smart', name: 'StarTimes Smart', price: 2600 },
        { id: 'classic', name: 'StarTimes Classic', price: 2750 },
      ]},
    ],
  };
}

function payBill(billType, provider, accountNumber, amount) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');
  if (!validateAmount(amount)) throw new Error('Invalid amount');

  billType = sanitizeString(billType);
  provider = sanitizeString(provider);
  accountNumber = sanitizeString(accountNumber);

  if (!billType || !provider || !accountNumber) throw new Error('All fields are required');
  if (!['airtime', 'data', 'electricity', 'cable'].includes(billType)) throw new Error('Invalid bill type');

  // Re-read balance to minimize race window
  const balResult = db.exec('SELECT balance FROM users WHERE id = ?', [userId]);
  const balance = balResult[0]?.values[0]?.[0] || 0;
  if (balance < amount) throw new Error('Insufficient balance');

  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);
  db.run('INSERT INTO bill_payments (user_id, bill_type, provider, account_number, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, billType, provider, accountNumber, amount]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'debit', 'bills', `${billType} payment - ${provider}`, amount]);

  saveDatabaseNow();
  return { success: true, message: `${billType} payment successful` };
}

// ============ SOCIAL ACCOUNTS FUNCTIONS ============

function getSocialAccounts() {
  const result = db.exec("SELECT * FROM social_accounts WHERE status = 'available' ORDER BY platform, followers DESC LIMIT 50");
  return rowsToArray(result[0]);
}

function purchaseSocialAccount(accountId) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  accountId = parseInt(accountId);
  if (!accountId || accountId <= 0) throw new Error('Invalid account ID');

  const accountResult = db.exec("SELECT * FROM social_accounts WHERE id = ? AND status = 'available'", [accountId]);
  if (accountResult.length === 0 || accountResult[0].values.length === 0) {
    throw new Error('Account no longer available');
  }

  const account = rowToObject(accountResult[0]);

  // Re-read balance
  const balResult = db.exec('SELECT balance FROM users WHERE id = ?', [userId]);
  const balance = balResult[0]?.values[0]?.[0] || 0;
  if (balance < account.price) throw new Error('Insufficient balance');

  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [account.price, userId]);
  db.run("UPDATE social_accounts SET status = 'sold' WHERE id = ?", [accountId]);
  db.run('INSERT INTO social_purchases (user_id, account_id, price) VALUES (?, ?, ?)', [userId, accountId, account.price]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'debit', 'social', `Purchased ${account.platform} account (${account.followers} followers)`, account.price]);

  saveDatabaseNow();

  // Generate credentials
  let hex;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    hex = Array.from(arr).map(b => b.toString(36)).join('');
  } else {
    hex = Date.now().toString(36) + Math.random().toString(36).substr(2, 20);
  }

  return {
    success: true,
    message: `Successfully purchased ${account.platform} account`,
    credentials: {
      platform: account.platform,
      username: `user_${hex.substring(0, 8)}`,
      password: hex.substring(8, 20),
      email: `${hex.substring(20, 26)}@email.com`
    }
  };
}

// ============ VIRTUAL NUMBERS FUNCTIONS ============

function getVirtualNumbers() {
  const result = db.exec("SELECT * FROM virtual_numbers WHERE status = 'available' ORDER BY country, price LIMIT 50");
  return rowsToArray(result[0]);
}

function purchaseVirtualNumber(numberId) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  numberId = parseInt(numberId);
  if (!numberId || numberId <= 0) throw new Error('Invalid number ID');

  const numberResult = db.exec('SELECT * FROM virtual_numbers WHERE id = ?', [numberId]);
  if (numberResult.length === 0 || numberResult[0].values.length === 0) {
    throw new Error('Number not available');
  }

  const number = rowToObject(numberResult[0]);

  // Re-read balance
  const balResult = db.exec('SELECT balance FROM users WHERE id = ?', [userId]);
  const balance = balResult[0]?.values[0]?.[0] || 0;
  if (balance < number.price) throw new Error('Insufficient balance');

  // Generate random phone number
  let randNum;
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const randomBytes = new Uint32Array(1);
    crypto.getRandomValues(randomBytes);
    randNum = 1000000000 + (randomBytes[0] % 9000000000);
  } else {
    randNum = Math.floor(Math.random() * 9000000000 + 1000000000);
  }
  const phoneNumber = number.country_code + randNum;

  let expiresAt;
  if (number.duration.includes('minutes')) {
    const minutes = parseInt(number.duration);
    expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  } else {
    const days = parseInt(number.duration);
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  db.run('UPDATE users SET balance = balance - ? WHERE id = ?', [number.price, userId]);
  db.run('INSERT INTO user_virtual_numbers (user_id, virtual_number_id, phone_number, expires_at) VALUES (?, ?, ?, ?)',
    [userId, numberId, phoneNumber, expiresAt]);
  db.run('INSERT INTO transactions (user_id, type, category, description, amount) VALUES (?, ?, ?, ?, ?)',
    [userId, 'debit', 'virtual_number', `${number.country} ${number.number_type} - ${number.duration}`, number.price]);

  saveDatabaseNow();

  return {
    success: true,
    message: 'Virtual number purchased successfully',
    number: {
      phoneNumber,
      country: number.country,
      type: number.number_type,
      expiresAt
    }
  };
}

function getUserVirtualNumbers() {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  const result = db.exec(`
    SELECT uvn.*, vn.country, vn.country_code, vn.number_type, vn.duration
    FROM user_virtual_numbers uvn
    JOIN virtual_numbers vn ON uvn.virtual_number_id = vn.id
    WHERE uvn.user_id = ?
    ORDER BY uvn.created_at DESC
    LIMIT 50
  `, [userId]);

  return rowsToArray(result[0]);
}

// ============ PASSWORD CHANGE ============

async function changePassword(currentPassword, newPassword) {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not authenticated');

  if (!validatePassword(newPassword)) throw new Error('New password must be 6-128 characters');

  const result = db.exec('SELECT password FROM users WHERE id = ?', [userId]);
  if (result.length === 0 || result[0].values.length === 0) throw new Error('User not found');
  const user = rowToObject(result[0]);

  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) throw new Error('Current password is incorrect');

  const newHash = await hashPassword(newPassword);
  db.run('UPDATE users SET password = ? WHERE id = ?', [newHash, userId]);
  saveDatabaseNow();

  return { success: true, message: 'Password updated successfully' };
}

// ============ HELPER FUNCTIONS ============

function rowToObject(result) {
  if (!result || !result.values || result.values.length === 0) return null;
  const obj = {};
  result.columns.forEach((col, i) => {
    obj[col] = result.values[0][i];
  });
  return obj;
}

function rowsToArray(result) {
  if (!result || !result.values) return [];
  return result.values.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

// Export functions
window.AppDB = {
  init: initDatabase,
  // Auth
  register,
  login,
  logout,
  getAuthStatus,
  isAuthenticated,
  // User
  getUserProfile,
  getUserTransactions,
  fundAccount,
  withdrawFunds,
  changePassword,
  // KYC
  getKycStatus,
  submitKyc,
  setTransactionPin,
  verifyPin,
  resetPin,
  // Crypto
  getCryptoRates,
  buyCrypto,
  sellCrypto,
  getCryptoHoldings,
  // Gift Cards
  getGiftCardRates,
  tradeGiftCard,
  // Bills
  getBillProviders,
  payBill,
  // Social
  getSocialAccounts,
  purchaseSocialAccount,
  // Virtual Numbers
  getVirtualNumbers,
  purchaseVirtualNumber,
  getUserVirtualNumbers,
  // Constants
  EXCHANGE_RATE
};
