import React, { useState, useEffect, useMemo } from 'react';
import {
  Settings, RefreshCw, CheckCircle, AlertCircle, Loader,
  TrendingUp, Users, X, Download, Bookmark, BookmarkCheck,
} from 'lucide-react';
import { CustomerSearchEngine } from './api_handler';
import {
  saveCustomer, getSavedCustomers, removeCustomer,
  validateAccessToken, calculateEngagementRate, formatNumber,
  exportToCSV, exportToJSON, filterCustomers, sortCustomers,
} from './utils';

const PLATFORM_LABELS = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

const DEMO_CUSTOMERS = {
  facebook: [
    {
      id: 'fb_demo_1', name: 'Cơ khí Việt Nam 24/7', platform: 'Facebook',
      followers: 45230, interactions: 3844, lastPost: 'Bây giờ',
      description: 'Cung cấp linh kiện cơ khí chất lượng cao, giao hàng toàn quốc',
      location: 'TP.HCM', avatar: '🏭', page_url: 'facebook.com/cokhivietnam',
    },
    {
      id: 'fb_demo_2', name: 'Thiết kế Nội thất XYZ', platform: 'Facebook',
      followers: 32150, interactions: 2315, lastPost: '30 phút trước',
      description: 'Thiết kế và thi công nội thất cao cấp cho nhà ở và công ty',
      location: 'Hà Nội', avatar: '🛋️', page_url: 'facebook.com/designxyz',
    },
  ],
  instagram: [
    {
      id: 'ig_demo_1', name: 'mechanical_parts_asia', platform: 'Instagram',
      followers: 67890, interactions: 8350, lastPost: '2 giờ trước',
      description: 'Nhập khẩu và phân phối linh kiện cơ khí Châu Á',
      location: 'TP.HCM', avatar: '⚙️', page_url: 'instagram.com/mechanical_parts_asia',
    },
    {
      id: 'ig_demo_2', name: 'modern.furniture.design', platform: 'Instagram',
      followers: 89450, interactions: 13150, lastPost: '1 giờ trước',
      description: 'Nội thất hiện đại, tủ bếp, phòng ngủ cao cấp',
      location: 'TP.HCM', avatar: '🪑', page_url: 'instagram.com/modern.furniture.design',
    },
  ],
  tiktok: [
    {
      id: 'tt_demo_1', name: 'cnc_viet_nam', platform: 'TikTok',
      followers: 234100, interactions: 43310, lastPost: '30 phút trước',
      description: 'Cắt gọt CNC, gia công cơ khí chính xác, sản xuất theo yêu cầu',
      location: 'Thái Nguyên', avatar: '🔧', page_url: 'tiktok.com/@cnc_viet_nam',
    },
    {
      id: 'tt_demo_2', name: 'kitchen_design_vn', platform: 'TikTok',
      followers: 156800, interactions: 33400, lastPost: '1 giờ trước',
      description: 'Thiết kế tủ bếp, cải tạo phòng bếp, thi công nhanh',
      location: 'TP.HCM', avatar: '🍳', page_url: 'tiktok.com/@kitchen_design_vn',
    },
  ],
};

const ALL_LOCATIONS = ['Hà Nội', 'TP.HCM', 'Đà Nẵng', 'Thái Nguyên', 'Cần Thơ', 'Hải Phòng'];

const AdvancedCustomerFinder = ({
  connectedPlatforms, setConnectedPlatforms, apiCredentials, setApiCredentials,
}) => {
  const [searchConfig, setSearchConfig] = useState({
    keywords: ['cơ khí', 'nội thất'],
    minFollowers: 1000,
    minEngagement: 5,
    locations: ['Hà Nội', 'TP.HCM', 'Đà Nẵng'],
  });

  const [keywordInput, setKeywordInput] = useState('');
  const [autoSearchActive, setAutoSearchActive] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [savedIds, setSavedIds] = useState(() => new Set(getSavedCustomers().map(c => c.id)));
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [tokenError, setTokenError] = useState('');
  const [showSettings, setShowSettings] = useState(true);
  const [showCredentials, setShowCredentials] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const isAnyConnected = Object.values(connectedPlatforms).some(Boolean);

  const stats = useMemo(() => {
    const total = customers.length;
    const qualityScore = total > 0
      ? Math.round(customers.reduce((sum, c) => sum + (c.matchScore || 0), 0) / total)
      : 0;
    return { totalFound: total, qualityScore };
  }, [customers]);

  const connectPlatform = (platform) => {
    setTokenError('');
    setShowCredentials(platform);
  };

  const savePlatformToken = (platform, token) => {
    const validation = validateAccessToken(token);
    if (!validation.valid) {
      setTokenError(validation.error);
      return;
    }
    setApiCredentials(prev => ({ ...prev, [`${platform}_token`]: token.trim() }));
    setConnectedPlatforms(prev => ({ ...prev, [platform]: true }));
    setShowCredentials(false);
    setTokenError('');
  };

  const disconnectPlatform = (platform) => {
    setConnectedPlatforms(prev => ({ ...prev, [platform]: false }));
    setApiCredentials(prev => ({ ...prev, [`${platform}_token`]: '' }));
  };

  const addKeyword = () => {
    const value = keywordInput.trim();
    if (value && !searchConfig.keywords.includes(value)) {
      setSearchConfig(prev => ({ ...prev, keywords: [...prev.keywords, value] }));
    }
    setKeywordInput('');
  };

  const removeKeyword = (kw) => {
    setSearchConfig(prev => ({ ...prev, keywords: prev.keywords.filter(k => k !== kw) }));
  };

  const toggleLocation = (loc) => {
    setSearchConfig(prev => ({
      ...prev,
      locations: prev.locations.includes(loc)
        ? prev.locations.filter(l => l !== loc)
        : [...prev.locations, loc],
    }));
  };

  const performSearch = async () => {
    setLoading(true);
    setErrors([]);

    let rawResults = [];

    // Dùng API thật nếu có ít nhất một token; nếu không, dùng dữ liệu demo
    // để bạn xem trước giao diện hoạt động ra sao.
    const hasRealToken = Object.values(apiCredentials).some(t => t && t.length > 0);

    if (hasRealToken) {
      const engine = new CustomerSearchEngine(apiCredentials);
      const results = await engine.searchAllPlatforms(searchConfig.keywords, {
        searchFacebook: connectedPlatforms.facebook,
        searchInstagram: connectedPlatforms.instagram,
        searchTikTok: connectedPlatforms.tiktok,
        limit: 50,
      });
      rawResults = results.merged;
      if (results.errors?.length) setErrors(results.errors);
    } else {
      Object.entries(connectedPlatforms).forEach(([platform, connected]) => {
        if (connected) rawResults.push(...(DEMO_CUSTOMERS[platform] || []));
      });
      // Giả lập độ trễ mạng cho chế độ demo
      await new Promise(resolve => setTimeout(resolve, 1200));
    }

    const withScores = rawResults.map(c => ({
      ...c,
      matchScore: c.matchScore ?? Math.min(
        100,
        50
        + (c.followers >= searchConfig.minFollowers * 2 ? 25 : c.followers >= searchConfig.minFollowers ? 15 : 0)
        + (parseFloat(calculateEngagementRate(c.followers, c.interactions || 0)) >= searchConfig.minEngagement ? 20 : 0)
      ),
    }));

    const filtered = filterCustomers(withScores, {
      minFollowers: searchConfig.minFollowers,
      minEngagement: searchConfig.minEngagement,
      locations: searchConfig.locations,
    });

    setCustomers(sortCustomers(filtered, 'matchScore'));
    setLoading(false);
  };

  const handleSaveCustomer = (customer) => {
    const wasSaved = saveCustomer(customer);
    if (wasSaved) {
      setSavedIds(prev => new Set(prev).add(customer.id));
    } else {
      removeCustomer(customer.id);
      setSavedIds(prev => {
        const next = new Set(prev);
        next.delete(customer.id);
        return next;
      });
    }
  };

  // Auto-search every 5 minutes while active
  useEffect(() => {
    let interval;
    if (autoSearchActive && isAnyConnected) {
      performSearch();
      interval = setInterval(performSearch, 300000);
    }
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearchActive, connectedPlatforms]);

  const savedCustomers = getSavedCustomers();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-5xl font-bold mb-2">🔍 Tìm Kiếm Khách Hàng Tự Động</h1>
            <p className="text-gray-300 text-lg">Kết nối với các nền tảng mạng xã hội để tìm và lọc khách hàng tiềm năng</p>
          </div>
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg font-medium flex items-center gap-2"
          >
            <Bookmark className="w-4 h-4" />
            Đã lưu ({savedCustomers.length})
          </button>
        </div>

        {!isAnyConnected && (
          <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-4 mb-6 text-sm text-yellow-200">
            Chưa có token nào được nhập → ứng dụng đang chạy ở <strong>chế độ demo</strong> (dữ liệu mẫu) khi bạn kết nối một nền tảng mà không dán token thật.
          </div>
        )}

        {/* Saved Customers Panel */}
        {showSaved && (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Khách hàng đã lưu</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => exportToCSV(savedCustomers)}
                  disabled={savedCustomers.length === 0}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> CSV
                </button>
                <button
                  onClick={() => exportToJSON(savedCustomers)}
                  disabled={savedCustomers.length === 0}
                  className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> JSON
                </button>
              </div>
            </div>
            {savedCustomers.length === 0 ? (
              <p className="text-gray-400 text-sm">Chưa lưu khách hàng nào.</p>
            ) : (
              <ul className="divide-y divide-gray-700">
                {savedCustomers.map(c => (
                  <li key={c.id} className="py-2 flex items-center justify-between text-sm">
                    <span>{c.avatar} {c.name} — {c.platform}</span>
                    <button
                      onClick={() => { removeCustomer(c.id); setSavedIds(prev => { const n = new Set(prev); n.delete(c.id); return n; }); setShowSaved(false); setTimeout(() => setShowSaved(true), 0); }}
                      className="text-red-400 hover:text-red-300"
                    >
                      Xóa
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Platform Connection Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {['facebook', 'instagram', 'tiktok'].map((platform) => (
            <div
              key={platform}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold capitalize">{PLATFORM_LABELS[platform]}</h3>
                  <p className="text-gray-400 text-sm">Nền tảng mạng xã hội</p>
                </div>
                {connectedPlatforms[platform] ? (
                  <CheckCircle className="w-6 h-6 text-green-400" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-yellow-400" />
                )}
              </div>

              {connectedPlatforms[platform] ? (
                <div className="flex gap-2">
                  <button
                    disabled
                    className="flex-1 bg-green-600 py-2 rounded-lg font-medium cursor-default"
                  >
                    ✓ Đã kết nối
                  </button>
                  <button
                    onClick={() => disconnectPlatform(platform)}
                    className="bg-gray-700 hover:bg-gray-600 px-3 rounded-lg"
                    title="Ngắt kết nối"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => connectPlatform(platform)}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-medium transition"
                >
                  Kết nối ngay
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Credentials Dialog */}
        {showCredentials && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Kết nối {PLATFORM_LABELS[showCredentials]}</h2>
              <p className="text-gray-300 mb-4 text-sm">
                Nhập Access Token từ {PLATFORM_LABELS[showCredentials]} API (xem SETUP_GUIDE.md):
              </p>
              <textarea
                placeholder={`Dán ${PLATFORM_LABELS[showCredentials]} Access Token ở đây... (để trống = chạy chế độ demo)`}
                className="w-full bg-gray-700 border border-gray-600 rounded p-3 text-white mb-2 text-sm"
                rows="4"
                id="token-input"
              />
              {tokenError && <p className="text-red-400 text-sm mb-2">{tokenError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    const tokenInput = document.getElementById('token-input');
                    const token = tokenInput instanceof HTMLTextAreaElement ? tokenInput.value : '';
                    if (!token.trim()) {
                      // Cho phép kết nối "demo" không cần token thật
                      setConnectedPlatforms(prev => ({ ...prev, [showCredentials]: true }));
                      setShowCredentials(false);
                      setTokenError('');
                      return;
                    }
                    savePlatformToken(showCredentials, token);
                  }}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded-lg font-medium"
                >
                  Lưu Token
                </button>
                <button
                  onClick={() => { setShowCredentials(false); setTokenError(''); }}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 py-2 rounded-lg font-medium"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Settings */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700 mb-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Settings className="w-6 h-6" />
              Cấu hình Tìm kiếm
            </h2>
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="text-gray-400 hover:text-white text-xl w-8 h-8 flex items-center justify-center"
            >
              {showSettings ? '−' : '+'}
            </button>
          </div>

          {showSettings && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Keywords */}
              <div>
                <label className="block text-sm font-medium mb-2">Từ khóa tìm kiếm</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {searchConfig.keywords.map((kw, idx) => (
                    <span key={idx} className="bg-purple-600 pl-3 pr-2 py-1 rounded-full text-sm flex items-center gap-1">
                      {kw}
                      <button onClick={() => removeKeyword(kw)} className="hover:text-red-300">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={keywordInput}
                    onChange={(e) => setKeywordInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
                    placeholder="Thêm từ khóa rồi nhấn Enter"
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm"
                  />
                  <button
                    onClick={addKeyword}
                    className="bg-purple-600 hover:bg-purple-700 px-4 rounded text-sm font-medium"
                  >
                    Thêm
                  </button>
                </div>
              </div>

              {/* Min Followers */}
              <div>
                <label className="block text-sm font-medium mb-2">Số followers tối thiểu</label>
                <input
                  type="number"
                  min="0"
                  value={searchConfig.minFollowers}
                  onChange={(e) => setSearchConfig({ ...searchConfig, minFollowers: parseInt(e.target.value, 10) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>

              {/* Min Engagement */}
              <div>
                <label className="block text-sm font-medium mb-2">Engagement rate tối thiểu (%)</label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={searchConfig.minEngagement}
                  onChange={(e) => setSearchConfig({ ...searchConfig, minEngagement: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white"
                />
              </div>

              {/* Locations */}
              <div>
                <label className="block text-sm font-medium mb-2">Địa điểm</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_LOCATIONS.map((loc, idx) => (
                    <button
                      key={idx}
                      onClick={() => toggleLocation(loc)}
                      className={`px-3 py-1 rounded-full text-sm transition ${
                        searchConfig.locations.includes(loc)
                          ? 'bg-blue-600'
                          : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Control Panel */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          {/* Auto Search Toggle */}
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center gap-3">
              <div
                className={`w-14 h-8 rounded-full cursor-pointer transition ${
                  autoSearchActive ? 'bg-green-600' : 'bg-gray-600'
                }`}
                onClick={() => setAutoSearchActive(!autoSearchActive)}
              >
                <div
                  className={`w-6 h-6 bg-white rounded-full m-1 transition ${
                    autoSearchActive ? 'translate-x-6' : ''
                  }`}
                />
              </div>
              <div>
                <p className="font-medium">Tìm kiếm tự động</p>
                <p className="text-xs text-gray-400">Cứ 5 phút</p>
              </div>
            </div>
          </div>

          {/* Manual Search Button */}
          <button
            onClick={performSearch}
            disabled={loading || !isAnyConnected}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:from-gray-600 disabled:to-gray-600 rounded-lg p-4 font-bold flex items-center justify-center gap-2 transition"
          >
            {loading ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Đang tìm kiếm...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Tìm kiếm ngay
              </>
            )}
          </button>

          {/* Stats Cards */}
          <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-lg p-4 border border-blue-700">
            <p className="text-gray-400 text-sm">Tổng tìm thấy</p>
            <p className="text-3xl font-bold">{stats.totalFound}</p>
          </div>

          <div className="bg-gradient-to-br from-green-900 to-green-800 rounded-lg p-4 border border-green-700">
            <p className="text-gray-400 text-sm">Điểm chất lượng</p>
            <p className="text-3xl font-bold">{stats.qualityScore}%</p>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg p-4 mb-8 text-sm text-red-200">
            {errors.map((err, idx) => (
              <p key={idx}>⚠️ {err.platform}: {err.message}</p>
            ))}
          </div>
        )}

        {/* Results Section */}
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Users className="w-6 h-6" />
              Khách hàng tìm thấy ({customers.length})
            </h2>
            {customers.length > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={() => exportToCSV(customers)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> CSV
                </button>
                <button
                  onClick={() => exportToJSON(customers)}
                  className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded text-sm flex items-center gap-1"
                >
                  <Download className="w-4 h-4" /> JSON
                </button>
              </div>
            )}
          </div>

          {customers.length === 0 ? (
            <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-12 text-center border border-gray-700">
              <TrendingUp className="w-16 h-16 mx-auto text-gray-600 mb-4" />
              <p className="text-gray-400 text-lg">
                {isAnyConnected
                  ? 'Nhấn "Tìm kiếm ngay" để khám phá khách hàng tiềm năng'
                  : 'Hãy kết nối ít nhất một nền tảng để bắt đầu'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {customers.map((customer) => (
                <div key={customer.id} className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg overflow-hidden border border-gray-700 hover:border-purple-500 transition">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-4">
                    <div className="flex items-start justify-between">
                      <span className="text-4xl">{customer.avatar || '👤'}</span>
                      <div className="bg-white bg-opacity-20 px-3 py-1 rounded-full">
                        <p className="text-sm font-bold">{customer.matchScore}% Match</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4">
                    <h3 className="text-lg font-bold mb-1">{customer.name}</h3>
                    <p className="text-purple-400 text-sm mb-2">{customer.platform}</p>
                    <p className="text-gray-300 text-sm mb-4 line-clamp-2">{customer.description}</p>

                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-700 p-2 rounded text-center">
                        <p className="font-bold">{formatNumber(customer.followers)}</p>
                        <p className="text-xs text-gray-400">Followers</p>
                      </div>
                      <div className="bg-gray-700 p-2 rounded text-center">
                        <p className="font-bold">{calculateEngagementRate(customer.followers, customer.interactions || 0)}%</p>
                        <p className="text-xs text-gray-400">Engagement</p>
                      </div>
                      <div className="bg-gray-700 p-2 rounded text-center">
                        <p className="font-bold text-xs">{customer.location || '—'}</p>
                        <p className="text-xs text-gray-400">Địa điểm</p>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <a
                        href={customer.url || `https://${customer.page_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-purple-600 hover:bg-purple-700 py-2 rounded text-center text-sm font-medium transition"
                      >
                        Xem trang
                      </a>
                      <button
                        onClick={() => handleSaveCustomer(customer)}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 py-2 rounded text-sm font-medium transition flex items-center justify-center gap-1"
                      >
                        {savedIds.has(customer.id) ? (
                          <><BookmarkCheck className="w-4 h-4" /> Đã lưu</>
                        ) : (
                          <><Bookmark className="w-4 h-4" /> Lưu</>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-2">🔐 Bảo mật API</h3>
            <p className="text-gray-400 text-sm">Token chỉ được lưu trong bộ nhớ trình duyệt của bạn (localStorage/state), không gửi lên máy chủ nào khác ngoài API chính thức của từng nền tảng.</p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-2">⚡ Cập nhật tự động</h3>
            <p className="text-gray-400 text-sm">Bật "Tìm kiếm tự động" để dữ liệu được làm mới mỗi 5 phút.</p>
          </div>
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700">
            <h3 className="text-lg font-bold mb-2">📊 Phân tích nâng cao</h3>
            <p className="text-gray-400 text-sm">Đánh giá chất lượng và tiềm năng của mỗi khách hàng qua Match Score.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdvancedCustomerFinder;
