// Dashboard JavaScript

// HTML escape helper to prevent XSS
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// Global variables
let userData = null;
let cryptoRates = [];
let giftcardRates = [];
let socialAccounts = [];
let virtualNumbers = [];
let currentCryptoTradeType = 'buy';
let currentGiftcardTradeType = 'sell';
let gcSelectedCard = null;      // full card object
let gcSelectedCountry = null;   // currency code string e.g. 'USD'
let gcQty = 1;
let gcReceiptType = 'physical';
let pendingTransaction = null;
let savedBankAccounts = JSON.parse(localStorage.getItem('bankAccounts') || '[]');
let notificationSettings = JSON.parse(localStorage.getItem('notificationSettings') || '{"push":true,"email":true,"sms":false}');
let _listenersInitialized = {};
let _actionInProgress = false;
let _pinCancelCallback = null;

// Check authentication on load
document.addEventListener('DOMContentLoaded', async () => {
  await checkAuth();
  initTheme();
  initNavigation();
  initTradeTabs();
  initBillCategories();
  loadDashboardData();
  loadNotificationSettings();
});

// Check if user is authenticated
async function checkAuth() {
  try {
    await AppDB.init();
    const data = AppDB.getAuthStatus();

    if (!data.authenticated) {
      window.location.href = 'login.html';
      return;
    }

    userData = data.user;
    const fullname = userData.fullname || 'User';
    const firstName = fullname.split(' ')[0];
    document.getElementById('welcomeName').textContent = firstName;

    // Set header avatar initials
    const nameParts = fullname.split(' ').filter(n => n.length > 0);
    const initials = nameParts.map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
    document.getElementById('headerInitials').textContent = initials;
  } catch (error) {
    console.error('Auth check failed:', error);
    window.location.href = 'login.html';
  }
}

// Initialize theme
function initTheme() {
  const savedTheme = localStorage.getItem('theme');
  const darkModeToggle = document.getElementById('darkModeToggle');

  // Default to dark mode (black theme)
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-mode');
    if (darkModeToggle) darkModeToggle.checked = false;
  } else {
    document.body.classList.add('dark-mode');
    if (darkModeToggle) darkModeToggle.checked = true;
  }
}

// Toggle dark mode from profile settings
function toggleDarkMode() {
  const darkModeToggle = document.getElementById('darkModeToggle');

  if (darkModeToggle.checked) {
    document.body.classList.add('dark-mode');
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.remove('dark-mode');
    localStorage.setItem('theme', 'light');
  }
}

// Initialize navigation
function initNavigation() {
  const navTabs = document.querySelectorAll('.nav-tab');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const section = tab.dataset.section;
      showSection(section);

      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
}

// Show section
function showSection(sectionId) {
  const sections = document.querySelectorAll('.content-section');
  sections.forEach(s => s.classList.remove('active'));

  const section = document.getElementById(`${sectionId}-section`);
  if (section) {
    section.classList.add('active');
  }

  // Update bottom nav
  const navTabs = document.querySelectorAll('.nav-tab');
  navTabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.section === sectionId);
  });

  // Scroll to top
  document.querySelector('.app-content').scrollTop = 0;

  // Keep Profile tab active for sub-pages
  if (sectionId === 'faqs') {
    navTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.section === 'settings');
    });
  }

  // Load section-specific data
  if (sectionId === 'crypto') loadCryptoData();
  if (sectionId === 'giftcards') loadGiftcardData();
  if (sectionId === 'social') loadSocialData();
  if (sectionId === 'numbers') loadNumbersData();
  if (sectionId === 'transactions') loadAllTransactions();
  if (sectionId === 'kyc') loadKycStatus();
  if (sectionId === 'settings') loadSettingsData();
}

// Initialize trade tabs
function initTradeTabs() {
  const cryptoTabs = document.querySelectorAll('#crypto-section .trade-tab');
  cryptoTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      cryptoTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentCryptoTradeType = tab.dataset.type;
      document.getElementById('cryptoTradeBtn').textContent =
        currentCryptoTradeType === 'buy' ? 'Buy Crypto' : 'Sell Crypto';
      updateCryptoSummary();
    });
  });
}

// Initialize bill categories
function initBillCategories() {
  const catBtns = document.querySelectorAll('.bill-cat-btn');
  catBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      catBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const category = btn.dataset.category;
      document.querySelectorAll('.bill-form').forEach(f => f.classList.remove('active'));
      document.getElementById(`${category}-form`).classList.add('active');
    });
  });
}

// ============ WALLET TABS ============

function switchWalletTab(wallet) {
  document.querySelectorAll('.wallet-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.wallet-panel').forEach(p => p.classList.remove('active'));

  document.querySelector(`.wallet-tab[data-wallet="${wallet}"]`).classList.add('active');
  document.getElementById(`${wallet}WalletPanel`).classList.add('active');
}

// ============ RATE CALCULATOR ============

function toggleRateCalculator() {
  const calc = document.getElementById('rateCalculatorInline');
  calc.style.display = calc.style.display === 'none' ? 'block' : 'none';
}

function switchRateCalcTab(tabId, e) {
  document.querySelectorAll('.rate-calc-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.rate-calc-panel').forEach(p => p.classList.remove('active'));

  if (e && e.target) {
    e.target.classList.add('active');
  } else {
    document.querySelector(`.rate-calc-tab[onclick*="${tabId}"]`)?.classList.add('active');
  }
  document.getElementById(`${tabId}-panel`).classList.add('active');
}

function calculateRate() {
  const select = document.getElementById('rateCalcCrypto');
  const amount = parseFloat(document.getElementById('rateCalcAmount').value) || 0;
  const option = select.options[select.selectedIndex];
  const price = parseFloat(option?.dataset?.price) || 0;

  const usdValue = price * amount;
  const ngnValue = usdValue * (AppDB.EXCHANGE_RATE || 1580);

  document.getElementById('rateResultUsd').textContent = `$${usdValue.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
  document.getElementById('rateResultNgn').textContent = `₦${ngnValue.toLocaleString(undefined, {maximumFractionDigits: 0})}`;
}

function calculateGiftcardRate() {
  const select = document.getElementById('rateCalcGiftcard');
  const value = parseFloat(document.getElementById('rateCalcGiftcardValue').value) || 0;
  const option = select.options[select.selectedIndex];
  const buyRate = parseFloat(option?.dataset?.buy) || 0;
  const sellRate = parseFloat(option?.dataset?.sell) || 0;

  document.getElementById('gcBuyResult').textContent = `₦${(buyRate * value).toLocaleString()}`;
  document.getElementById('gcSellResult').textContent = `₦${(sellRate * value).toLocaleString()}`;
}

// ============ LOAD DASHBOARD DATA ============

async function loadDashboardData() {
  await loadUserProfile();
  await loadTransactions();
  await loadCryptoData();
  await loadGiftcardData();
}

// Load user profile
async function loadUserProfile() {
  try {
    const user = AppDB.getUserProfile();
    if (!user) return;
    userData = user;

    const balance = user.balance || 0;
    const walletBalanceEl = document.getElementById('walletBalance');
    if (walletBalanceEl) walletBalanceEl.textContent = `₦${balance.toLocaleString()}`;
    document.getElementById('nairaBalance').textContent = `₦${balance.toLocaleString()}`;
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Load transactions
async function loadTransactions() {
  try {
    const transactions = AppDB.getUserTransactions();

    document.getElementById('totalTransactions').textContent = transactions.length;

    const recentContainer = document.getElementById('recentTransactions');
    if (transactions.length === 0) {
      recentContainer.innerHTML = '<p class="text-muted">No transactions yet</p>';
    } else {
      recentContainer.innerHTML = transactions.slice(0, 5).map(t => `
        <div class="transaction-item">
          <div class="transaction-info">
            <div class="transaction-icon ${t.type}">${t.type === 'credit' ? '↓' : '↑'}</div>
            <div>
              <div class="transaction-desc">${esc(t.description)}</div>
              <div class="transaction-date">${new Date(t.created_at).toLocaleDateString()}</div>
            </div>
          </div>
          <div class="transaction-amount ${t.type}">
            ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load transactions:', error);
  }
}

// Load all transactions
async function loadAllTransactions() {
  try {
    const transactions = AppDB.getUserTransactions();

    const container = document.getElementById('allTransactions');
    if (transactions.length === 0) {
      container.innerHTML = '<p class="text-muted">No transactions yet</p>';
    } else {
      container.innerHTML = transactions.map(t => `
        <div class="transaction-item">
          <div class="transaction-info">
            <div class="transaction-icon ${t.type}">${t.type === 'credit' ? '↓' : '↑'}</div>
            <div>
              <div class="transaction-desc">${esc(t.description)}</div>
              <div class="transaction-date">${new Date(t.created_at).toLocaleString()}</div>
            </div>
          </div>
          <div class="transaction-amount ${t.type}">
            ${t.type === 'credit' ? '+' : '-'}₦${t.amount.toLocaleString()}
          </div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load transactions:', error);
  }
}

// ============ CRYPTO FUNCTIONS ============

// Coin logo SVGs
const coinLogos = {
  'BTC': '<div class="coin-logo coin-btc"><svg viewBox="0 0 24 24" fill="white"><path d="M14.24 10.56c-.31 1.24-2.24.73-2.88.58l.55-2.18c.64.16 2.67.47 2.33 1.6zm-1.31 5.17c-.35 1.37-2.73.63-3.5.47l.6-2.37c.77.2 3.29.56 2.9 1.9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.92 10.97c-.18 1.27-1.07 1.99-2.33 2.27l-.56 2.24-.93-.23.55-2.2c-.24-.06-.49-.13-.74-.2l-.56 2.21-.93-.23.56-2.24c-.2-.05-.4-.1-.6-.15l-1.21-.3.36-1.08s.69.18.68.17c.38.09.55-.15.61-.31l.88-3.51c.02-.15-.01-.35-.3-.43.01-.01-.68-.17-.68-.17l.21-1.09 1.28.32c.22.06.45.11.68.17l.55-2.22.93.23-.54 2.16c.25.06.5.12.75.18l.54-2.15.93.23-.55 2.22c1.65.49 2.84 1.16 2.65 2.49z"/></svg></div>',
  'ETH': '<div class="coin-logo coin-eth"><svg viewBox="0 0 24 24" fill="white"><path d="M12 1.75l-6.25 10.5L12 16l6.25-3.75L12 1.75zM5.75 13.5L12 22.25l6.25-8.75L12 17.25 5.75 13.5z"/></svg></div>',
  'USDT': '<div class="coin-logo coin-usdt"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3h5v2H7V5h5zm3 8v2h-2v3h-2v-3H9v-2h2v-2H9V9h6v2h-2v2h2z"/></svg></div>',
  'BNB': '<div class="coin-logo coin-bnb"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2L7.5 6.5 9.36 8.36 12 5.71l2.64 2.65L16.5 6.5 12 2zM4.5 9.5L2 12l2.5 2.5L7 12 4.5 9.5zM12 8.29L7.5 12.79 9.36 14.64 12 12l2.64 2.64 1.86-1.85L12 8.29zM19.5 9.5L17 12l2.5 2.5L22 12l-2.5-2.5zM12 15.71l-2.64-2.65L7.5 14.92 12 19.42l4.5-4.5-1.86-1.86L12 15.71z"/></svg></div>',
  'SOL': '<div class="coin-logo coin-sol"><svg viewBox="0 0 24 24" fill="white"><path d="M4 17.5h13.5l2.5-2.5H6.5L4 17.5zM4 6.5L6.5 9H20l-2.5-2.5H4zM6.5 14.5H20L17.5 12H4l2.5 2.5z"/></svg></div>',
  'XRP': '<div class="coin-logo coin-xrp"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.5 5l-2.5 2.5L16.5 12l-2.5 2.5L16.5 17h-2l-2.5-2.5L9.5 17h-2l2.5-2.5L7.5 12l2.5-2.5L7.5 7h2l2.5 2.5L14.5 7h2z"/></svg></div>',
  'DOGE': '<div class="coin-logo coin-doge"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-3V7h3c3.31 0 5 2.24 5 5s-1.69 5-5 5zm0-8h-1v6h1c1.66 0 3-1.34 3-3s-1.34-3-3-3z"/></svg></div>',
  'ADA': '<div class="coin-logo coin-ada"><svg viewBox="0 0 24 24" fill="white"><circle cx="12" cy="12" r="3"/><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="19" r="1.5"/><circle cx="5.5" cy="8.5" r="1.5"/><circle cx="18.5" cy="15.5" r="1.5"/><circle cx="5.5" cy="15.5" r="1.5"/><circle cx="18.5" cy="8.5" r="1.5"/></svg></div>',
  'LTC': '<div class="coin-logo coin-ltc"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.5 14h-5l.5-2 1.5-.5L12 7h2l-1.5 6 1.5-.5-.5 2h-1z"/></svg></div>',
  'LINK': '<div class="coin-logo coin-link"><svg viewBox="0 0 24 24" fill="white"><path d="M12 2l-2 1.2L4 6.6v4.8l2 1.2 6 3.6 6-3.6 2-1.2V6.6l-6-3.4L12 2zm0 2.4l4 2.4v4.8l-4 2.4-4-2.4V6.8l4-2.4z"/></svg></div>'
};

async function loadCryptoData() {
  try {
    cryptoRates = AppDB.getCryptoRates();

    // Populate select
    const select = document.getElementById('cryptoSelect');
    select.innerHTML = '<option value="">-- Select crypto --</option>' +
      cryptoRates.map(c => `<option value="${c.symbol}" data-price="${c.price}">${c.name} (${c.symbol})</option>`).join('');

    // Display rates with coin logos
    const ratesContainer = document.getElementById('cryptoRates');
    ratesContainer.innerHTML = cryptoRates.map(c => `
      <div class="crypto-rate-card">
        <div class="crypto-info">
          ${coinLogos[c.symbol] || `<div class="coin-logo" style="background:var(--gradient-primary);"><span style="color:white;font-size:0.6rem;font-weight:700;">${c.symbol}</span></div>`}
          <div>
            <div class="crypto-name">${c.name}</div>
            <div class="crypto-name-sub">${c.symbol}</div>
          </div>
        </div>
        <div class="crypto-price">
          <div class="crypto-usd">$${c.price.toLocaleString()}</div>
          <div class="crypto-change ${c.change >= 0 ? 'positive' : 'negative'}">
            ${c.change >= 0 ? '+' : ''}${c.change}%
          </div>
        </div>
      </div>
    `).join('');

    // Load holdings
    const holdings = AppDB.getCryptoHoldings();

    document.getElementById('cryptoHoldings').textContent = holdings.length;

    const holdingsContainer = document.getElementById('holdingsList');
    if (holdings.length === 0) {
      holdingsContainer.innerHTML = '<p class="text-muted">No crypto holdings yet</p>';
    } else {
      holdingsContainer.innerHTML = holdings.map(h => `
        <div class="holding-item">
          <div>
            <strong>${h.crypto_symbol}</strong>
            <span class="text-muted"> ${h.crypto_name}</span>
          </div>
          <div>${h.amount.toFixed(6)}</div>
        </div>
      `).join('');
    }

    // Update crypto wallet mini holdings
    const miniContainer = document.getElementById('cryptoHoldingsMini');
    if (holdings.length === 0) {
      miniContainer.innerHTML = '<p class="text-muted" style="font-size:0.8rem;">No holdings yet</p>';
    } else {
      miniContainer.innerHTML = holdings.slice(0, 4).map(h => `
        <div class="mini-holding">
          <span class="coin-dot" style="background:${cryptoColorMap[h.crypto_symbol] || '#7C3AED'};"></span>
          ${h.crypto_symbol} ${h.amount.toFixed(4)}
        </div>
      `).join('');

      // Calculate portfolio value using Map for O(1) lookup
      const rateMap = new Map(cryptoRates.map(r => [r.symbol, r.price]));
      let portfolioValue = 0;
      holdings.forEach(h => {
        const price = rateMap.get(h.crypto_symbol);
        if (price) portfolioValue += h.amount * price * (AppDB.EXCHANGE_RATE || 1580);
      });
      document.getElementById('cryptoPortfolioValue').textContent = `₦${Math.round(portfolioValue).toLocaleString()}`;
    }

    // Add event listeners only once
    if (!_listenersInitialized.crypto) {
      select.addEventListener('change', updateCryptoSummary);
      document.getElementById('cryptoAmount').addEventListener('input', updateCryptoSummary);
      _listenersInitialized.crypto = true;
    }

  } catch (error) {
    console.error('Failed to load crypto data:', error);
  }
}

function updateCryptoSummary() {
  const select = document.getElementById('cryptoSelect');
  const amount = parseFloat(document.getElementById('cryptoAmount').value) || 0;
  const selectedOption = select.options[select.selectedIndex];
  const price = parseFloat(selectedOption?.dataset?.price) || 0;

  const nairaRate = AppDB.EXCHANGE_RATE || 1580;
  const total = price * amount * nairaRate;

  document.getElementById('cryptoPrice').textContent = `$${price.toLocaleString()}`;
  document.getElementById('cryptoTotal').textContent = `₦${total.toLocaleString()}`;
}

async function executeCryptoTrade() {
  if (_actionInProgress) return;

  const select = document.getElementById('cryptoSelect');
  const amount = parseFloat(document.getElementById('cryptoAmount').value);
  const selectedOption = select.options[select.selectedIndex];

  if (!select.value || !amount || amount <= 0) {
    showToast('Please fill all fields with valid values', 'error');
    return;
  }

  const symbol = select.value;
  const name = selectedOption.textContent.split(' (')[0];
  const price = parseFloat(selectedOption.dataset.price);
  const nairaRate = AppDB.EXCHANGE_RATE || 1580;
  const totalCost = price * amount * nairaRate;

  const btn = document.getElementById('cryptoTradeBtn');
  btn.disabled = true;
  _actionInProgress = true;

  try {
    let result;
    if (currentCryptoTradeType === 'buy') {
      result = AppDB.buyCrypto(symbol, name, amount, totalCost);
    } else {
      result = AppDB.sellCrypto(symbol, amount, totalCost);
    }

    showToast(result.message, 'success');
    loadUserProfile();
    loadCryptoData();
    loadTransactions();
    document.getElementById('cryptoAmount').value = '';
  } catch (error) {
    showToast(error.message || 'Transaction failed', 'error');
  } finally {
    btn.disabled = false;
    _actionInProgress = false;
  }
}

// ============ GIFT CARD FUNCTIONS ============

// Called when giftcards section is navigated to — load card data
async function loadGiftcardData() {
  try {
    giftcardRates = AppDB.getGiftCardRates();
    gcRenderGrid(giftcardRates);
    gcGoTo('landing');
  } catch (error) {
    console.error('Failed to load giftcard data:', error);
  }
}

// Navigate between gc steps: 'landing' | 'grid' | 'form'
function gcGoTo(step) {
  document.getElementById('gc-step-landing').style.display = step === 'landing' ? '' : 'none';
  document.getElementById('gc-step-grid').style.display   = step === 'grid'    ? '' : 'none';
  document.getElementById('gc-step-form').style.display   = step === 'form'    ? '' : 'none';
}

// Step 1 → 2: user tapped sell/buy option card
function gcSelectTradeType(type) {
  currentGiftcardTradeType = type;
  document.getElementById('gc-grid-title').textContent = type === 'sell' ? 'Sell Gift Cards' : 'Buy Gift Cards';
  document.getElementById('gc-grid-subtitle').textContent = type === 'sell' ? 'Select a card to sell' : 'Select a card to buy';
  document.getElementById('gcSearchInput').value = '';
  gcRenderGrid(giftcardRates);
  gcGoTo('grid');
}

// Render card grid
function gcRenderGrid(cards) {
  const grid = document.getElementById('gcCardGrid');
  if (!grid) return;
  grid.innerHTML = '';
  cards.forEach(c => {
    const div = document.createElement('div');
    div.className = 'gc-grid-item';
    div.innerHTML = `<div class="gc-grid-logo" style="background:${esc(c.color)};">${esc(c.logo)}</div><div class="gc-grid-name">${esc(c.name)}</div>`;
    div.addEventListener('click', () => gcSelectCard(c.name));
    grid.appendChild(div);
  });
}

// Filter grid by search
function gcFilterGrid(query) {
  const q = query.toLowerCase().trim();
  const filtered = q ? giftcardRates.filter(c => c.name.toLowerCase().includes(q)) : giftcardRates;
  gcRenderGrid(filtered);
}

// Step 2 → 3: user tapped a card in the grid
function gcSelectCard(cardName) {
  const card = giftcardRates.find(c => c.name === cardName);
  if (!card) return;
  gcSelectedCard = card;
  gcQty = 1;
  gcReceiptType = 'physical';
  gcSelectedCountry = null;

  // Render form header
  document.getElementById('gcFormLogo').style.background = card.color;
  document.getElementById('gcFormLogo').textContent = card.logo;
  document.getElementById('gcFormCardName').textContent = card.name;
  document.getElementById('gcFormTradeType').textContent = currentGiftcardTradeType === 'sell' ? 'Selling' : 'Buying';

  // Show/hide sell vs buy sub-form
  document.getElementById('gc-sell-form').style.display = currentGiftcardTradeType === 'sell' ? '' : 'none';
  document.getElementById('gc-buy-form').style.display  = currentGiftcardTradeType === 'buy'  ? '' : 'none';

  // Reset form fields
  document.getElementById('gcCardRange').value = '';
  document.getElementById('gcCardValue').value = '';
  document.getElementById('gcBuyAmount').value = '';
  document.getElementById('gcQtyDisplay').textContent = '1';
  document.querySelectorAll('.gc-receipt-chip').forEach(c => c.classList.remove('active'));
  document.querySelector('.gc-receipt-chip[data-type="physical"]').classList.add('active');

  // Render country chips
  gcRenderCountryChips(card);
  gcUpdateSummary();
  gcGoTo('form');
}

// Currency code → full country name map
const gcCountryNames = {
  'USD': 'United States', 'GBP': 'United Kingdom', 'CAD': 'Canada',
  'EUR': 'Europe', 'AUD': 'Australia', 'ZAR': 'South Africa',
  'MXN': 'Mexico', 'CNY': 'China', 'HKD': 'Hong Kong',
  'JPY': 'Japan', 'SGD': 'Singapore', 'MYR': 'Malaysia',
  'INR': 'India', 'BRL': 'Brazil', 'KRW': 'South Korea',
};

// Render country chips for the selected card
function gcRenderCountryChips(card) {
  const row = document.getElementById('gcCountryRow');
  const countries = Object.keys(card.countries);

  // Show first 4 countries as inline chips, rest go to "Other" sheet
  const inlineMax = 4;
  const inlineCodes = countries.slice(0, inlineMax);
  const sheetCodes = countries.slice(inlineMax);

  row.innerHTML = '';
  inlineCodes.forEach(code => {
    const info = card.countries[code];
    const btn = document.createElement('button');
    btn.className = 'gc-country-chip';
    btn.dataset.code = code;
    btn.textContent = `${info.flag} ${code}`;
    btn.addEventListener('click', () => gcSelectCountryChip(btn, code));
    row.appendChild(btn);
  });

  // Only show "Other" button if there are more countries
  if (sheetCodes.length > 0) {
    const otherBtn = document.createElement('button');
    otherBtn.className = 'gc-country-chip gc-chip-other';
    otherBtn.textContent = '+ Other';
    otherBtn.addEventListener('click', gcOpenSheet);
    row.appendChild(otherBtn);
  }

  // Auto-select first country
  const firstChip = row.querySelector('.gc-country-chip:not(.gc-chip-other)');
  if (firstChip) {
    gcSelectCountryChip(firstChip, inlineCodes[0]);
  }

  // Populate sheet list with ONLY the card's supported countries (not shown inline)
  const sheetList = document.getElementById('gcSheetList');
  const sheetOptions = sheetCodes.map(code => ({
    code,
    flag: card.countries[code].flag,
    name: gcCountryNames[code] || code,
  }));
  sheetList.dataset.all = JSON.stringify(sheetOptions);
  gcRenderSheet(sheetOptions);
}

function gcSelectCountryChip(chipEl, code) {
  document.querySelectorAll('.gc-country-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
  gcSelectedCountry = code;
  // Update currency labels
  document.querySelectorAll('.gc-currency-label').forEach(el => el.textContent = code);
  gcUpdateSummary();
}

// +/- quantity
function gcChangeQty(delta) {
  gcQty = Math.max(1, gcQty + delta);
  document.getElementById('gcQtyDisplay').textContent = gcQty;
  gcUpdateSummary();
}

// Receipt type chips
function gcSelectReceipt(chipEl) {
  document.querySelectorAll('.gc-receipt-chip').forEach(c => c.classList.remove('active'));
  chipEl.classList.add('active');
  gcReceiptType = chipEl.dataset.type;
}

// Update trade summary
function gcUpdateSummary() {
  const submitBtn = document.getElementById('gcSubmitBtn');
  if (!gcSelectedCard || !gcSelectedCountry) {
    submitBtn.disabled = true;
    return;
  }
  const countryData = gcSelectedCard.countries[gcSelectedCountry];
  if (!countryData) {
    document.getElementById('gcSumCard').textContent = gcSelectedCard.name;
    document.getElementById('gcSumCountry').textContent = gcSelectedCountry;
    document.getElementById('gcSumRate').textContent = 'Not available';
    document.getElementById('gcSumTotal').textContent = '—';
    submitBtn.disabled = true;
    return;
  }

  submitBtn.disabled = false;
  const rate = currentGiftcardTradeType === 'sell' ? countryData.sellRate : countryData.buyRate;

  let cardValue = 0;
  if (currentGiftcardTradeType === 'sell') {
    cardValue = parseFloat(document.getElementById('gcCardValue').value) || 0;
  } else {
    cardValue = parseFloat(document.getElementById('gcBuyAmount').value) || 0;
  }

  const totalNaira = rate * cardValue * (currentGiftcardTradeType === 'sell' ? gcQty : 1);

  document.getElementById('gcSumCard').textContent = gcSelectedCard.name;
  document.getElementById('gcSumCountry').textContent = `${countryData.flag} ${gcSelectedCountry}`;
  document.getElementById('gcSumRate').innerHTML = `&#8358;${rate.toLocaleString()}/${gcSelectedCountry}`;
  document.getElementById('gcSumTotal').textContent = `₦${totalNaira.toLocaleString()}`;
}

// Bottom sheet for "Other" countries
function gcOpenSheet() {
  const allOptions = JSON.parse(document.getElementById('gcSheetList').dataset.all || '[]');
  gcRenderSheet(allOptions);
  document.getElementById('gcSheetSearch').value = '';
  document.getElementById('gcSheetBackdrop').style.display = '';
  const sheet = document.getElementById('gcBottomSheet');
  sheet.style.display = '';
  requestAnimationFrame(() => sheet.classList.add('gc-sheet-open'));
}

function gcCloseSheet() {
  const sheet = document.getElementById('gcBottomSheet');
  sheet.classList.remove('gc-sheet-open');
  setTimeout(() => {
    sheet.style.display = 'none';
    document.getElementById('gcSheetBackdrop').style.display = 'none';
  }, 300);
}

function gcRenderSheet(options) {
  const list = document.getElementById('gcSheetList');
  list.innerHTML = '';
  options.forEach(o => {
    const div = document.createElement('div');
    div.className = 'gc-sheet-item';
    div.innerHTML = `<span class="gc-sheet-flag">${o.flag}</span><span class="gc-sheet-country">${esc(o.name)}</span><span class="gc-sheet-code">${esc(o.code)}</span>`;
    div.addEventListener('click', () => gcSelectFromSheet(o.code, o.flag, o.name));
    list.appendChild(div);
  });
}

function gcFilterSheet(query) {
  const all = JSON.parse(document.getElementById('gcSheetList').dataset.all || '[]');
  const q = query.toLowerCase().trim();
  const filtered = q ? all.filter(o => o.name.toLowerCase().includes(q) || o.code.toLowerCase().includes(q)) : all;
  gcRenderSheet(filtered);
}

function gcSelectFromSheet(code, flag, name) {
  gcCloseSheet();
  // Add/update chip for this country in the row
  const row = document.getElementById('gcCountryRow');
  let chip = row.querySelector(`[data-code="${code}"]`);
  if (!chip) {
    // Insert before "Other" button
    const otherBtn = row.querySelector('.gc-chip-other');
    chip = document.createElement('button');
    chip.className = 'gc-country-chip';
    chip.dataset.code = code;
    chip.textContent = `${flag} ${code}`;
    chip.addEventListener('click', () => gcSelectCountryChip(chip, code));
    row.insertBefore(chip, otherBtn);
  }
  gcSelectCountryChip(chip, code);
}

async function executeGiftcardTrade() {
  if (!gcSelectedCard || !gcSelectedCountry) {
    showToast('Please select a card and country', 'error');
    return;
  }

  const countryData = gcSelectedCard.countries[gcSelectedCountry];
  if (!countryData) {
    showToast('Country not available for this card', 'error');
    return;
  }

  let cardValue = 0;
  if (currentGiftcardTradeType === 'sell') {
    if (!document.getElementById('gcCardRange').value) {
      showToast('Please select a card range', 'error');
      return;
    }
    cardValue = parseFloat(document.getElementById('gcCardValue').value);
  } else {
    cardValue = parseFloat(document.getElementById('gcBuyAmount').value);
  }

  if (!cardValue || cardValue <= 0) {
    showToast('Please enter a valid card value', 'error');
    return;
  }

  const rate = currentGiftcardTradeType === 'sell' ? countryData.sellRate : countryData.buyRate;
  const totalQty = currentGiftcardTradeType === 'sell' ? gcQty : 1;
  const nairaValue = rate * cardValue * totalQty;
  const cardType = gcSelectedCard.name;

  const submitBtn = document.getElementById('gcSubmitBtn');
  submitBtn.disabled = true;

  openPinModal(async () => {
    try {
      AppDB.tradeGiftCard(cardType, cardValue * totalQty, currentGiftcardTradeType, rate);

      showTransactionSuccessModal(
        currentGiftcardTradeType === 'buy' ? 'Gift Card Purchased!' : 'Gift Card Sold!',
        `${currentGiftcardTradeType === 'buy' ? 'Bought' : 'Sold'} ${gcSelectedCountry} ${cardType} gift card`,
        nairaValue,
        currentGiftcardTradeType === 'buy' ? 'debit' : 'credit'
      );
      loadUserProfile();
      loadTransactions();
      gcGoTo('landing');
    } catch (error) {
      showToast(error.message || 'Transaction failed', 'error');
    } finally {
      submitBtn.disabled = false;
    }
  }, () => { submitBtn.disabled = false; });
}

// ============ BILL PAYMENT FUNCTIONS ============

function loadDataPlans() {
  const provider = document.getElementById('dataProvider').value;
  const planSelect = document.getElementById('dataPlan');

  const plans = {
    'MTN': [
      { id: '500mb', name: '500MB - 30 Days', price: 500 },
      { id: '1gb', name: '1GB - 30 Days', price: 1000 },
      { id: '2gb', name: '2GB - 30 Days', price: 2000 },
      { id: '5gb', name: '5GB - 30 Days', price: 3500 },
      { id: '10gb', name: '10GB - 30 Days', price: 5000 },
    ],
    'Airtel': [
      { id: '500mb', name: '500MB - 30 Days', price: 500 },
      { id: '1gb', name: '1GB - 30 Days', price: 1000 },
      { id: '2gb', name: '2GB - 30 Days', price: 2000 },
    ],
    'Glo': [
      { id: '1gb', name: '1GB - 30 Days', price: 800 },
      { id: '2gb', name: '2GB - 30 Days', price: 1500 },
    ]
  };

  const providerPlans = plans[provider] || [];
  planSelect.innerHTML = '<option value="">-- Select plan --</option>' +
    providerPlans.map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} - ₦${p.price}</option>`).join('');
}

function loadCablePackages() {
  const provider = document.getElementById('cableProvider').value;
  const packageSelect = document.getElementById('cablePackage');

  const packages = {
    'DSTV': [
      { id: 'padi', name: 'DStv Padi', price: 2500 },
      { id: 'yanga', name: 'DStv Yanga', price: 3500 },
      { id: 'confam', name: 'DStv Confam', price: 6200 },
      { id: 'compact', name: 'DStv Compact', price: 10500 },
      { id: 'premium', name: 'DStv Premium', price: 24500 },
    ],
    'GOtv': [
      { id: 'smallie', name: 'GOtv Smallie', price: 1100 },
      { id: 'jinja', name: 'GOtv Jinja', price: 2250 },
      { id: 'max', name: 'GOtv Max', price: 5100 },
    ],
    'StarTimes': [
      { id: 'nova', name: 'StarTimes Nova', price: 1200 },
      { id: 'basic', name: 'StarTimes Basic', price: 1850 },
    ]
  };

  const providerPackages = packages[provider] || [];
  packageSelect.innerHTML = '<option value="">-- Select package --</option>' +
    providerPackages.map(p => `<option value="${p.id}" data-price="${p.price}">${p.name} - ₦${p.price.toLocaleString()}</option>`).join('');
}

async function payBill(type) {
  let provider, accountNumber, amount;

  switch (type) {
    case 'airtime':
      provider = document.getElementById('airtimeProvider').value;
      accountNumber = document.getElementById('airtimePhone').value;
      amount = parseFloat(document.getElementById('airtimeAmount').value);
      break;
    case 'data':
      provider = document.getElementById('dataProvider').value;
      accountNumber = document.getElementById('dataPhone').value;
      const planSelect = document.getElementById('dataPlan');
      amount = parseFloat(planSelect.options[planSelect.selectedIndex]?.dataset?.price) || 0;
      break;
    case 'electricity':
      provider = document.getElementById('electricityProvider').value;
      accountNumber = document.getElementById('meterNumber').value;
      amount = parseFloat(document.getElementById('electricityAmount').value);
      break;
    case 'cable':
      provider = document.getElementById('cableProvider').value;
      accountNumber = document.getElementById('smartcardNumber').value;
      const pkgSelect = document.getElementById('cablePackage');
      amount = parseFloat(pkgSelect.options[pkgSelect.selectedIndex]?.dataset?.price) || 0;
      break;
  }

  if (!provider || !accountNumber || !amount) {
    showToast('Please fill all fields', 'error');
    return;
  }

  const billLabels = {
    'airtime': 'Airtime Purchase',
    'data': 'Data Purchase',
    'electricity': 'Electricity Payment',
    'cable': 'Cable TV Subscription'
  };

  openPinModal(async () => {
    try {
      const result = AppDB.payBill(type, provider, accountNumber, amount);

      showTransactionSuccessModal(
        'Payment Successful!',
        `${billLabels[type]} - ${provider}`,
        amount,
        'debit'
      );
      loadUserProfile();
      loadTransactions();

      if (type === 'airtime') {
        document.getElementById('airtimePhone').value = '';
        document.getElementById('airtimeAmount').value = '';
      } else if (type === 'data') {
        document.getElementById('dataPhone').value = '';
        document.getElementById('dataPlan').selectedIndex = 0;
      } else if (type === 'electricity') {
        document.getElementById('meterNumber').value = '';
        document.getElementById('electricityAmount').value = '';
      } else if (type === 'cable') {
        document.getElementById('smartcardNumber').value = '';
        document.getElementById('cablePackage').selectedIndex = 0;
      }
    } catch (error) {
      showToast(error.message || 'Payment failed', 'error');
    }
  });
}

// ============ SOCIAL MEDIA FUNCTIONS ============

async function loadSocialData() {
  try {
    socialAccounts = AppDB.getSocialAccounts();
    displaySocialAccounts(socialAccounts);

    // Purchased accounts not tracked in client DB, show empty
    const container = document.getElementById('purchasedAccounts');
    container.innerHTML = '<p class="text-muted">No purchased accounts yet</p>';
  } catch (error) {
    console.error('Failed to load social data:', error);
  }
}

function displaySocialAccounts(accounts) {
  const container = document.getElementById('socialAccountsGrid');

  const platformIcons = {
    'Instagram': '&#128247;',
    'Twitter': '&#128038;',
    'TikTok': '&#127925;',
    'Facebook': 'f',
    'YouTube': '&#9654;',
    'LinkedIn': 'in',
    'Snapchat': '&#128123;'
  };

  container.innerHTML = accounts.map(a => `
    <div class="social-account-card">
      <div class="social-header">
        <div class="social-platform">
          <div class="platform-icon">${platformIcons[a.platform] || '&#128100;'}</div>
          <div>
            <div class="platform-name">${a.platform}</div>
            <div class="account-type">${a.account_type}</div>
          </div>
        </div>
        <span class="social-badge">Available</span>
      </div>
      <div class="social-stats">
        <div class="stat">
          <div class="stat-num">${formatNumber(a.followers)}</div>
          <div class="stat-label">Followers</div>
        </div>
      </div>
      <p class="social-description">${a.description}</p>
      <div class="social-price">
        <span class="price-value">₦${a.price.toLocaleString()}</span>
        <button class="btn btn-primary btn-sm" onclick="purchaseSocialAccount(${a.id})">Buy Now</button>
      </div>
    </div>
  `).join('');
}

function filterSocialAccounts() {
  const platform = document.getElementById('socialFilter').value;
  const filtered = platform
    ? socialAccounts.filter(a => a.platform === platform)
    : socialAccounts;
  displaySocialAccounts(filtered);
}

async function purchaseSocialAccount(accountId) {
  const account = socialAccounts.find(a => a.id === accountId);
  if (!account) {
    showToast('Account not found', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to purchase this ${account.platform} account for ₦${account.price.toLocaleString()}?`)) return;

  openPinModal(async () => {
    try {
      const data = AppDB.purchaseSocialAccount(accountId);

      showModal('Transaction Successful!', `
        <div class="success-modal">
          <div class="success-icon">&#10003;</div>
          <h3>Account Purchased!</h3>
          <div class="success-amount" style="color: #EF4444;">-₦${account.price.toLocaleString()}</div>
          <p class="text-muted">Your account credentials:</p>
          <div style="background: #1A1A1A; padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: left;">
            <p><strong>Platform:</strong> ${data.credentials.platform}</p>
            <p><strong>Username:</strong> ${data.credentials.username}</p>
            <p><strong>Password:</strong> ${data.credentials.password}</p>
            <p><strong>Email:</strong> ${data.credentials.email}</p>
          </div>
          <p style="margin-top: 1rem; color: var(--text-muted); font-size: 0.85rem;">Please save these credentials. They will not be shown again.</p>
        </div>
      `);
      loadUserProfile();
      loadSocialData();
      loadTransactions();
    } catch (error) {
      showToast(error.message || 'Purchase failed', 'error');
    }
  });
}

// ============ VIRTUAL NUMBERS FUNCTIONS ============

async function loadNumbersData() {
  try {
    virtualNumbers = AppDB.getVirtualNumbers();
    displayNumbers(virtualNumbers);

    const myNumbers = AppDB.getUserVirtualNumbers();

    const container = document.getElementById('myNumbersList');
    if (myNumbers.length === 0) {
      container.innerHTML = '<p class="text-muted">No virtual numbers yet</p>';
    } else {
      container.innerHTML = myNumbers.map(n => `
        <div class="my-number-item">
          <div>
            <strong>${n.phone_number}</strong>
            <span class="text-muted"> ${n.country} - ${n.number_type}</span>
          </div>
          <div class="text-muted" style="font-size:0.75rem;">Expires: ${new Date(n.expires_at).toLocaleString()}</div>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Failed to load numbers data:', error);
  }
}

// Service icons for virtual numbers
const serviceIcons = {
  'Telegram': '&#9992;',
  'WhatsApp': '&#128172;',
  'Reddit': '&#128125;',
  'Twitter': '&#128038;',
  'Instagram': '&#128247;',
  'Facebook': 'f',
  'TikTok': '&#127925;',
  'Google': 'G',
  'Discord': '&#127918;',
  'Snapchat': '&#128123;',
  'Signal': '&#128274;',
  'Viber': '&#128222;'
};

// Available services for each number
const numberServices = ['Telegram', 'WhatsApp', 'Reddit', 'Twitter', 'Instagram', 'Facebook', 'TikTok', 'Google', 'Discord', 'Snapchat', 'Signal', 'Viber'];

// Static lookup maps (defined once, not per-render)
const countryFlags = {
  'USA': '&#127482;&#127480;',
  'United States': '&#127482;&#127480;',
  'UK': '&#127468;&#127463;',
  'United Kingdom': '&#127468;&#127463;',
  'Canada': '&#127464;&#127462;',
  'Germany': '&#127465;&#127466;',
  'France': '&#127467;&#127479;',
  'Netherlands': '&#127475;&#127473;',
  'Australia': '&#127462;&#127482;',
  'India': '&#127470;&#127475;',
  'Brazil': '&#127463;&#127479;',
  'Russia': '&#127479;&#127482;',
  'Nigeria': '&#127475;&#127468;',
  'China': '&#127464;&#127475;',
  'Japan': '&#127471;&#127477;',
  'South Korea': '&#127472;&#127479;'
};

const cryptoColorMap = { BTC: '#F7931A', ETH: '#627EEA', USDT: '#26A17B', BNB: '#F3BA2F', SOL: '#9945FF', XRP: '#00AAE4', DOGE: '#C2A633', ADA: '#0033AD', LTC: '#BFBBBB', LINK: '#2A5ADA' };

function displayNumbers(numbers) {
  const container = document.getElementById('numbersGrid');

  // Assign random services to numbers for display
  container.innerHTML = numbers.map((n, i) => {
    const assignedServices = numberServices.slice(0, 3 + (i % 4)).sort(() => Math.random() - 0.5).slice(0, 2 + (i % 3));
    // Store on the number object for filtering
    n._services = assignedServices;
    return `
    <div class="number-card" data-services="${assignedServices.join(',')}">
      <div class="number-header">
        <div class="country-flag">${countryFlags[n.country] || '&#127988;'}</div>
        <div>
          <div class="country-name">${n.country}</div>
          <div class="country-code">${n.country_code}</div>
        </div>
      </div>
      <div class="number-details">
        <span class="number-type">${n.number_type}</span>
        <span class="number-duration">${n.duration}</span>
      </div>
      <div class="number-usefor-label">Use for:</div>
      <div class="number-services-wrap">
        ${assignedServices.map(s => `<span class="number-service">${s}</span>`).join('')}
      </div>
      <div class="number-footer">
        <span class="number-price">₦${n.price.toLocaleString()}</span>
        <button class="btn btn-primary btn-sm" onclick="purchaseNumber(${n.id})">Get Number</button>
      </div>
    </div>
  `;
  }).join('');
}

function filterNumbers() {
  const country = document.getElementById('countryFilter').value;
  const service = document.getElementById('serviceFilter').value;

  let filtered = virtualNumbers;

  if (country) {
    filtered = filtered.filter(n => n.country === country);
  }

  if (service) {
    // Filter based on assigned services
    filtered = filtered.filter(n => {
      if (n._services) return n._services.includes(service);
      return true;
    });
  }

  displayNumbers(filtered);
}

async function purchaseNumber(numberId) {
  const number = virtualNumbers.find(n => n.id === numberId);
  if (!number) {
    showToast('Number not found', 'error');
    return;
  }

  if (!confirm(`Are you sure you want to purchase this ${number.country} number for ₦${number.price.toLocaleString()}?`)) return;

  openPinModal(async () => {
    try {
      const data = AppDB.purchaseVirtualNumber(numberId);

      showModal('Transaction Successful!', `
        <div class="success-modal">
          <div class="success-icon">&#10003;</div>
          <h3>Virtual Number Purchased!</h3>
          <div class="success-amount" style="color: #EF4444;">-₦${number.price.toLocaleString()}</div>
          <p class="text-muted">Your virtual number is ready:</p>
          <div style="background: #1A1A1A; padding: 1rem; border-radius: 8px; margin-top: 1rem; text-align: center;">
            <h2 style="color: var(--primary-color);">${data.number.phoneNumber}</h2>
            <p><strong>Country:</strong> ${data.number.country}</p>
            <p><strong>Type:</strong> ${data.number.type}</p>
            <p><strong>Expires:</strong> ${new Date(data.number.expiresAt).toLocaleString()}</p>
          </div>
        </div>
      `);
      loadUserProfile();
      loadNumbersData();
      loadTransactions();
    } catch (error) {
      showToast(error.message || 'Purchase failed', 'error');
    }
  });
}

// ============ FUND ACCOUNT FUNCTIONS ============

let selectedReceiptFile = null;

function openFundModal() {
  if (!checkKycBeforeFunding()) {
    return;
  }
  document.getElementById('fundModal').classList.add('active');
  initUploadArea();
}

function closeFundModal() {
  document.getElementById('fundModal').classList.remove('active');
  resetFundForm();
}

function resetFundForm() {
  document.getElementById('fundAmountInput').value = '';
  selectedReceiptFile = null;
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('receiptFile').value = '';
}

function initUploadArea() {
  const uploadArea = document.getElementById('uploadArea');
  const fileInput = document.getElementById('receiptFile');

  uploadArea.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB', 'error');
        return;
      }
      selectedReceiptFile = file;
      showImagePreview(file);
    }
  };

  uploadArea.ondragover = (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = 'var(--primary-color)';
  };

  uploadArea.ondragleave = () => {
    uploadArea.style.borderColor = '';
  };

  uploadArea.ondrop = (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('File size must be less than 5MB', 'error');
        return;
      }
      selectedReceiptFile = file;
      showImagePreview(file);
    }
  };
}

function showImagePreview(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImage').src = e.target.result;
    document.getElementById('uploadPlaceholder').style.display = 'none';
    document.getElementById('uploadPreview').style.display = 'block';
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  selectedReceiptFile = null;
  document.getElementById('uploadPlaceholder').style.display = 'flex';
  document.getElementById('uploadPreview').style.display = 'none';
  document.getElementById('receiptFile').value = '';
}

function copyAccountNumber() {
  const accountNumber = document.getElementById('bankAccountNumber').textContent;
  navigator.clipboard.writeText(accountNumber).then(() => {
    showToast('Account number copied!', 'success');
  });
}

// Handle fund form submission
document.addEventListener('DOMContentLoaded', () => {
  const fundForm = document.getElementById('fundForm');
  if (fundForm) {
    fundForm.onsubmit = async (e) => {
      e.preventDefault();
      await submitFundRequest();
    };
  }
});

async function submitFundRequest() {
  if (_actionInProgress) return;

  const amount = parseFloat(document.getElementById('fundAmountInput').value);

  if (!amount || amount < 1000) {
    showToast('Minimum funding amount is ₦1,000', 'error');
    return;
  }

  if (amount > 10000000) {
    showToast('Maximum funding amount is ₦10,000,000', 'error');
    return;
  }

  if (!selectedReceiptFile) {
    showToast('Please upload your payment receipt', 'error');
    return;
  }

  // Validate file type
  if (!selectedReceiptFile.type.startsWith('image/') && selectedReceiptFile.type !== 'application/pdf') {
    showToast('Please upload an image or PDF file', 'error');
    return;
  }

  _actionInProgress = true;
  showProcessingOverlay();

  const delay = 2000 + Math.random() * 2000;

  setTimeout(async () => {
    try {
      const result = AppDB.fundAccount(amount);

      hideProcessingOverlay();
      closeFundModal();
      showSuccessModal(amount);
      loadUserProfile();
      loadTransactions();
    } catch (error) {
      hideProcessingOverlay();
      showToast(error.message || 'Funding failed. Please try again.', 'error');
    } finally {
      _actionInProgress = false;
    }
  }, delay);
}

function showProcessingOverlay() {
  // Remove any existing overlay first
  hideProcessingOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'processing-overlay';
  overlay.id = 'processingOverlay';
  overlay.innerHTML = `
    <div class="processing-spinner"></div>
    <p class="processing-text">Verifying Payment...</p>
    <p class="processing-subtext">Please wait while we confirm your transaction</p>
  `;
  document.body.appendChild(overlay);
}

function hideProcessingOverlay() {
  const overlay = document.getElementById('processingOverlay');
  if (overlay) {
    overlay.remove();
  }
}

function showSuccessModal(amount) {
  document.getElementById('modalTitle').textContent = 'Payment Successful';
  document.getElementById('modalBody').innerHTML = `
    <div class="success-modal">
      <div class="success-icon">&#10003;</div>
      <h2>Transaction Successful!</h2>
      <p class="text-muted">Your account has been credited</p>
      <div class="success-amount">₦${amount.toLocaleString()}</div>
      <p class="text-muted">Your new balance will reflect immediately</p>
      <button class="btn btn-primary" onclick="closeModal()" style="margin-top: 1.5rem;">
        Continue
      </button>
    </div>
  `;
  document.getElementById('modal').classList.add('active');
}

// ============ KYC FUNCTIONS ============

async function loadKycStatus() {
  const statusIcon = document.getElementById('kycStatusIcon');
  const statusTitle = document.getElementById('kycStatusTitle');
  const statusText = document.getElementById('kycStatusText');

  try {
    const data = AppDB.getKycStatus();

    if (data.status === 'verified') {
      statusIcon.innerHTML = '&#10003;';
      statusIcon.className = 'kyc-status-icon verified';
      statusTitle.textContent = 'Verified';
      statusText.textContent = 'Your identity has been verified. You have full access to all features.';

      document.getElementById('kycFormCard').style.display = 'none';
      document.getElementById('pinSetupCard').style.display = 'none';
      document.getElementById('kycCompletedCard').style.display = 'block';
    } else if (data.status === 'pending_pin') {
      statusIcon.innerHTML = '&#128274;';
      statusIcon.className = 'kyc-status-icon pending';
      statusTitle.textContent = 'PIN Setup Required';
      statusText.textContent = 'Please set your transaction PIN to complete verification.';

      document.getElementById('kycFormCard').style.display = 'none';
      document.getElementById('pinSetupCard').style.display = 'block';
      document.getElementById('kycCompletedCard').style.display = 'none';
    } else {
      statusIcon.innerHTML = '&#9888;';
      statusIcon.className = 'kyc-status-icon pending';
      statusTitle.textContent = 'Not Verified';
      statusText.textContent = 'Complete your KYC to unlock all features including wallet funding.';

      document.getElementById('kycFormCard').style.display = 'block';
      document.getElementById('pinSetupCard').style.display = 'none';
      document.getElementById('kycCompletedCard').style.display = 'none';
    }
  } catch (error) {
    console.error('Failed to load KYC status:', error);
    statusIcon.innerHTML = '&#9888;';
    statusIcon.className = 'kyc-status-icon pending';
    statusTitle.textContent = 'Not Verified';
    statusText.textContent = 'Complete your KYC to unlock all features including wallet funding.';

    document.getElementById('kycFormCard').style.display = 'block';
    document.getElementById('pinSetupCard').style.display = 'none';
    document.getElementById('kycCompletedCard').style.display = 'none';
  }
}

// Initialize forms
document.addEventListener('DOMContentLoaded', () => {
  const kycForm = document.getElementById('kycForm');
  if (kycForm) {
    kycForm.onsubmit = async (e) => {
      e.preventDefault();
      await submitKyc();
    };
  }

  const pinSetupForm = document.getElementById('pinSetupForm');
  if (pinSetupForm) {
    pinSetupForm.onsubmit = async (e) => {
      e.preventDefault();
      await setupPin();
    };
  }

  const resetPinForm = document.getElementById('resetPinForm');
  if (resetPinForm) {
    resetPinForm.onsubmit = async (e) => {
      e.preventDefault();
      await resetTransactionPin();
    };
  }

  const pinVerifyForm = document.getElementById('pinVerifyForm');
  if (pinVerifyForm) {
    pinVerifyForm.onsubmit = async (e) => {
      e.preventDefault();
      await verifyTransactionPin();
    };
  }

  setupPinInputs();
});

function setupPinInputs() {
  const pinContainers = document.querySelectorAll('.pin-input-container');
  pinContainers.forEach(container => {
    const inputs = container.querySelectorAll('.pin-digit');
    inputs.forEach((input, index) => {
      input.addEventListener('input', (e) => {
        if (e.target.value.length === 1 && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && e.target.value === '' && index > 0) {
          inputs[index - 1].focus();
        }
      });
      input.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
      });
    });
  });
}

async function submitKyc() {
  const nin = document.getElementById('ninInput').value;
  const bvn = document.getElementById('bvnInput').value;

  if (nin.length !== 11 || bvn.length !== 11) {
    showToast('NIN and BVN must be 11 digits each', 'error');
    return;
  }

  try {
    const result = AppDB.submitKyc(nin, bvn);
    showToast(result.message, 'success');
    loadKycStatus();
  } catch (error) {
    showToast(error.message || 'KYC submission failed', 'error');
  }
}

async function setupPin() {
  const pin = getPinValue(['pinDigit1', 'pinDigit2', 'pinDigit3', 'pinDigit4']);
  const confirmPin = getPinValue(['confirmPinDigit1', 'confirmPinDigit2', 'confirmPinDigit3', 'confirmPinDigit4']);

  if (pin.length !== 4) {
    showToast('Please enter a 4-digit PIN', 'error');
    return;
  }

  if (pin !== confirmPin) {
    showToast('PINs do not match', 'error');
    return;
  }

  try {
    const result = await AppDB.setTransactionPin(pin);

    await loadUserProfile();
    loadKycStatus();

    showModal('KYC Completed!', `
      <div class="success-modal">
        <div class="success-icon">&#10003;</div>
        <h3>Verification Successful!</h3>
        <p class="text-muted">Your identity has been verified and transaction PIN has been set.</p>
        <p class="text-muted">You can now perform transactions on BITTRIXPAY.</p>
        <button class="btn btn-primary" onclick="closeModal(); showSection('overview');" style="margin-top: 1.5rem;">
          Go to Dashboard
        </button>
      </div>
    `);
  } catch (error) {
    showToast(error.message || 'Failed to set PIN', 'error');
  }
}

function getPinValue(inputIds) {
  return inputIds.map(id => document.getElementById(id).value).join('');
}

function clearPinInputs(inputIds) {
  inputIds.forEach(id => document.getElementById(id).value = '');
}

// ============ SETTINGS / PROFILE FUNCTIONS ============

async function loadSettingsData() {
  if (userData) {
    const fullname = userData.fullname || 'User';
    const nameParts = fullname.split(' ').filter(n => n.length > 0);
    const initials = nameParts.map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
    document.getElementById('profileInitials').textContent = initials;
    document.getElementById('profileFullname').textContent = fullname;
    document.getElementById('profileEmail').textContent = userData.email || '';
    document.getElementById('settingsFullname').textContent = fullname;
    document.getElementById('settingsEmail').textContent = userData.email || '';
    document.getElementById('settingsPhone').textContent = userData.phone || 'Not set';
    document.getElementById('settingsMemberSince').textContent = userData.created_at
      ? new Date(userData.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      : 'Member';

    // Update dark mode toggle
    const darkModeToggle = document.getElementById('darkModeToggle');
    if (darkModeToggle) {
      darkModeToggle.checked = document.body.classList.contains('dark-mode');
    }

    // Update verification status
    updateVerificationStatus();

    // Generate referral code
    const referralCode = 'BTX' + userData.email.substring(0, 3).toUpperCase() + Math.floor(Math.random() * 9000 + 1000);
    const savedReferralCode = localStorage.getItem('referralCode') || referralCode;
    localStorage.setItem('referralCode', savedReferralCode);
    document.getElementById('referralCode').textContent = savedReferralCode;

    // Load bank accounts
    renderBankAccounts();

    // Load biometric setting
    const biometricToggle = document.getElementById('biometricToggle');
    if (biometricToggle) {
      biometricToggle.checked = localStorage.getItem('biometricEnabled') === 'true';
    }

    // Load 2FA status
    load2FAStatus();

    // Load devices
    loadDevices();
  }
}

function updateVerificationStatus() {
  if (!userData) return;

  const badge = document.getElementById('verificationBadge');
  const dot = badge.querySelector('.verification-dot');
  const text = document.getElementById('verificationText');
  const verifyBtn = document.getElementById('verifyNowBtn');

  if (userData.kyc_status === 'verified') {
    dot.className = 'verification-dot verified';
    text.textContent = 'Verified';
    verifyBtn.style.display = 'none';

    ['vStep1', 'vStep2', 'vStep3'].forEach(id => {
      const step = document.getElementById(id);
      step.classList.add('completed');
      step.querySelector('.step-check').innerHTML = '&#10003;';
    });
  } else if (userData.kyc_status === 'pending_pin') {
    dot.className = 'verification-dot pending';
    text.textContent = 'Pending';

    const step1 = document.getElementById('vStep1');
    step1.classList.add('completed');
    step1.querySelector('.step-check').innerHTML = '&#10003;';
  } else {
    dot.className = 'verification-dot pending';
    text.textContent = 'Not Verified';
  }
}

function toggleProfileEdit() {
  showToast('Profile editing coming soon', 'info');
}

function toggleResetPin() {
  const section = document.getElementById('resetPinSection');
  const chevron = document.getElementById('pinChevron');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    chevron.classList.add('rotated');
  } else {
    section.style.display = 'none';
    chevron.classList.remove('rotated');
  }
}

function toggleChangePassword() {
  const section = document.getElementById('changePasswordSection');
  const chevron = document.getElementById('passwordChevron');
  if (section.style.display === 'none') {
    section.style.display = 'block';
    chevron.classList.add('rotated');
  } else {
    section.style.display = 'none';
    chevron.classList.remove('rotated');
  }
}

async function changePassword() {
  const currentPassword = document.getElementById('currentPassword').value;
  const newPassword = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmNewPassword').value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    showToast('Please fill all fields', 'error');
    return;
  }

  if (newPassword.length < 6) {
    showToast('Password must be at least 6 characters', 'error');
    return;
  }

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', 'error');
    return;
  }

  try {
    const result = await AppDB.changePassword(currentPassword, newPassword);
    showToast(result.message, 'success');
    document.getElementById('currentPassword').value = '';
    document.getElementById('newPassword').value = '';
    document.getElementById('confirmNewPassword').value = '';
    toggleChangePassword();
  } catch (error) {
    showToast(error.message || 'Failed to change password', 'error');
  }
}

async function resetTransactionPin() {
  const currentPin = getPinValue(['currentPin1', 'currentPin2', 'currentPin3', 'currentPin4']);
  const newPin = getPinValue(['resetNewPin1', 'resetNewPin2', 'resetNewPin3', 'resetNewPin4']);
  const confirmPin = getPinValue(['resetConfirmPin1', 'resetConfirmPin2', 'resetConfirmPin3', 'resetConfirmPin4']);

  if (currentPin.length !== 4 || newPin.length !== 4) {
    showToast('Please enter valid 4-digit PINs', 'error');
    return;
  }

  if (newPin !== confirmPin) {
    showToast('New PINs do not match', 'error');
    return;
  }

  try {
    const result = await AppDB.resetPin(currentPin, newPin);
    showToast(result.message, 'success');
    clearPinInputs(['currentPin1', 'currentPin2', 'currentPin3', 'currentPin4',
                    'resetNewPin1', 'resetNewPin2', 'resetNewPin3', 'resetNewPin4',
                    'resetConfirmPin1', 'resetConfirmPin2', 'resetConfirmPin3', 'resetConfirmPin4']);
    toggleResetPin();
  } catch (error) {
    showToast(error.message || 'Failed to reset PIN', 'error');
  }
}

// ============ NOTIFICATION SETTINGS ============

function loadNotificationSettings() {
  const pushToggle = document.getElementById('pushNotifToggle');
  const emailToggle = document.getElementById('emailNotifToggle');
  const smsToggle = document.getElementById('smsNotifToggle');

  if (pushToggle) pushToggle.checked = notificationSettings.push;
  if (emailToggle) emailToggle.checked = notificationSettings.email;
  if (smsToggle) smsToggle.checked = notificationSettings.sms;
}

function saveNotificationSettings() {
  notificationSettings = {
    push: document.getElementById('pushNotifToggle').checked,
    email: document.getElementById('emailNotifToggle').checked,
    sms: document.getElementById('smsNotifToggle').checked
  };
  localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
  showToast('Notification settings saved', 'success');
}

function saveBiometricSetting() {
  const enabled = document.getElementById('biometricToggle').checked;
  localStorage.setItem('biometricEnabled', enabled);
  showToast(enabled ? 'Biometric login enabled' : 'Biometric login disabled', 'success');
}

// ============ BANK ACCOUNTS ============

function renderBankAccounts() {
  const container = document.getElementById('bankAccountsList');
  if (savedBankAccounts.length === 0) {
    container.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No bank accounts added yet</p>';
  } else {
    container.innerHTML = savedBankAccounts.map((bank, i) => `
      <div class="bank-account-item">
        <div class="bank-account-info">
          <div class="bank-account-name">${esc(bank.bankName)}</div>
          <div class="bank-account-number">${esc(bank.accountNumber)} - ${esc(bank.accountName)}</div>
        </div>
        <button class="bank-account-delete" onclick="deleteBankAccount(${i})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    `).join('');
  }
}

function showAddBankModal() {
  document.getElementById('bankModal').classList.add('active');
}

function closeBankModal() {
  document.getElementById('bankModal').classList.remove('active');
  document.getElementById('addBankForm').reset();
}

function addBankAccount() {
  const bankName = document.getElementById('bankNameSelect').value;
  const accountNumber = document.getElementById('bankAccNumber').value;
  const accountName = document.getElementById('bankAccName').value;

  if (!bankName || !accountNumber || !accountName) {
    showToast('Please fill all fields', 'error');
    return;
  }

  if (!/^\d{10}$/.test(accountNumber)) {
    showToast('Account number must be exactly 10 digits', 'error');
    return;
  }

  savedBankAccounts.push({ bankName, accountNumber, accountName });
  localStorage.setItem('bankAccounts', JSON.stringify(savedBankAccounts));

  closeBankModal();
  renderBankAccounts();
  showToast('Bank account added successfully', 'success');
}

function deleteBankAccount(index) {
  if (!confirm('Are you sure you want to remove this bank account?')) return;
  savedBankAccounts.splice(index, 1);
  localStorage.setItem('bankAccounts', JSON.stringify(savedBankAccounts));
  renderBankAccounts();
  showToast('Bank account removed', 'success');
}

// ============ REFERRAL ============

function copyReferralCode() {
  const code = document.getElementById('referralCode').textContent;
  navigator.clipboard.writeText(code).then(() => {
    showToast('Referral code copied!', 'success');
  });
}

function shareReferralCode() {
  const code = document.getElementById('referralCode').textContent;
  const shareText = `Join BITTRIXPAY and earn rewards! Use my referral code: ${code}. Sign up now!`;

  if (navigator.share) {
    navigator.share({
      title: 'Join BITTRIXPAY',
      text: shareText,
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareText).then(() => {
      showToast('Referral link copied to clipboard!', 'success');
    });
  }
}

// ============ PIN VERIFICATION FOR TRANSACTIONS ============

function openPinModal(transactionCallback, cancelCallback) {
  _pinCancelCallback = cancelCallback || null;
  if (userData && userData.kyc_status !== 'verified') {
    showModal('KYC Required', `
      <div class="kyc-alert" style="flex-direction: column; text-align: center;">
        <div class="kyc-alert-icon">&#9888;</div>
        <div class="kyc-alert-content">
          <h4>Complete Your KYC First</h4>
          <p>You need to verify your identity and set up a transaction PIN before performing transactions.</p>
          <button class="kyc-alert-btn" onclick="closeModal(); showSection('kyc');">
            Complete KYC Now
          </button>
        </div>
      </div>
    `);
    return;
  }

  pendingTransaction = transactionCallback;
  document.getElementById('pinModal').classList.add('active');
  document.getElementById('pinError').style.display = 'none';
  clearPinInputs(['verifyPin1', 'verifyPin2', 'verifyPin3', 'verifyPin4']);
  document.getElementById('verifyPin1').focus();
}

function closePinModal() {
  document.getElementById('pinModal').classList.remove('active');
  pendingTransaction = null;
  clearPinInputs(['verifyPin1', 'verifyPin2', 'verifyPin3', 'verifyPin4']);
  // Re-enable any submit buttons that were disabled for PIN verification
  if (_pinCancelCallback) {
    _pinCancelCallback();
    _pinCancelCallback = null;
  }
}

async function verifyTransactionPin() {
  const pin = getPinValue(['verifyPin1', 'verifyPin2', 'verifyPin3', 'verifyPin4']);

  if (pin.length !== 4) {
    document.getElementById('pinError').textContent = 'Please enter your 4-digit PIN';
    document.getElementById('pinError').style.display = 'block';
    return;
  }

  try {
    const data = await AppDB.verifyPin(pin);

    if (data.valid) {
      const transactionToExecute = pendingTransaction;
      closePinModal();
      if (transactionToExecute) {
        await transactionToExecute();
      }
    }
  } catch (error) {
    const errorMsg = error.message || '';
    if (errorMsg.includes('KYC') || errorMsg.includes('complete')) {
      closePinModal();
      showModal('KYC Required', `
        <div class="kyc-alert" style="flex-direction: column; text-align: center;">
          <div class="kyc-alert-icon">&#9888;</div>
          <div class="kyc-alert-content">
            <h4>Complete Your KYC First</h4>
            <p>You need to verify your identity and set up a transaction PIN before performing transactions.</p>
            <button class="kyc-alert-btn" onclick="closeModal(); showSection('kyc');">
              Complete KYC Now
            </button>
          </div>
        </div>
      `);
      return;
    }

    document.getElementById('pinError').textContent = errorMsg || 'Incorrect PIN. Please try again.';
    document.getElementById('pinError').style.display = 'block';
    clearPinInputs(['verifyPin1', 'verifyPin2', 'verifyPin3', 'verifyPin4']);
    document.getElementById('verifyPin1').focus();
  }
}

// Check if user needs KYC before funding
function checkKycBeforeFunding() {
  if (userData && userData.kyc_status !== 'verified') {
    showModal('KYC Required', `
      <div class="kyc-alert" style="flex-direction: column; text-align: center;">
        <div class="kyc-alert-icon">&#9888;</div>
        <div class="kyc-alert-content">
          <h4>Complete Your KYC First</h4>
          <p>You need to verify your identity before you can fund your wallet.</p>
          <button class="kyc-alert-btn" onclick="closeModal(); showSection('kyc');">
            Complete KYC Now
          </button>
        </div>
      </div>
    `);
    return false;
  }
  return true;
}

// ============ UTILITY FUNCTIONS ============

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function showModal(title, content) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = content;
  document.getElementById('modal').classList.add('active');
}

function showTransactionSuccessModal(title, description, amount, type = 'debit') {
  const isDebit = type === 'debit';
  document.getElementById('modalTitle').textContent = 'Transaction Successful';
  document.getElementById('modalBody').innerHTML = `
    <div class="success-modal">
      <div class="success-icon">&#10003;</div>
      <h3>${title}</h3>
      <p class="text-muted">${description}</p>
      <div class="success-amount" style="color: ${isDebit ? '#EF4444' : '#10B981'};">
        ${isDebit ? '-' : '+'}₦${amount.toLocaleString()}
      </div>
      <p class="text-muted" style="margin-top: 0.5rem;">
        ${isDebit ? 'Debited from' : 'Credited to'} your wallet
      </p>
      <button class="btn btn-primary" onclick="closeModal()" style="margin-top: 1.5rem;">
        Continue
      </button>
    </div>
  `;
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// ============ TWO-FACTOR AUTHENTICATION ============

function toggle2FA() {
  const toggle = document.getElementById('twoFAToggle');
  const setupSection = document.getElementById('twoFASetupSection');

  if (toggle.checked) {
    setupSection.style.display = 'block';
    document.getElementById('twoFAStep1').style.display = 'block';
    document.getElementById('twoFAStep2').style.display = 'none';
    generate2FAKey();
    init2FAInputs();
  } else {
    const is2FAEnabled = localStorage.getItem('2fa_enabled') === 'true';
    if (is2FAEnabled) {
      if (confirm('Are you sure you want to disable 2FA? This will make your account less secure.')) {
        localStorage.removeItem('2fa_enabled');
        localStorage.removeItem('2fa_key');
        localStorage.removeItem('2fa_backup_codes');
        setupSection.style.display = 'none';
        showToast('2FA has been disabled', 'info');
      } else {
        toggle.checked = true;
      }
    } else {
      setupSection.style.display = 'none';
    }
  }
}

function generate2FAKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let key = 'BTRX';
  for (let i = 0; i < 3; i++) {
    key += '-';
    for (let j = 0; j < 4; j++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  }
  document.getElementById('twoFAManualKey').textContent = key;
  localStorage.setItem('2fa_pending_key', key);
}

function init2FAInputs() {
  const inputs = [];
  for (let i = 1; i <= 6; i++) {
    inputs.push(document.getElementById('twoFA' + i));
  }
  inputs.forEach((input, idx) => {
    input.value = '';
    if (!input._2faListenerAdded) {
      input.addEventListener('input', () => {
        input.value = input.value.replace(/\D/g, '');
        if (input.value.length === 1 && idx < 5) inputs[idx + 1].focus();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && idx > 0) inputs[idx - 1].focus();
      });
      input._2faListenerAdded = true;
    }
  });
}

function copy2FAKey() {
  const key = document.getElementById('twoFAManualKey').textContent;
  navigator.clipboard.writeText(key).then(() => showToast('Key copied!', 'success')).catch(() => showToast('Failed to copy', 'error'));
}

function verify2FACode() {
  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById('twoFA' + i).value;
  }
  if (code.length !== 6 || !/^\d{6}$/.test(code)) {
    showToast('Please enter a valid 6-digit code', 'error');
    return;
  }

  // Simulate verification
  const key = localStorage.getItem('2fa_pending_key');
  localStorage.setItem('2fa_enabled', 'true');
  localStorage.setItem('2fa_key', key);
  localStorage.removeItem('2fa_pending_key');

  // Generate backup codes
  const backupCodes = [];
  for (let i = 0; i < 8; i++) {
    let bc = '';
    for (let j = 0; j < 8; j++) {
      bc += Math.floor(Math.random() * 10);
    }
    backupCodes.push(bc.substring(0, 4) + '-' + bc.substring(4));
  }
  localStorage.setItem('2fa_backup_codes', JSON.stringify(backupCodes));

  const grid = document.getElementById('backupCodesGrid');
  grid.innerHTML = backupCodes.map(c => `<div class="backup-code">${c}</div>`).join('');

  document.getElementById('twoFAStep1').style.display = 'none';
  document.getElementById('twoFAStep2').style.display = 'block';
}

function copyBackupCodes() {
  const codes = JSON.parse(localStorage.getItem('2fa_backup_codes') || '[]');
  navigator.clipboard.writeText(codes.join('\n')).then(() => showToast('Backup codes copied!', 'success')).catch(() => showToast('Failed to copy', 'error'));
}

function finish2FASetup() {
  document.getElementById('twoFASetupSection').style.display = 'none';
  showToast('2FA setup complete!', 'success');
}

function load2FAStatus() {
  const is2FA = localStorage.getItem('2fa_enabled') === 'true';
  const toggle = document.getElementById('twoFAToggle');
  if (toggle) toggle.checked = is2FA;
}

// ============ DEVICE MANAGEMENT ============

function loadDevices() {
  const devices = getDeviceList();
  const container = document.getElementById('deviceList');
  if (!container) return;

  container.innerHTML = devices.map((d, i) => `
    <div class="settings-item device-item">
      <div style="display:flex; align-items:center; gap:0.75rem;">
        <div class="device-icon" style="color:${d.current ? '#10B981' : '#666'};">
          ${d.type === 'mobile'
            ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
            : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'}
        </div>
        <div>
          <div class="settings-item-title">${d.name}${d.current ? ' <span style="color:#10B981; font-size:0.7rem;">(This device)</span>' : ''}</div>
          <div class="settings-item-desc">${d.location} &bull; ${d.lastActive}</div>
        </div>
      </div>
      ${!d.current ? `<button class="btn btn-sm" style="color:#EF4444; font-size:0.7rem; padding:0.25rem 0.5rem; border:1px solid #EF4444; border-radius:6px; background:transparent;" onclick="removeDevice(${i})">Remove</button>` : ''}
    </div>
  `).join('');
}

function getDeviceList() {
  let devices = JSON.parse(localStorage.getItem('btrx_devices') || 'null');
  if (!devices) {
    devices = [
      { name: 'Android Phone', type: 'mobile', location: 'Lagos, Nigeria', lastActive: 'Now', current: true },
      { name: 'Chrome Browser', type: 'desktop', location: 'Lagos, Nigeria', lastActive: '2 hours ago', current: false },
    ];
    localStorage.setItem('btrx_devices', JSON.stringify(devices));
  }
  return devices;
}

function removeDevice(index) {
  if (!confirm('Remove this device? It will be logged out immediately.')) return;
  const devices = getDeviceList();
  if (devices[index] && !devices[index].current) {
    devices.splice(index, 1);
    localStorage.setItem('btrx_devices', JSON.stringify(devices));
    loadDevices();
    showToast('Device removed successfully', 'success');
  }
}

// ============ PRIVACY & POLICY ============

function showPrivacyPolicy() {
  showModal('Privacy Policy', `
    <div style="font-size:0.8rem; line-height:1.6; color:#aaa; max-height:60vh; overflow-y:auto;">
      <p><strong>Last Updated:</strong> January 2025</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">1. Information We Collect</h4>
      <p>We collect personal information you provide during registration (name, email, phone number), KYC documents (NIN/BVN), transaction data, and device information for security purposes.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">2. How We Use Your Information</h4>
      <p>Your information is used to provide and improve our services, process transactions, verify your identity, prevent fraud, and comply with regulatory requirements.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">3. Data Protection</h4>
      <p>We employ industry-standard encryption and security measures to protect your personal data. All financial transactions are encrypted end-to-end.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">4. Third-Party Sharing</h4>
      <p>We do not sell your personal data. We may share information with regulatory bodies as required by law, and with service providers who assist in operating our platform under strict confidentiality agreements.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">5. Your Rights</h4>
      <p>You have the right to access, correct, or delete your personal data. Contact bittrixservices001@gmail.com to exercise these rights.</p>
    </div>
  `);
}

function showTermsOfService() {
  showModal('Terms of Service', `
    <div style="font-size:0.8rem; line-height:1.6; color:#aaa; max-height:60vh; overflow-y:auto;">
      <p><strong>Effective Date:</strong> January 2025</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">1. Acceptance of Terms</h4>
      <p>By using Bittrixpay, you agree to these terms and conditions. If you do not agree, please do not use our services.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">2. Eligibility</h4>
      <p>You must be at least 18 years old and capable of forming a binding contract to use our services. KYC verification is required for full platform access.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">3. Account Security</h4>
      <p>You are responsible for maintaining the confidentiality of your account credentials. Enable 2FA for enhanced security. Report unauthorized access immediately.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">4. Transactions</h4>
      <p>All transactions are final once confirmed. Rates are subject to market fluctuations. We reserve the right to delay or refuse transactions that appear fraudulent.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">5. Prohibited Activities</h4>
      <p>Money laundering, fraud, terrorist financing, or any illegal activity through our platform is strictly prohibited and will result in immediate account termination and legal action.</p>
    </div>
  `);
}

function showDataPolicy() {
  showModal('Data Retention Policy', `
    <div style="font-size:0.8rem; line-height:1.6; color:#aaa; max-height:60vh; overflow-y:auto;">
      <p><strong>Last Updated:</strong> January 2025</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">1. Transaction Records</h4>
      <p>Transaction records are retained for a minimum of 7 years as required by financial regulations.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">2. Account Data</h4>
      <p>Your account data is retained for the duration of your account's existence and for 3 years after account closure.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">3. KYC Documents</h4>
      <p>KYC verification documents are securely stored for 5 years after the last transaction or account closure, whichever is later.</p>
      <h4 style="color:var(--text-primary, #1E293B); margin-top:1rem;">4. Data Deletion</h4>
      <p>You may request data deletion by contacting support. Note that certain data must be retained per regulatory requirements.</p>
    </div>
  `);
}

// ============ ABOUT ============

function showLicenses() {
  showModal('Open Source Licenses', `
    <div style="font-size:0.8rem; line-height:1.6; color:#aaa;">
      <p><strong>Capacitor</strong> - MIT License<br>Copyright (c) Ionic Team</p>
      <p style="margin-top:0.75rem;"><strong>sql.js</strong> - MIT License<br>Copyright (c) sql.js contributors</p>
      <p style="margin-top:0.75rem;"><strong>@capacitor-community/sqlite</strong> - MIT License<br>Copyright (c) Capacitor Community</p>
      <p style="margin-top:1rem; color:#666;">All trademarks and brand names belong to their respective owners.</p>
    </div>
  `);
}

// ============ HELP CENTER ============

function openLiveChat() {
  showToast('Live chat connecting...', 'info');
  setTimeout(() => {
    showModal('Live Chat', `
      <div style="text-align:center; padding:2rem 0;">
        <div style="width:48px;height:48px;border-radius:50%;background:#10B981;display:inline-flex;align-items:center;justify-content:center;margin-bottom:0.75rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h4>Support Agent</h4>
        <p class="text-muted" style="font-size:0.8rem; margin-top:0.5rem;">Our support team is available 24/7. You will be connected shortly.</p>
        <div style="margin-top:1.5rem;">
          <input type="text" id="chatMessage" class="modal-select" placeholder="Type your message..." style="width:100%; margin-bottom:0.5rem;">
          <button class="btn btn-primary" style="width:100%;" onclick="showToast('Message sent! An agent will respond shortly.', 'success'); closeModal();">Send Message</button>
        </div>
      </div>
    `);
  }, 500);
}

function openEmailSupport() {
  try {
    window.open('mailto:bittrixservices001@gmail.com?subject=Support Request', '_system');
  } catch (e) {
    showToast('Email: bittrixservices001@gmail.com', 'info');
  }
}

function reportBug() {
  showModal('Report a Problem', `
    <div class="kyc-form">
      <div class="form-group">
        <label>What happened?</label>
        <select id="bugCategory" class="modal-select">
          <option value="">Select category</option>
          <option value="transaction">Transaction Issue</option>
          <option value="login">Login Problem</option>
          <option value="payment">Payment Failed</option>
          <option value="ui">Display/UI Issue</option>
          <option value="other">Other</option>
        </select>
      </div>
      <div class="form-group">
        <label>Describe the problem</label>
        <textarea id="bugDescription" class="modal-textarea" rows="4" placeholder="Please describe what happened..."></textarea>
      </div>
      <button class="btn btn-primary" style="width:100%;" onclick="submitBugReport()">Submit Report</button>
    </div>
  `);
}

function submitBugReport() {
  const category = document.getElementById('bugCategory').value;
  const description = document.getElementById('bugDescription').value;
  if (!category || !description.trim()) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  closeModal();
  showToast('Report submitted! We will investigate shortly.', 'success');
}

// ============ FAQs ============

function toggleFAQ(element) {
  const isOpen = element.classList.contains('open');
  // Close all other FAQs
  document.querySelectorAll('.faq-item.open').forEach(item => {
    item.classList.remove('open');
  });
  if (!isOpen) {
    element.classList.add('open');
  }
}

async function logout() {
  try {
    AppDB.logout();
    window.location.href = 'login.html';
  } catch (error) {
    console.error('Logout failed:', error);
    window.location.href = 'login.html';
  }
}

// Close modal on outside click
['modal', 'fundModal', 'pinModal', 'bankModal'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', (e) => {
      if (e.target.id === id) {
        if (id === 'modal') closeModal();
        else if (id === 'fundModal') closeFundModal();
        else if (id === 'pinModal') closePinModal();
        else if (id === 'bankModal') closeBankModal();
      }
    });
  }
});
