import React, { useMemo, useState } from 'react';
import { BriefcaseBusiness, Clock, Send, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'linkedin_scheduled_posts';
const SETTINGS_KEY = 'linkedin_settings';

const loadJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
};

const LinkedInControl = () => {
  const saved = useMemo(() => loadJson(SETTINGS_KEY, { accessToken: '', authorUrn: '', apiVersion: '202605' }), []);
  const [accessToken, setAccessToken] = useState(saved.accessToken);
  const [authorUrn, setAuthorUrn] = useState(saved.authorUrn);
  const [apiVersion, setApiVersion] = useState(saved.apiVersion);
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [posts, setPosts] = useState(() => loadJson(STORAGE_KEY, []));
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);

  const persistPosts = (next) => {
    setPosts(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const saveSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ accessToken: accessToken.trim(), authorUrn: authorUrn.trim(), apiVersion: apiVersion.trim() }));
    setNotice({ type: 'success', text: 'Đã lưu cấu hình LinkedIn trong trình duyệt hiện tại.' });
  };

  const publish = async (post) => {
    if (!accessToken.trim() || !authorUrn.trim()) throw new Error('Thiếu Access Token hoặc author URN.');
    const response = await fetch('https://api.linkedin.com/rest/posts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'Linkedin-Version': apiVersion.trim() || '202605',
      },
      body: JSON.stringify({
        author: authorUrn.trim(),
        commentary: post.content,
        visibility: 'PUBLIC',
        distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
        lifecycleState: 'PUBLISHED',
        isReshareDisabledByAuthor: false,
      }),
    });
    const body = await response.text();
    if (!response.ok) throw new Error(body || `LinkedIn API HTTP ${response.status}`);
    return { success: true, postId: response.headers.get('x-restli-id') || null };
  };

  const addPost = async (sendNow) => {
    if (!content.trim()) return setNotice({ type: 'error', text: 'Nội dung bài viết không được để trống.' });
    if (!sendNow && !scheduledTime) return setNotice({ type: 'error', text: 'Hãy chọn thời gian đăng.' });
    const post = {
      id: `linkedin_${Date.now()}`,
      content: content.trim(),
      scheduledTime: sendNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };
    const next = [post, ...posts];
    persistPosts(next);
    setContent('');
    if (!sendNow) return setNotice({ type: 'success', text: 'Đã thêm bài LinkedIn vào hàng đợi cục bộ.' });

    setSending(true);
    try {
      const result = await publish(post);
      persistPosts(next.map((item) => item.id === post.id ? { ...item, status: 'published', result, publishedAt: new Date().toISOString() } : item));
      setNotice({ type: 'success', text: 'Đã gửi bài lên LinkedIn.' });
    } catch (error) {
      persistPosts(next.map((item) => item.id === post.id ? { ...item, status: 'failed', error: error.message } : item));
      setNotice({ type: 'error', text: error.message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3"><BriefcaseBusiness /> LinkedIn</h1>
          <p className="text-gray-300">Soạn, đăng và lưu hàng đợi nội dung LinkedIn cho cá nhân hoặc Company Page.</p>
        </div>

        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-100">
          Cần OAuth và quyền phù hợp như <code>w_member_social</code> hoặc quyền đăng thay mặt tổ chức. Bản frontend này chỉ phù hợp kiểm thử; production phải giữ token ở backend.
        </div>

        {notice && <div className={`border rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>{notice.text}</div>}

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Cấu hình kết nối</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="LinkedIn Access Token" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input value={authorUrn} onChange={(e) => setAuthorUrn(e.target.value)} placeholder="urn:li:person:... hoặc urn:li:organization:..." className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input value={apiVersion} onChange={(e) => setApiVersion(e.target.value)} placeholder="LinkedIn-Version, VD 202605" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          </div>
          <button onClick={saveSettings} className="mt-4 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Lưu cấu hình</button>
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Soạn bài chuyên nghiệp</h2>
          <textarea rows="7" value={content} onChange={(e) => setContent(e.target.value)} placeholder="Nội dung LinkedIn, case study, dự án, tuyển dụng..." className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <button onClick={() => addPost(false)} disabled={sending} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2"><Clock className="w-4 h-4" /> Lên lịch</button>
            <button onClick={() => addPost(true)} disabled={sending} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2"><Send className="w-4 h-4" /> Đăng ngay</button>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">Hàng đợi và lịch sử ({posts.length})</h2>
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div><p className="whitespace-pre-wrap text-sm">{post.content}</p><p className="text-xs text-gray-400 mt-2">{new Date(post.scheduledTime).toLocaleString('vi-VN')} · {post.status}</p>{post.error && <p className="text-xs text-red-400 mt-1">{post.error}</p>}</div>
                <button onClick={() => persistPosts(posts.filter((item) => item.id !== post.id))} className="text-red-400"><Trash2 className="w-5 h-5" /></button>
              </div>
            ))}
            {posts.length === 0 && <p className="text-sm text-gray-400">Chưa có bài LinkedIn.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default LinkedInControl;
