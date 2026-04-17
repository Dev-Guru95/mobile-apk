const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const path = require('path');
const { initDatabase, prepare, run, saveDatabase } = require('./database');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors({ origin: ['http://localhost:3000', 'capacitor://localhost', 'http://localhost'], credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'www')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'bittrixpay-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production', httpOnly: true, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 }
}));

// Simple in-memory rate limiter
const rateLimits = new Map();
function rateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimits.get(key);
  if (entry) {
    // Clean expired entries
    if (now - entry.start > windowMs) {
      rateLimits.set(key, { count: 1, start: now });
      return true;
    }
    if (entry.count >= maxAttempts) return false;
    entry.count++;
    return true;
  }
  rateLimits.set(key, { count: 1, start: now });
  return true;
}

// Clean rate limits periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (now - entry.start > 300000) rateLimits.delete(key);
  }
}, 60000);

// Auth middleware
const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// ============ AUTH ROUTES ============

// Register
app.post('/api/register', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimit(`register:${ip}`, 5, 3600000)) {
      return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
    }

    const { fullname, email, phone, password } = req.body;

    // Input validation
    if (!fullname || typeof fullname !== 'string' || fullname.trim().length < 2) {
      return res.status(400).json({ error: 'Full name is required (min 2 characters)' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user exists
    const existingUser = prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password with higher cost factor
    const hashedPassword = await bcrypt.hash(password, 12);

    // Insert user
    const result = prepare(`
      INSERT INTO users (fullname, email, phone, password)
      VALUES (?, ?, ?, ?)
    `).run(fullname.trim(), email.toLowerCase().trim(), (phone || '').trim(), hashedPassword);

    req.session.userId = result.lastInsertRowid;
    res.json({ success: true, message: 'Registration successful' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const ip = req.ip || req.connection.remoteAddress;
    if (!rateLimit(`login:${ip}`, 10, 900000)) {
      return res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes.' });
    }

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Regenerate session to prevent fixation
    const oldSession = req.session;
    req.session.regenerate((err) => {
      if (err) {
        return res.status(500).json({ error: 'Login failed' });
      }
      req.session.userId = user.id;
      res.json({ success: true, message: 'Login successful' });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Check auth status
app.get('/api/auth/status', (req, res) => {
  if (req.session.userId) {
    const user = prepare('SELECT id, fullname, email, phone, balance, kyc_status FROM users WHERE id = ?').get(req.session.userId);
    res.json({ authenticated: true, user });
  } else {
    res.json({ authenticated: false });
  }
});

// ============ USER ROUTES ============

// Get user profile
app.get('/api/user/profile', requireAuth, (req, res) => {
  const user = prepare('SELECT id, fullname, email, phone, balance, kyc_status, created_at FROM users WHERE id = ?').get(req.session.userId);
  res.json(user);
});

// ============ KYC ROUTES ============

// Get KYC status
app.get('/api/kyc/status', requireAuth, (req, res) => {
  const user = prepare('SELECT kyc_status, nin, bvn FROM users WHERE id = ?').get(req.session.userId);
  res.json({
    status: user.kyc_status,
    hasNin: !!user.nin,
    hasBvn: !!user.bvn
  });
});

// Submit KYC (NIN & BVN)
app.post('/api/kyc/submit', requireAuth, (req, res) => {
  try {
    const { nin, bvn } = req.body;

    // Check if already verified
    const user = prepare('SELECT kyc_status FROM users WHERE id = ?').get(req.session.userId);
    if (user.kyc_status === 'verified') {
      return res.status(400).json({ error: 'KYC already completed' });
    }

    // Validate NIN (11 digits)
    if (!nin || nin.length !== 11 || !/^\d+$/.test(nin)) {
      return res.status(400).json({ error: 'Invalid NIN. Must be 11 digits' });
    }

    // Validate BVN (11 digits)
    if (!bvn || bvn.length !== 11 || !/^\d+$/.test(bvn)) {
      return res.status(400).json({ error: 'Invalid BVN. Must be 11 digits' });
    }

    // Update user with KYC info
    prepare('UPDATE users SET nin = ?, bvn = ?, kyc_status = ? WHERE id = ?').run(nin, bvn, 'pending_pin', req.session.userId);

    res.json({ success: true, message: 'KYC information submitted. Please set your transaction PIN.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'KYC submission failed' });
  }
});

// Set transaction PIN
app.post('/api/kyc/set-pin', requireAuth, (req, res) => {
  try {
    const { pin } = req.body;

    // Validate PIN (4 digits)
    if (!pin || pin.length !== 4 || !/^\d+$/.test(pin)) {
      return res.status(400).json({ error: 'Invalid PIN. Must be 4 digits' });
    }

    // Update user with PIN and complete KYC
    prepare('UPDATE users SET transaction_pin = ?, kyc_status = ? WHERE id = ?').run(pin, 'verified', req.session.userId);

    res.json({ success: true, message: 'Transaction PIN set successfully. KYC completed!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to set PIN' });
  }
});

// Reset transaction PIN
app.post('/api/kyc/reset-pin', requireAuth, (req, res) => {
  try {
    const { currentPin, newPin } = req.body;

    const user = prepare('SELECT transaction_pin FROM users WHERE id = ?').get(req.session.userId);

    // Verify current PIN
    if (user.transaction_pin !== currentPin) {
      return res.status(400).json({ error: 'Current PIN is incorrect' });
    }

    // Validate new PIN
    if (!newPin || newPin.length !== 4 || !/^\d+$/.test(newPin)) {
      return res.status(400).json({ error: 'Invalid new PIN. Must be 4 digits' });
    }

    prepare('UPDATE users SET transaction_pin = ? WHERE id = ?').run(newPin, req.session.userId);

    res.json({ success: true, message: 'Transaction PIN updated successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to reset PIN' });
  }
});

// Verify transaction PIN
app.post('/api/verify-pin', requireAuth, (req, res) => {
  try {
    const { pin } = req.body;

    const user = prepare('SELECT transaction_pin, kyc_status FROM users WHERE id = ?').get(req.session.userId);

    // Check if user has completed KYC and has a PIN
    if (!user.transaction_pin || user.kyc_status !== 'verified') {
      return res.status(400).json({ error: 'Please complete KYC verification first', valid: false, requiresKyc: true });
    }

    if (user.transaction_pin !== pin) {
      return res.status(400).json({ error: 'Incorrect PIN', valid: false });
    }

    res.json({ valid: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'PIN verification failed', valid: false });
  }
});

// Get user transactions
app.get('/api/user/transactions', requireAuth, (req, res) => {
  const transactions = prepare(`
    SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.session.userId);
  res.json(transactions);
});

// ============ CRYPTO TRADING ROUTES ============

// Get crypto rates
app.get('/api/crypto/rates', (req, res) => {
  const rates = [
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
  res.json(rates);
});

// Buy crypto
app.post('/api/crypto/buy', requireAuth, (req, res) => {
  try {
    const { symbol, name, amount, totalCost } = req.body;
    const user = prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);

    if (user.balance < totalCost) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(totalCost, req.session.userId);

    // Add or update crypto holdings
    const existing = prepare('SELECT * FROM crypto_holdings WHERE user_id = ? AND crypto_symbol = ?').get(req.session.userId, symbol);
    if (existing) {
      prepare('UPDATE crypto_holdings SET amount = amount + ? WHERE id = ?').run(amount, existing.id);
    } else {
      prepare('INSERT INTO crypto_holdings (user_id, crypto_name, crypto_symbol, amount) VALUES (?, ?, ?, ?)').run(req.session.userId, name, symbol, amount);
    }

    // Record transaction
    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'debit', 'crypto', ?, ?)
    `).run(req.session.userId, `Bought ${amount} ${symbol}`, totalCost);

    res.json({ success: true, message: `Successfully bought ${amount} ${symbol}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

// Sell crypto
app.post('/api/crypto/sell', requireAuth, (req, res) => {
  try {
    const { symbol, amount, totalValue } = req.body;

    const holding = prepare('SELECT * FROM crypto_holdings WHERE user_id = ? AND crypto_symbol = ?').get(req.session.userId, symbol);
    if (!holding || holding.amount < amount) {
      return res.status(400).json({ error: 'Insufficient crypto balance' });
    }

    // Deduct crypto
    prepare('UPDATE crypto_holdings SET amount = amount - ? WHERE user_id = ? AND crypto_symbol = ?').run(amount, req.session.userId, symbol);

    // Add balance
    prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(totalValue, req.session.userId);

    // Record transaction
    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'credit', 'crypto', ?, ?)
    `).run(req.session.userId, `Sold ${amount} ${symbol}`, totalValue);

    res.json({ success: true, message: `Successfully sold ${amount} ${symbol}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

// Get user crypto holdings
app.get('/api/crypto/holdings', requireAuth, (req, res) => {
  const holdings = prepare('SELECT * FROM crypto_holdings WHERE user_id = ? AND amount > 0').all(req.session.userId);
  res.json(holdings);
});

// ============ GIFT CARD ROUTES ============

// Get gift card rates
app.get('/api/giftcards/rates', (req, res) => {
  const cards = [
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
  res.json(cards);
});

// Trade gift card
app.post('/api/giftcards/trade', requireAuth, (req, res) => {
  try {
    const { cardType, cardValue, tradeType, rate } = req.body;
    const nairaValue = cardValue * rate;

    if (tradeType === 'buy') {
      const user = prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
      if (user.balance < nairaValue) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }
      prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(nairaValue, req.session.userId);

      prepare(`
        INSERT INTO transactions (user_id, type, category, description, amount)
        VALUES (?, 'debit', 'giftcard', ?, ?)
      `).run(req.session.userId, `Bought $${cardValue} ${cardType} gift card`, nairaValue);
    } else {
      prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(nairaValue, req.session.userId);

      prepare(`
        INSERT INTO transactions (user_id, type, category, description, amount)
        VALUES (?, 'credit', 'giftcard', ?, ?)
      `).run(req.session.userId, `Sold $${cardValue} ${cardType} gift card`, nairaValue);
    }

    prepare(`
      INSERT INTO giftcard_trades (user_id, card_type, card_value, naira_value, trade_type)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.session.userId, cardType, cardValue, nairaValue, tradeType);

    res.json({ success: true, message: `Successfully ${tradeType === 'buy' ? 'bought' : 'sold'} ${cardType} gift card` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Transaction failed' });
  }
});

// ============ BILL PAYMENT ROUTES ============

// Get bill providers
app.get('/api/bills/providers', (req, res) => {
  const providers = {
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
  res.json(providers);
});

// Pay bill
app.post('/api/bills/pay', requireAuth, (req, res) => {
  try {
    const { billType, provider, accountNumber, amount } = req.body;

    if (!billType || !provider || !accountNumber || !amount) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (!['airtime', 'data', 'electricity', 'cable'].includes(billType)) {
      return res.status(400).json({ error: 'Invalid bill type' });
    }
    if (typeof amount !== 'number' || amount <= 0 || amount > 10000000) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    const user = prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
    if (user.balance < amount) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amount, req.session.userId);

    // Record bill payment
    prepare(`
      INSERT INTO bill_payments (user_id, bill_type, provider, account_number, amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.session.userId, billType, provider, accountNumber, amount);

    // Record transaction
    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'debit', 'bills', ?, ?)
    `).run(req.session.userId, `${billType} payment - ${provider}`, amount);

    res.json({ success: true, message: `${billType} payment successful` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Payment failed' });
  }
});

// ============ SOCIAL MEDIA MARKETPLACE ROUTES ============

// Get available social accounts
app.get('/api/social/accounts', (req, res) => {
  const accounts = prepare(`
    SELECT * FROM social_accounts WHERE status = 'available' ORDER BY platform, followers DESC
  `).all();
  res.json(accounts);
});

// Purchase social account
app.post('/api/social/purchase', requireAuth, (req, res) => {
  try {
    const { accountId } = req.body;

    const account = prepare('SELECT * FROM social_accounts WHERE id = ? AND status = ?').get(accountId, 'available');
    if (!account) {
      return res.status(400).json({ error: 'Account no longer available' });
    }

    const user = prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
    if (user.balance < account.price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Deduct balance
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(account.price, req.session.userId);

    // Mark account as sold
    prepare("UPDATE social_accounts SET status = 'sold' WHERE id = ?").run(accountId);

    // Record purchase
    prepare(`
      INSERT INTO social_purchases (user_id, account_id, price)
      VALUES (?, ?, ?)
    `).run(req.session.userId, accountId, account.price);

    // Record transaction
    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'debit', 'social', ?, ?)
    `).run(req.session.userId, `Purchased ${account.platform} account (${account.followers} followers)`, account.price);

    res.json({
      success: true,
      message: `Successfully purchased ${account.platform} account`,
      credentials: {
        platform: account.platform,
        username: `user_${Math.random().toString(36).substr(2, 8)}`,
        password: Math.random().toString(36).substr(2, 12),
        email: `${Math.random().toString(36).substr(2, 6)}@email.com`
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

// Get user's purchased accounts
app.get('/api/social/purchases', requireAuth, (req, res) => {
  const purchases = prepare(`
    SELECT sp.*, sa.platform, sa.account_type, sa.followers
    FROM social_purchases sp
    JOIN social_accounts sa ON sp.account_id = sa.id
    WHERE sp.user_id = ?
    ORDER BY sp.created_at DESC
  `).all(req.session.userId);
  res.json(purchases);
});

// ============ VIRTUAL NUMBER ROUTES ============

// Get available virtual numbers
app.get('/api/numbers/available', (req, res) => {
  const numbers = prepare(`
    SELECT * FROM virtual_numbers WHERE status = 'available' ORDER BY country, price
  `).all();
  res.json(numbers);
});

// Purchase virtual number
app.post('/api/numbers/purchase', requireAuth, (req, res) => {
  try {
    const { numberId } = req.body;

    const number = prepare('SELECT * FROM virtual_numbers WHERE id = ?').get(numberId);
    if (!number) {
      return res.status(400).json({ error: 'Number not available' });
    }

    const user = prepare('SELECT balance FROM users WHERE id = ?').get(req.session.userId);
    if (user.balance < number.price) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    // Generate phone number
    const phoneNumber = number.country_code + Math.floor(Math.random() * 9000000000 + 1000000000);

    // Calculate expiry
    let expiresAt;
    if (number.duration.includes('minutes')) {
      const minutes = parseInt(number.duration);
      expiresAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    } else {
      const days = parseInt(number.duration);
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    // Deduct balance
    prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(number.price, req.session.userId);

    // Record purchase
    prepare(`
      INSERT INTO user_virtual_numbers (user_id, virtual_number_id, phone_number, expires_at)
      VALUES (?, ?, ?, ?)
    `).run(req.session.userId, numberId, phoneNumber, expiresAt);

    // Record transaction
    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'debit', 'virtual_number', ?, ?)
    `).run(req.session.userId, `${number.country} ${number.number_type} - ${number.duration}`, number.price);

    res.json({
      success: true,
      message: 'Virtual number purchased successfully',
      number: {
        phoneNumber,
        country: number.country,
        type: number.number_type,
        expiresAt
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Purchase failed' });
  }
});

// Get user's virtual numbers
app.get('/api/numbers/mine', requireAuth, (req, res) => {
  const numbers = prepare(`
    SELECT uvn.*, vn.country, vn.country_code, vn.number_type, vn.duration
    FROM user_virtual_numbers uvn
    JOIN virtual_numbers vn ON uvn.virtual_number_id = vn.id
    WHERE uvn.user_id = ?
    ORDER BY uvn.created_at DESC
  `).all(req.session.userId);
  res.json(numbers);
});

// ============ FUND ACCOUNT (SIMULATION) ============
app.post('/api/user/fund', requireAuth, (req, res) => {
  try {
    const { amount } = req.body;

    // Check KYC status
    const user = prepare('SELECT kyc_status FROM users WHERE id = ?').get(req.session.userId);
    if (user.kyc_status !== 'verified') {
      return res.status(400).json({ error: 'Please complete KYC verification before funding your wallet', requiresKyc: true });
    }

    prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amount, req.session.userId);

    prepare(`
      INSERT INTO transactions (user_id, type, category, description, amount)
      VALUES (?, 'credit', 'deposit', 'Account funding', ?)
    `).run(req.session.userId, amount);

    res.json({ success: true, message: `Successfully added ₦${amount.toLocaleString()} to your account` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Funding failed' });
  }
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    app.listen(PORT, () => {
      console.log(`BITTRIXPAY server running on http://localhost:${PORT}`);
      console.log(`Open http://localhost:${PORT} in your browser`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
