import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
  Trash2,
  Unplug,
} from "lucide-react";
import {
  clearPlatformCredentials,
  getConnectedPlatforms,
  getPlatformConnectionIssues,
  savePlatformCredentials,
} from "./platform_credentials";
import {
  verifyAllPlatformConnections,
  verifyPlatformConnection,
} from "./platform_connection_service";
import { PLATFORM_CONNECTIONS } from "./platform_connection_catalog";

const emptyCredentials = {
  facebook_token: "",
  facebook_page_id: "",
  instagram_token: "",
  instagram_user_id: "",
  tiktok_token: "",
};

const CredentialHelpLink = ({ link }) => (
  <a
    href={link.href}
    target="_blank"
    rel="noopener noreferrer"
    className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-amber-300 transition hover:bg-amber-400/10 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
  >
    {link.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);

const PlatformConnections = ({
  credentials = emptyCredentials,
  initialVerification = {},
  onChange = () => undefined,
  onVerificationChange = () => undefined,
}) => {
  const [form, setForm] = useState({ ...emptyCredentials, ...credentials });
  const [notice, setNotice] = useState(null);
  const [checking, setChecking] = useState("");
  const [verification, setVerification] = useState(initialVerification);
  const [visibleTokens, setVisibleTokens] = useState({});

  const connected = useMemo(() => getConnectedPlatforms(form), [form]);
  const issues = useMemo(() => getPlatformConnectionIssues(form), [form]);
  const configuredCount = useMemo(
    () => Object.values(connected).filter(Boolean).length,
    [connected]
  );
  const verifiedCount = useMemo(
    () =>
      Object.entries(verification).filter(
        ([platform, result]) => connected[platform] && result?.ok
      ).length,
    [connected, verification]
  );

  const replaceVerification = (next) => {
    setVerification(next);
    onVerificationChange(next);
  };
  const updateVerification = (platform, result) => {
    const next = { ...verification };
    if (result) next[platform] = result;
    else delete next[platform];
    replaceVerification(next);
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    const platform = PLATFORM_CONNECTIONS.find(
      (item) => item.tokenKey === key || item.targetKey === key
    )?.id;
    if (platform) updateVerification(platform, null);
  };

  const save = () => {
    try {
      const saved = savePlatformCredentials(form);
      setForm(saved);
      onChange(saved);
      setNotice({
        type: "success",
        text: "Đã lưu cấu hình tài khoản trong phiên trình duyệt này.",
      });
      return saved;
    } catch (error) {
      setNotice({
        type: "error",
        text: error.message || "Không thể lưu thông tin kết nối.",
      });
      return null;
    }
  };

  const clear = () => {
    clearPlatformCredentials();
    setForm(emptyCredentials);
    replaceVerification({});
    onChange(emptyCredentials);
    setNotice({
      type: "success",
      text: "Đã xóa toàn bộ thông tin kết nối khỏi phiên trình duyệt.",
    });
  };

  const disconnect = (platform) => {
    const config = PLATFORM_CONNECTIONS.find((item) => item.id === platform);
    if (!config) return;
    const next = {
      ...form,
      [config.tokenKey]: "",
      ...(config.targetKey ? { [config.targetKey]: "" } : {}),
    };
    const saved = savePlatformCredentials(next);
    setForm(saved);
    updateVerification(platform, null);
    onChange(saved);
    setNotice({ type: "success", text: `Đã ngắt kết nối ${config.label}.` });
  };

  const verify = async (platform) => {
    setChecking(platform);
    setNotice(null);
    try {
      const result = await verifyPlatformConnection(platform, form);
      updateVerification(platform, result);
      setNotice({
        type: result.ok ? "success" : "error",
        text: result.ok
          ? `${
              PLATFORM_CONNECTIONS.find((item) => item.id === platform)?.label
            }: kết nối hợp lệ.`
          : result.message,
      });
      if (result.ok) save();
    } catch (error) {
      const result = {
        platform,
        ok: false,
        account: null,
        message: error?.message || "Không thể kiểm tra kết nối.",
        checkedAt: new Date().toISOString(),
      };
      updateVerification(platform, result);
      setNotice({ type: "error", text: result.message });
    } finally {
      setChecking("");
    }
  };

  const verifyAll = async () => {
    setChecking("all");
    setNotice(null);
    try {
      const results = await verifyAllPlatformConnections(form);
      const configuredPlatforms = PLATFORM_CONNECTIONS.filter(
        (platform) => connected[platform.id]
      );
      const configuredVerification = Object.fromEntries(
        configuredPlatforms.map((platform) => [
          platform.id,
          results[platform.id],
        ])
      );
      replaceVerification(configuredVerification);
      const configuredResults = configuredPlatforms.map(
        (platform) => results[platform.id]
      );
      const passed = configuredResults.filter((result) => result?.ok).length;
      const failed = configuredResults.length - passed;
      if (passed > 0) save();
      setNotice({
        type: failed ? "error" : "success",
        text: configuredResults.length
          ? `Đã kiểm tra ${
              configuredResults.length
            } tài khoản: ${passed} hợp lệ${
              failed ? `, ${failed} cần sửa` : ""
            }.`
          : "Chưa có tài khoản nào đủ cấu hình để kiểm tra.",
      });
    } catch (error) {
      setNotice({
        type: "error",
        text: error?.message || "Không thể kiểm tra toàn bộ kết nối.",
      });
    } finally {
      setChecking("");
    }
  };

  return (
    <section className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">
            Account Connection Center
          </p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">
            Kết nối tài khoản mạng xã hội
          </h2>
          <p className="mt-2 max-w-3xl text-gray-300">
            Thêm tài khoản dùng để đăng bài và kiểm tra kết nối ngay tại đây.
            Token chỉ được giữ trong sessionStorage và tự mất khi đóng phiên
            trình duyệt.
          </p>
          <p className="mt-2 text-sm text-gray-400">
            Đủ cấu hình: {configuredCount}/3 · Đã kiểm tra trong phiên:{" "}
            {verifiedCount}/{configuredCount}
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-sky-400/20 bg-sky-400/5 px-4 py-3 text-sm text-sky-100">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-sky-300"
            aria-hidden="true"
          />
          <div>
            <strong>
              Liên kết lấy ID/token mở trang chính thức trong trình duyệt.
            </strong>
            <p className="mt-1 text-sky-200/80">
              BOT ĐĂNG BÀI không gửi token, ID hoặc dữ liệu trong các ô nhập
              sang những liên kết này.
            </p>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              notice.type === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
            }`}
          >
            {notice.type === "error" ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORM_CONNECTIONS.map((platform) => {
            const isConnected = connected[platform.id];
            const result = verification[platform.id];
            return (
              <article
                key={platform.id}
                className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{platform.label}</h3>
                    <p
                      className={`mt-1 text-sm ${
                        isConnected ? "text-emerald-300" : "text-gray-500"
                      }`}
                    >
                      {isConnected
                        ? "Đủ cấu hình để sử dụng"
                        : "Chưa đủ cấu hình"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      result?.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                        : result && !result.ok
                        ? "border-red-500/30 bg-red-500/10 text-red-200"
                        : "border-white/10 bg-white/5 text-gray-400"
                    }`}
                  >
                    {result?.ok
                      ? "Đã kiểm tra"
                      : result
                      ? "Kiểm tra lỗi"
                      : "Chưa kiểm tra"}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <label
                        htmlFor={`${platform.id}-token`}
                        className="flex items-center gap-2 text-sm font-medium text-gray-200"
                      >
                        <KeyRound className="h-4 w-4" aria-hidden="true" />{" "}
                        {platform.tokenLabel}
                      </label>
                      <CredentialHelpLink link={platform.tokenHelp} />
                    </div>
                    <div className="relative">
                      <input
                        id={`${platform.id}-token`}
                        type={visibleTokens[platform.id] ? "text" : "password"}
                        autoComplete="off"
                        value={form[platform.tokenKey] || ""}
                        onChange={(event) =>
                          updateField(platform.tokenKey, event.target.value)
                        }
                        placeholder={platform.tokenPlaceholder}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 pr-11 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setVisibleTokens((current) => ({
                            ...current,
                            [platform.id]: !current[platform.id],
                          }))
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        aria-label={
                          visibleTokens[platform.id] ? "Ẩn token" : "Hiện token"
                        }
                      >
                        {visibleTokens[platform.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  {platform.targetKey && (
                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label
                          htmlFor={`${platform.id}-target`}
                          className="text-sm font-medium text-gray-200"
                        >
                          {platform.targetLabel}
                        </label>
                        <CredentialHelpLink link={platform.targetHelp} />
                      </div>
                      <input
                        id={`${platform.id}-target`}
                        value={form[platform.targetKey] || ""}
                        onChange={(event) =>
                          updateField(platform.targetKey, event.target.value)
                        }
                        placeholder={platform.targetPlaceholder}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                      />
                    </div>
                  )}
                </div>

                <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 text-sm open:border-amber-400/20">
                  <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300">
                    <BookOpen className="h-4 w-4" aria-hidden="true" /> Cách lấy
                    đúng token{platform.targetKey ? " & ID" : ""}
                  </summary>
                  <div className="border-t border-white/10 px-3 pb-3 pt-2 text-xs text-gray-300">
                    <ol className="list-decimal space-y-1.5 pl-4">
                      {platform.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                    {platform.query && (
                      <div className="mt-3 rounded-lg border border-purple-400/20 bg-purple-400/5 p-2">
                        <span className="block text-[11px] uppercase tracking-wide text-purple-300">
                          Truy vấn trong Graph API Explorer
                        </span>
                        <code className="mt-1 block break-all text-purple-100">
                          {platform.query}
                        </code>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <CredentialHelpLink link={platform.portal} />
                      <CredentialHelpLink link={platform.docs} />
                    </div>
                  </div>
                </details>

                {issues[platform.id]?.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
                    {issues[platform.id].join(" · ")}
                  </div>
                )}
                {result?.account && (
                  <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100">
                    <strong>
                      {result.account.name ||
                        result.account.username ||
                        result.account.id}
                    </strong>
                    {result.account.followers !== undefined && (
                      <span className="ml-2 text-emerald-300">
                        {result.account.followers} followers
                      </span>
                    )}
                  </div>
                )}
                {result && !result.ok && (
                  <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-100">
                    {result.message}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => verify(platform.id)}
                    disabled={
                      Boolean(checking) || issues[platform.id]?.length > 0
                    }
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-500 disabled:opacity-40"
                  >
                    {checking === platform.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}{" "}
                    Kiểm tra kết nối
                  </button>
                  <button
                    type="button"
                    onClick={() => disconnect(platform.id)}
                    disabled={
                      Boolean(checking) ||
                      (!form[platform.tokenKey] &&
                        !(platform.targetKey && form[platform.targetKey]))
                    }
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-40"
                  >
                    <Unplug className="h-4 w-4" /> Ngắt
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <button
            type="button"
            onClick={verifyAll}
            disabled={Boolean(checking) || configuredCount === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-semibold hover:bg-purple-500 disabled:opacity-40"
          >
            {checking === "all" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}{" "}
            Kiểm tra tất cả
          </button>
          <button
            type="button"
            onClick={save}
            disabled={Boolean(checking)}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-40"
          >
            <Save className="h-4 w-4" /> Lưu tất cả trong phiên
          </button>
          <button
            type="button"
            onClick={clear}
            disabled={Boolean(checking)}
            className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Xóa toàn bộ kết nối
          </button>
        </div>
      </div>
    </section>
  );
};

export default PlatformConnections;
