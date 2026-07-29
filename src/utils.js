/**
 * Utilities Functions cho Customer Finder Application
 */

// ============= STORAGE FUNCTIONS =============

export const saveToLocalStorage = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Error saving to localStorage:', error);
    return false;
  }
};

export const getFromLocalStorage = (key, defaultValue = null) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error('Error reading from localStorage:', error);
    return defaultValue;
  }
};

export const removeFromLocalStorage = (key) => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Error removing from localStorage:', error);
    return false;
  }
};

// ============= CUSTOMER MANAGEMENT =============

export const saveCustomer = (customer) => {
  const savedCustomers = getFromLocalStorage('saved_customers', []);
  if (!savedCustomers.find(c => c.id === customer.id)) {
    savedCustomers.push({ ...customer, savedDate: new Date().toISOString() });
    saveToLocalStorage('saved_customers', savedCustomers);
    return true;
  }
  return false;
};

export const getSavedCustomers = () => getFromLocalStorage('saved_customers', []);

export const removeCustomer = (customerId) => {
  const savedCustomers = getFromLocalStorage('saved_customers', []);
  const filtered = savedCustomers.filter(c => c.id !== customerId);
  saveToLocalStorage('saved_customers', filtered);
  return true;
};

export const searchSavedCustomers = (query) => {
  const customers = getSavedCustomers();
  const lowerQuery = query.toLowerCase();
  return customers.filter(c =>
    (c.name || '').toLowerCase().includes(lowerQuery) ||
    (c.description || '').toLowerCase().includes(lowerQuery)
  );
};

// ============= VALIDATION FUNCTIONS =============

export const validateAccessToken = (token) => {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token không hợp lệ' };
  }
  if (token.trim().length < 20) {
    return { valid: false, error: 'Token quá ngắn' };
  }
  return { valid: true };
};

export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

// ============= CALCULATION FUNCTIONS =============

export const calculateEngagementRate = (followers, interactions) => {
  if (!followers) return '0.00';
  return ((interactions / followers) * 100).toFixed(2);
};

export const calculateMatchScore = (customer, criteria = {}) => {
  let score = 50;
  const { minFollowers = 1000, minEngagement = 5, preferredKeywords = [] } = criteria;

  if (customer.followers >= minFollowers * 2) {
    score += 25;
  } else if (customer.followers >= minFollowers) {
    score += 15;
  }

  const engagement = parseFloat(calculateEngagementRate(customer.followers, customer.interactions || 0));
  if (engagement >= minEngagement * 1.5) {
    score += 25;
  } else if (engagement >= minEngagement) {
    score += 15;
  }

  if (preferredKeywords.length > 0) {
    const description = (customer.description || '').toLowerCase();
    const matched = preferredKeywords.filter(kw => description.includes(kw.toLowerCase()));
    if (matched.length > 0) {
      score += Math.min(matched.length * 5, 10);
    }
  }

  return Math.min(Math.round(score), 100);
};

export const calculateTotalEngagement = (interactions) =>
  (interactions.likes || 0) + (interactions.comments || 0) + (interactions.shares || 0);

// ============= FORMATTING FUNCTIONS =============

export const formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
};

export const formatDate = (dateInput) => {
  const date = new Date(dateInput);
  return date.toLocaleDateString('vi-VN', { year: 'numeric', month: 'long', day: 'numeric' });
};

export const formatRelativeTime = (dateString) => {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + ' năm trước';

  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + ' tháng trước';

  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + ' ngày trước';

  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + ' giờ trước';

  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + ' phút trước';

  return 'vừa mới';
};

// ============= FILTERING FUNCTIONS =============

export const filterCustomers = (customers, filters = {}) => {
  return customers.filter(customer => {
    if (filters.minFollowers && customer.followers < filters.minFollowers) return false;

    if (filters.minEngagement) {
      const engagement = parseFloat(calculateEngagementRate(customer.followers, customer.interactions || 0));
      if (engagement < filters.minEngagement) return false;
    }

    if (filters.platforms && filters.platforms.length > 0) {
      if (!filters.platforms.includes(customer.platform)) return false;
    }

    if (filters.locations && filters.locations.length > 0) {
      if (!filters.locations.includes(customer.location)) return false;
    }

    if (filters.keywords && filters.keywords.length > 0) {
      const description = (customer.description || '').toLowerCase();
      const hasKeyword = filters.keywords.some(kw => description.includes(kw.toLowerCase()));
      if (!hasKeyword) return false;
    }

    return true;
  });
};

export const sortCustomers = (customers, sortBy = 'matchScore') => {
  const sorted = [...customers];
  switch (sortBy) {
    case 'followers':
      sorted.sort((a, b) => b.followers - a.followers);
      break;
    case 'engagement':
      sorted.sort((a, b) => {
        const aEng = parseFloat(calculateEngagementRate(a.followers, a.interactions || 0));
        const bEng = parseFloat(calculateEngagementRate(b.followers, b.interactions || 0));
        return bEng - aEng;
      });
      break;
    case 'matchScore':
      sorted.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'recent':
      sorted.sort((a, b) => new Date(b.lastPost || 0).getTime() - new Date(a.lastPost || 0).getTime());
      break;
    default:
      break;
  }
  return sorted;
};

// ============= EXPORT FUNCTIONS =============

export const exportToCSV = (customers) => {
  const headers = ['Tên', 'Nền tảng', 'Followers', 'Engagement (%)', 'Địa điểm', 'URL', 'Match Score'];
  const rows = customers.map(c => [
    c.name,
    c.platform,
    c.followers,
    calculateEngagementRate(c.followers, c.interactions || 0),
    c.location,
    c.url || c.page_url,
    c.matchScore || 0,
  ]);

  const csvContent = [headers.join(','), ...rows.map(row => row.map(cell => `"${cell ?? ''}"`).join(','))].join('\n');

  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customers_${Date.now()}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
};

export const exportToJSON = (customers) => {
  const jsonContent = JSON.stringify(customers, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `customers_${Date.now()}.json`;
  a.click();
  window.URL.revokeObjectURL(url);
};

// ============= NOTIFICATION FUNCTIONS =============

export const showNotification = (message, type = 'info') => {
  console.log(`[${type.toUpperCase()}] ${message}`);
};

export const showError = (error) => {
  showNotification(error?.message || 'Có lỗi xảy ra', 'error');
};

export const showSuccess = (message) => {
  showNotification(message, 'success');
};

// ============= API HELPER FUNCTIONS =============

export const fetchWithRetry = async (url, options = {}, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return response;
    } catch (error) {
      console.warn(`Attempt ${i + 1} failed:`, error);
      if (i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
};

export const fetchJSON = async (url, options = {}) => {
  const response = await fetchWithRetry(url, options);
  return response.json();
};

// ============= RATE LIMITING =============

export const createRateLimiter = (maxRequests, timeWindow) => {
  let requests = [];
  return {
    isAllowed: () => {
      const now = Date.now();
      requests = requests.filter(time => now - time < timeWindow);
      if (requests.length < maxRequests) {
        requests.push(now);
        return true;
      }
      return false;
    },
    getRemainingRequests: () => {
      const now = Date.now();
      requests = requests.filter(time => now - time < timeWindow);
      return maxRequests - requests.length;
    },
    reset: () => {
      requests = [];
    },
  };
};

export default {
  saveToLocalStorage,
  getFromLocalStorage,
  removeFromLocalStorage,
  saveCustomer,
  getSavedCustomers,
  removeCustomer,
  searchSavedCustomers,
  validateAccessToken,
  isValidUrl,
  isValidEmail,
  calculateEngagementRate,
  calculateMatchScore,
  calculateTotalEngagement,
  formatNumber,
  formatDate,
  formatRelativeTime,
  filterCustomers,
  sortCustomers,
  exportToCSV,
  exportToJSON,
  showNotification,
  showError,
  showSuccess,
  fetchWithRetry,
  fetchJSON,
  createRateLimiter,
};
