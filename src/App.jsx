import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Bell,
  Bot,
  BriefcaseBusiness,
  CalendarRange,
  Files,
  Inbox,
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
import AIOrchestration from './AIOrchestration';
import DhpMediaInbox from './DhpMediaInbox';
import { getConnectedPlatforms, loadPlatformCredentials } from './platform_credentials';

const TAB_STORAGE_KEY = 'bot_dang_bai_active_tab';

const tabs = [
  { id: 'dashboard', label: 'Tổng quan', icon: Activity },
  { id: 'orchestration', label: 'AI Điều phối', icon: Bot },
  { id: 'studio', label: 'AI Studio', icon: Sparkles },
  { id: 'planning', label: 'Kế hoạch', icon: CalendarRange },
  { id: 'drafts', label: 'Bản nháp', icon: Files },
  { id: 'media-inbox', label: 'DHP Inbox', icon: Inbox },
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
      if (window.location.hash !== nextHash) window.history.replaceState(null, '', nextHash);
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
    <div className="dhp-app min-h-screen">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900 focus:shadow-lg">
        Bỏ qua điều hướng
      </a>

      <header className="dhp-header sticky top-0 z-40 border-b border-amber-400/10 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-4 md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="dhp-eyebrow">Đại Hải Phát · Social Content AI</p>
              <div className="mt-1 flex items-center gap-3">
                <div className="dhp-logo-mark">DHP</div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-white md:text-2xl">BOT ĐĂNG BÀI</h1>
                  <p className="mt-0.5 text-xs text-slate-400" aria-live="polite">Đang mở: {activeTabLabel}</p>
                </div>
              </div>
            </div>

            <nav className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Điều hướng chính">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={activeTab === id ? 'page' : undefined}
                  aria-controls="main-content"
                  className={`dhp-nav-item flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${activeTab === id ? 'dhp-nav-active' : ''}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </nav>
          </div>
        </div>
      </header>

      <main id="main-content" tabIndex="-1">
        {activeTab === 'dashboard' && <SystemDashboard onNavigate={setActiveTab} />}
        {activeTab === 'orchestration' && <AIOrchestration />}
        {activeTab === 'studio' && <CampaignStudio />}
        {activeTab === 'planning' && <ContentOperations onNavigate={setActiveTab} />}
        {activeTab === 'drafts' && <CampaignDrafts onNavigate={setActiveTab} />}
        {activeTab === 'media-inbox' && (
          <DhpMediaInbox
            connectedPlatforms={connectedPlatforms}
            onQueueChanged={() => setQueueRefreshKey((value) => value + 1)}
          />
        )}
        {activeTab === 'queue' && (
          <>
            <QueueRuntimeControls apiCredentials={apiCredentials} onQueueChanged={() => setQueueRefreshKey((value) => value + 1)} />
            <QueueMonitor key={queueRefreshKey} apiCredentials={apiCredentials} />
          </>
        )}
        {activeTab === 'connections' && <PlatformConnections credentials={apiCredentials} onChange={setApiCredentials} />}
        {activeTab === 'notifications' && <NotificationCenter />}

        {activeTab === 'scheduler' && (
          <div className="dhp-page p-4 text-white md:p-8">
            <div className="mx-auto max-w-7xl">
              <p className="dhp-eyebrow">Publishing workspace</p>
              <h2 className="mb-2 mt-2 text-3xl font-bold tracking-tight md:text-4xl">Đăng bài tự động</h2>
              <p className="mb-8 text-slate-400">Soạn nội dung, gắn liên kết về website, lên lịch và phân phối lên các nền tảng đã kết nối.</p>
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
