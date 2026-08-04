import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  CalendarRange,
  Files,
  KeyRound,
  ListChecks,
  MessageCircle,
  Send,
  Sparkles,
} from 'lucide-react';
import PostScheduler from './PostScheduler';
import ZaloControl from './ZaloControl';
import LinkedInControl from './LinkedInControl';
import SystemDashboard from './SystemDashboard';
import QueueMonitor from './QueueMonitor';
import QueueRuntimeControls from './QueueRuntimeControls';
import NotificationCenter from './NotificationCenter';
import CampaignStudio from './CampaignStudio';
import CampaignDrafts from './CampaignDrafts';
import PlatformConnections from './PlatformConnections';
import ContentOperations from './ContentOperations';
import { getConnectedPlatforms, loadPlatformCredentials } from './platform_credentials';

const TAB_STORAGE_KEY = 'bot_dang_bai_active_tab';

const tabs = [
  { id: 'dashboard', label: 'Tổng quan', icon: Activity },
  { id: 'studio', label: 'AI Studio', icon: Sparkles },
  { id: 'planning', label: 'Kế hoạch', icon: CalendarRange },
  { id: 'drafts', label: 'Bản nháp', icon: Files },
  { id: 'scheduler', label: 'Đăng bài', icon: Send },
  { id: 'queue', label: 'Hàng đợi', icon: ListChecks },
  { id: 'connections', label: 'Kết nối', icon: KeyRound },
  { id: 'zalo', label: 'Zalo OA', icon: MessageCircle },
  { id: 'linkedin', label: 'LinkedIn', icon: BriefcaseBusiness },
  { id: 'notifications', label: 'Thông báo', icon: Bell },
];

const getInitialTab = () => {
  const validIds = new Set(tabs.map((tab) => tab.id));

  try {
    const hashTab = window.location.hash.replace(/^#\/?/, '');
    if (validIds.has(hashTab)) return hashTab;

    const storedTab = localStorage.getItem(TAB_STORAGE_KEY);
    if (validIds.has(storedTab)) return storedTab;
  } catch {
    // Fallback về dashboard khi môi trường không cho phép truy cập window/localStorage.
  }

  return 'dashboard';
};

const App = () => {
  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [apiCredentials, setApiCredentials] = useState(loadPlatformCredentials);
  const [queueRefreshKey, setQueueRefreshKey] = useState(0);

  const connectedPlatforms = useMemo(
    () => getConnectedPlatforms(apiCredentials),
    [apiCredentials],
  );

  useEffect(() => {
    try {
      localStorage.setItem(TAB_STORAGE_KEY, activeTab);
      const nextHash = `#/${activeTab}`;
      if (window.location.hash !== nextHash) {
        window.history.replaceState(null, '', nextHash);
      }
    } catch {
      // Điều hướng vẫn hoạt động trong phiên hiện tại nếu trình duyệt chặn lưu trữ.
    }
  }, [activeTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextTab = window.location.hash.replace(/^#\/?/, '');
      if (tabs.some((tab) => tab.id === nextTab)) setActiveTab(nextTab);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || 'Tổng quan';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900 focus:shadow-lg"
      >
        Bỏ qua điều hướng
      </a>

      <header className="mx-auto max-w-7xl px-4 pt-4 md:px-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Marketing Distribution Engine</p>
          <h1 className="mt-1 text-2xl font-bold text-white">BOT ĐĂNG BÀI</h1>
          <p className="mt-1 text-sm text-gray-400" aria-live="polite">Đang mở: {activeTabLabel}</p>
        </div>

        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Điều hướng chính">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              aria-controls="main-content"
              className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
                activeTab === id
                  ? 'bg-gray-800 text-white ring-1 ring-purple-500/60'
                  : 'bg-gray-900/50 text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main id="main-content" tabIndex="-1">
        {activeTab === 'dashboard' && <SystemDashboard onNavigate={setActiveTab} />}
        {activeTab === 'studio' && <CampaignStudio />}
        {activeTab === 'planning' && <ContentOperations onNavigate={setActiveTab} />}
        {activeTab === 'drafts' && <CampaignDrafts onNavigate={setActiveTab} />}
        {activeTab === 'queue' && (
          <>
            <QueueRuntimeControls
              apiCredentials={apiCredentials}
              onQueueChanged={() => setQueueRefreshKey((value) => value + 1)}
            />
            <QueueMonitor key={queueRefreshKey} apiCredentials={apiCredentials} />
          </>
        )}
        {activeTab === 'connections' && (
          <PlatformConnections credentials={apiCredentials} onChange={setApiCredentials} />
        )}
        {activeTab === 'notifications' && <NotificationCenter />}

        {activeTab === 'scheduler' && (
          <div className="p-4 text-white md:p-8">
            <div className="mx-auto max-w-7xl">
              <h2 className="mb-2 text-3xl font-bold md:text-4xl">Đăng bài tự động</h2>
              <p className="mb-8 text-gray-300">Soạn nội dung, gắn liên kết về website, lên lịch và phân phối lên các nền tảng đã kết nối.</p>
              <PostScheduler connectedPlatforms={connectedPlatforms} apiCredentials={apiCredentials} />
            </div>
          </div>
        )}

        {activeTab === 'zalo' && <ZaloControl />}
        {activeTab === 'linkedin' && <LinkedInControl />}
      </main>
    </div>
  );
};

export default App;
