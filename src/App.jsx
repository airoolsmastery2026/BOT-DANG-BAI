import React, { useState } from 'react';
import { Users, Send } from 'lucide-react';
import AdvancedCustomerFinder from './AdvancedCustomerFinder';
import PostScheduler from './PostScheduler';

const App = () => {
  const [activeTab, setActiveTab] = useState('finder');

  // Trạng thái kết nối nền tảng được chia sẻ giữa 2 tab
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="max-w-7xl mx-auto pt-4 px-4 md:px-8">
        <div className="flex gap-2 mb-2">
          <button
            onClick={() => setActiveTab('finder')}
            className={`px-5 py-2.5 rounded-t-lg font-medium flex items-center gap-2 transition ${
              activeTab === 'finder' ? 'bg-gray-800 text-white' : 'bg-gray-900/50 text-gray-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" /> Tìm khách hàng
          </button>
          <button
            onClick={() => setActiveTab('scheduler')}
            className={`px-5 py-2.5 rounded-t-lg font-medium flex items-center gap-2 transition ${
              activeTab === 'scheduler' ? 'bg-gray-800 text-white' : 'bg-gray-900/50 text-gray-400 hover:text-white'
            }`}
          >
            <Send className="w-4 h-4" /> Đăng bài tự động
          </button>
        </div>
      </div>

      {activeTab === 'finder' ? (
        <AdvancedCustomerFinder
          connectedPlatforms={connectedPlatforms}
          setConnectedPlatforms={setConnectedPlatforms}
          apiCredentials={apiCredentials}
          setApiCredentials={setApiCredentials}
        />
      ) : (
        <div className="text-white p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-4xl font-bold mb-2">📤 Đăng Bài Tự Động</h1>
            <p className="text-gray-300 mb-8">Bot viết bài, lên lịch, và tự động đăng lên các nền tảng đã kết nối</p>
            <PostScheduler connectedPlatforms={connectedPlatforms} apiCredentials={apiCredentials} />
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
