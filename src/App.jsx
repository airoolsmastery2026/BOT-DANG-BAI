import React, { useState } from 'react';
import {
  Activity,
  Bell,
  BriefcaseBusiness,
  ListChecks,
  MessageCircle,
  Send,
} from 'lucide-react';
import PostScheduler from './PostScheduler';
import ZaloControl from './ZaloControl';
import LinkedInControl from './LinkedInControl';
import SystemDashboard from './SystemDashboard';
import QueueMonitor from './QueueMonitor';
import NotificationCenter from './NotificationCenter';

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const [connectedPlatforms] = useState({
    facebook: false,
    instagram: false,
    tiktok: false,
  });

  const [apiCredentials] = useState({
    facebook_token: '',
    instagram_token: '',
    tiktok_token: '',
  });

  const tabs = [
    { id: 'dashboard', label: 'Tổng quan', icon: Activity },
    { id: 'scheduler', label: 'Đăng bài', icon: Send },
    { id: 'queue', label: 'Hàng đợi', icon: ListChecks },
    { id: 'zalo', label: 'Zalo OA', icon: MessageCircle },
    { id: 'linkedin', label: 'LinkedIn', icon: BriefcaseBusiness },
    { id: 'notifications', label: 'Thông báo', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <header className="max-w-7xl mx-auto px-4 pt-4 md:px-8">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Marketing Distribution Engine</p>
          <h1 className="mt-1 text-2xl font-bold text-white">BOT ĐĂNG BÀI</h1>
        </div>
        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Điều hướng chính">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`shrink-0 px-4 py-2.5 rounded-lg font-medium flex items-center gap-2 transition ${
                activeTab === id
                  ? 'bg-gray-800 text-white ring-1 ring-purple-500/60'
                  : 'bg-gray-900/50 text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" /> {label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {activeTab === 'dashboard' && <SystemDashboard onNavigate={setActiveTab} />}
        {activeTab === 'queue' && <QueueMonitor />}
        {activeTab === 'notifications' && <NotificationCenter />}

        {activeTab === 'scheduler' && (
          <div className="text-white p-4 md:p-8">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-bold mb-2">Đăng bài tự động</h2>
              <p className="text-gray-300 mb-8">Soạn nội dung, gắn liên kết về website, lên lịch và phân phối lên các nền tảng đã kết nối.</p>
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
