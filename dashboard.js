// Dashboard JavaScript

// Global variables
let userData = null;
let cryptoRates = [];
let giftcardRates = [];
let socialAccounts = [];
let virtualNumbers = [];
let currentCryptoTradeType = 'buy';
let currentGiftcardTradeType = 'buy';
let pendingTransaction = null;
let savedBankAccounts = JSON.parse(localStorage.getItem('bankAccounts') || '[]');
let notificationSettings = JSON.parse(localStorage.getItem('notificationSettings') || '{"push":true,"email":true,"sms":false}');
let _listenersInitialized = {};
let _actionInProgress = false;

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

  const giftcardTabs = document.querySelectorAll('#giftcards-section .trade-tab');
  giftcardTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      giftcardTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentGiftcardTradeType = tab.dataset.type;
      document.getElementById('giftcardTradeBtn').textContent =
        currentGiftcardTradeType === 'buy' ? 'Buy Gift Card' : 'Sell Gift Card';
      updateGiftcardSummary();
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
              <div class="transaction-desc">${t.description}</div>
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
              <div class="transaction-desc">${t.description}</div>
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

async function loadGiftcardData() {
  try {
    giftcardRates = AppDB.getGiftCardRates();

    const select = document.getElementById('giftcardSelect');
    select.innerHTML = '<option value="">-- Select gift card --</option>' +
      giftcardRates.map(c => `<option value="${c.name}" data-buy="${c.buyRate}" data-sell="${c.sellRate}">${c.name}</option>`).join('');

    const listContainer = document.getElementById('giftcardList');
    listContainer.innerHTML = giftcardRates.map(c => `
      <div class="giftcard-item">
        <strong>${c.name}</strong>
        <div class="text-muted" style="font-size:0.75rem;">Buy: ₦${c.buyRate}/$ | Sell: ₦${c.sellRate}/$</div>
      </div>
    `).join('');

    if (!_listenersInitialized.giftcard) {
      select.addEventListener('change', updateGiftcardSummary);
      document.getElementById('giftcardValue').addEventListener('input', updateGiftcardSummary);
      _listenersInitialized.giftcard = true;
    }

  } catch (error) {
    console.error('Failed to load giftcard data:', error);
  }
}

function updateGiftcardSummary() {
  const select = document.getElementById('giftcardSelect');
  const value = parseFloat(document.getElementById('giftcardValue').value) || 0;
  const selectedOption = select.options[select.selectedIndex];

  const rate = currentGiftcardTradeType === 'buy'
    ? parseFloat(selectedOption?.dataset?.buy) || 0
    : parseFloat(selectedOption?.dataset?.sell) || 0;

  const total = rate * value;

  document.getElementById('giftcardRate').textContent = `₦${rate}/USD`;
  document.getElementById('giftcardTotal').textContent = `₦${total.toLocaleString()}`;
}

async function executeGiftcardTrade() {
  const select = document.getElementById('giftcardSelect');
  const value = parseFloat(document.getElementById('giftcardValue').value);
  const selectedOption = select.options[select.selectedIndex];

  if (!select.value || !value) {
    showToast('Please fill all fields', 'error');
    return;
  }

  const rate = currentGiftcardTradeType === 'buy'
    ? parseFloat(selectedOption.dataset.buy)
    : parseFloat(selectedOption.dataset.sell);

  const cardType = select.value;
  const nairaValue = value * rate;

  const tradeBtn = document.getElementById('giftcardTradeBtn');
  tradeBtn.disabled = true;

  openPinModal(async () => {
    try {
      const result = AppDB.tradeGiftCard(cardType, value, currentGiftcardTradeType, rate);

      showTransactionSuccessModal(
        currentGiftcardTradeType === 'buy' ? 'Gift Card Purchased!' : 'Gift Card Sold!',
        `${currentGiftcardTradeType === 'buy' ? 'Bought' : 'Sold'} $${value} ${cardType} gift card`,
        nairaValue,
        currentGiftcardTradeType === 'buy' ? 'debit' : 'credit'
      );
      loadUserProfile();
      loadTransactions();
      document.getElementById('giftcardValue').value = '';
    } catch (error) {
      showToast(error.message || 'Transaction failed', 'error');
    } finally {
      tradeBtn.disabled = false;
    }
  });
  // Re-enable if pin modal is cancelled
  setTimeout(() => { tradeBtn.disabled = false; }, 30000);
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
          <div class="bank-account-name">${bank.bankName}</div>
          <div class="bank-account-number">${bank.accountNumber} - ${bank.accountName}</div>
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

  if (accountNumber.length !== 10) {
    showToast('Account number must be 10 digits', 'error');
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

function openPinModal(transactionCallback) {
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
