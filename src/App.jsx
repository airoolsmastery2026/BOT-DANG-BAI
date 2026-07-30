import React, { useState } from 'react';
import { Activity, Building2, BriefcaseBusiness, MessageCircle, Send, Users } from 'lucide-react';
import AdvancedCustomerFinder from './AdvancedCustomerFinder';
import PostScheduler from './PostScheduler';
import ZaloControl from './ZaloControl';
import LinkedInControl from './LinkedInControl';
import RealEstateDashboard from './RealEstateDashboard';
import SystemDashboard from './SystemDashboard';

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');

  const [connectedPlatforms, setConnectedPlatforms] = useState({
    facebook: false,
    instagram: false,
    tiktok: false,
  });

  const [apiCredentials, setApiCredentials] = useState({
    facebook_token: '',
    instagram_token: '',
    tiktok_token: '',
  });

  const tabs = [
    { id: 'dashboard', label: 'Tổng quan', icon: Activity },
    { id: 'finder', label: 'Tìm khách hàng', icon: Users },
    { id: 'scheduler', label: 'Đăng bài tự động', icon: Send },
    { id: 'zalo', label: 'Zalo OA', icon: MessageCircle },
    { id: 'linkedin', label: 'LinkedIn', icon: BriefcaseBusiness },
    { id: 'real-estate', label: 'Bất động sản', icon: Building2 },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-7xl mx-auto pt-4 px-4 md:px-8">
        <div className="flex flex-wrap gap-2 mb-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`px-5 py-2.5 rounded-t-lg font-medium flex items-center gap-2 transition ${
                activeTab === id ? 'bg-gray-800 text-white' : 'bg-gray-900/50 text-gray-400 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'dashboard' && <SystemDashboard onNavigate={setActiveTab} />}

      {activeTab === 'finder' && (
        <AdvancedCustomerFinder
          connectedPlatforms={connectedPlatforms}
          setConnectedPlatforms={setConnectedPlatforms}
          apiCredentials={apiCredentials}
          setApiCredentials={setApiCredentials}
        />
      )}

      {activeTab === 'scheduler' && (
        <div className="text-white p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-bold mb-2">📤 Đăng Bài Tự Động</h1>
            <p className="text-gray-300 mb-8">Bot viết bài, lên lịch, và tự động đăng lên các nền tảng đã kết nối</p>
            <PostScheduler connectedPlatforms={connectedPlatforms} apiCredentials={apiCredentials} />
          </div>
        </div>
      )}

      {activeTab === 'zalo' && <ZaloControl />}
      {activeTab === 'linkedin' && <LinkedInControl />}
      {activeTab === 'real-estate' && <RealEstateDashboard />}
    </div>
  );
};

export default App;
