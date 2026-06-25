import { useEffect, useState, useCallback } from "react";
import { type Job, type JobState, PIPELINE, isTerminal } from "./job.js";

async function postJob(prompt: string, apiKey: string, baseUrl: string): Promise<Job> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, apiKey, baseUrl: baseUrl || undefined }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "failed to create job");
  return res.json();
}

async function fetchJob(id: string): Promise<Job> {
  const res = await fetch(`/api/jobs/${id}`);
  if (!res.ok) throw new Error("job not found");
  return res.json();
}

async function fetchJobs(): Promise<Job[]> {
  const res = await fetch("/api/jobs");
  return res.ok ? res.json() : [];
}

const STAGE_LABEL: Record<JobState, string> = {
  queued: "排队中",
  provisioning: "起容器",
  generating: "AI 生成中",
  building: "构建",
  capturing: "截图录像",
  done: "完成",
  failed: "失败",
  timeout: "超时",
};

// BYOK: the key is kept only in sessionStorage (cleared when the tab closes),
// never localStorage, and is sent per-job. The server holds it in memory only.
const KEY_STORAGE = "goldrush.anthropicKey";
const BASEURL_STORAGE = "goldrush.baseUrl";

export function App() {
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState(() => sessionStorage.getItem(KEY_STORAGE) ?? "");
  const [baseUrl, setBaseUrl] = useState(() => localStorage.getItem(BASEURL_STORAGE) ?? "");
  const [remember, setRemember] = useState(() => !!sessionStorage.getItem(KEY_STORAGE));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [active, setActive] = useState<Job | null>(null);
  const [gallery, setGallery] = useState<Job[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refreshGallery = useCallback(async () => {
    setGallery(await fetchJobs());
  }, []);

  useEffect(() => {
    void refreshGallery();
  }, [refreshGallery]);

  // Poll the active job until it reaches a terminal state.
  useEffect(() => {
    if (!activeId) return;
    let timer: number;
    const tick = async () => {
      try {
        const job = await fetchJob(activeId);
        setActive(job);
        if (isTerminal(job.state)) {
          void refreshGallery();
          return;
        }
      } catch {
        /* transient; keep polling */
      }
      timer = window.setTimeout(tick, 2000);
    };
    void tick();
    return () => window.clearTimeout(timer);
  }, [activeId, refreshGallery]);

  const submit = async () => {
    const p = prompt.trim();
    const k = apiKey.trim();
    const b = baseUrl.trim();
    if (!p || !k) return;
    // Persist the key for this tab session only if the user opted in.
    if (remember) sessionStorage.setItem(KEY_STORAGE, k);
    else sessionStorage.removeItem(KEY_STORAGE);
    // Base URL is not a secret; persist it across sessions for convenience.
    if (b) localStorage.setItem(BASEURL_STORAGE, b);
    else localStorage.removeItem(BASEURL_STORAGE);
    setSubmitting(true);
    setErr(null);
    try {
      const job = await postJob(p, k, b);
      setActiveId(job.id);
      setActive(job);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={{ margin: 0 }}>GoldRush Studio</h1>
        <p style={S.sub}>一句话 → 可玩的 Babylon.js 浏览器游戏</p>
      </header>

      <section style={S.card}>
        <label style={S.label} htmlFor="apiKey">
          Anthropic API Key
        </label>
        <input
          id="apiKey"
          type="password"
          style={S.input}
          placeholder="sk-ant-..."
          value={apiKey}
          autoComplete="off"
          onChange={(e) => setApiKey(e.target.value)}
        />
        <label style={S.checkboxRow}>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>在本标签页记住（关闭标签页即清除）</span>
        </label>

        <label style={{ ...S.label, marginTop: 14 }} htmlFor="baseUrl">
          中转站 / 自定义 Base URL（可选）
        </label>
        <input
          id="baseUrl"
          type="text"
          style={S.input}
          placeholder="https://your-relay.example/v1（留空走 Anthropic 官方）"
          value={baseUrl}
          autoComplete="off"
          onChange={(e) => setBaseUrl(e.target.value)}
        />

        <p style={S.keyNote}>
          用你自己的 key（BYOK）。它只用于本次生成、仅在内存中临时保存，
          不写入数据库、不落盘、不进日志，也不会出现在生成的游戏里。
          若你用第三方中转站，把它的 Base URL 填上即可。
        </p>

        <textarea
          style={S.textarea}
          placeholder="描述你想要的游戏，例如：a small low-poly kart racer with 3 laps"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button
          style={S.button}
          onClick={submit}
          disabled={submitting || !prompt.trim() || !apiKey.trim()}
        >
          {submitting ? "提交中…" : "生成游戏"}
        </button>
        {err && <div style={S.error}>{err}</div>}
      </section>

      {active && <ActivePanel job={active} />}

      <section>
        <h2 style={S.h2}>画廊</h2>
        {gallery.filter((j) => j.state === "done").length === 0 ? (
          <p style={S.muted}>还没有完成的游戏。提交一个 prompt 试试。</p>
        ) : (
          <div style={S.grid}>
            {gallery
              .filter((j) => j.state === "done")
              .map((j) => (
                <a key={j.id} href={j.gamePath ?? "#"} style={S.tile} target="_blank" rel="noreferrer">
                  {j.thumbnailPath ? (
                    <img src={j.thumbnailPath} alt={j.prompt} style={S.thumb} />
                  ) : (
                    <div style={{ ...S.thumb, ...S.thumbBlank }}>无缩略图</div>
                  )}
                  <div style={S.tilePrompt}>{j.prompt}</div>
                </a>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ActivePanel({ job }: { job: Job }) {
  const currentIdx = PIPELINE.indexOf(job.state);
  const failed = job.state === "failed" || job.state === "timeout";
  return (
    <section style={S.card}>
      <div style={S.activePrompt}>“{job.prompt}”</div>
      <div style={S.timeline}>
        {PIPELINE.map((stage, i) => {
          const reached = !failed && currentIdx >= i;
          const isCurrent = job.state === stage;
          return (
            <div key={stage} style={S.step}>
              <div
                style={{
                  ...S.dot,
                  background: reached ? "#2e7d32" : "#ccc",
                  outline: isCurrent ? "3px solid #a5d6a7" : "none",
                }}
              />
              <span style={S.stepLabel}>{STAGE_LABEL[stage]}</span>
            </div>
          );
        })}
      </div>

      {failed && (
        <div style={S.error}>
          {STAGE_LABEL[job.state]}：{job.error ?? "未知错误"}
        </div>
      )}

      {job.state === "done" && job.gamePath && (
        <div>
          <div style={S.row}>
            <a style={S.button} href={job.gamePath} target="_blank" rel="noreferrer">
              在新标签页打开游戏
            </a>
            <ShareLink path={job.gamePath} />
          </div>
          <iframe title="game" src={job.gamePath} style={S.iframe} />
        </div>
      )}

      {job.logTail && !failed && job.state !== "done" && (
        <details style={{ marginTop: 12 }}>
          <summary style={S.muted}>实时日志</summary>
          <pre style={S.log}>{job.logTail}</pre>
        </details>
      )}
    </section>
  );
}

function ShareLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}${path}`;
  return (
    <button
      style={{ ...S.button, background: "#455a64" }}
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? "已复制链接" : "复制分享链接"}
    </button>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { maxWidth: 860, margin: "0 auto", padding: 24, fontFamily: "system-ui, sans-serif", color: "#222" },
  header: { marginBottom: 20 },
  sub: { color: "#666", marginTop: 4 },
  card: { background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 12, padding: 20, marginBottom: 24 },
  label: { display: "block", fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 6 },
  input: { width: "100%", boxSizing: "border-box", fontSize: 14, padding: 10, borderRadius: 8, border: "1px solid #ccc", fontFamily: "ui-monospace, monospace" },
  checkboxRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#555", marginTop: 8 },
  keyNote: { fontSize: 12, color: "#888", lineHeight: 1.5, margin: "8px 0 16px" },
  textarea: { width: "100%", boxSizing: "border-box", fontSize: 15, padding: 10, borderRadius: 8, border: "1px solid #ccc", resize: "vertical" },
  button: { marginTop: 10, padding: "10px 18px", fontSize: 15, background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  error: { marginTop: 12, padding: 10, background: "#fdecea", color: "#b71c1c", borderRadius: 8, whiteSpace: "pre-wrap" },
  h2: { fontSize: 18 },
  muted: { color: "#888", fontSize: 14 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  tile: { border: "1px solid #e0e0e0", borderRadius: 10, overflow: "hidden", textDecoration: "none", color: "#222", background: "#fff" },
  thumb: { width: "100%", height: 140, objectFit: "cover", display: "block" },
  thumbBlank: { display: "flex", alignItems: "center", justifyContent: "center", background: "#eee", color: "#999" },
  tilePrompt: { padding: 10, fontSize: 13, lineHeight: 1.4 },
  activePrompt: { fontSize: 16, fontStyle: "italic", marginBottom: 16 },
  timeline: { display: "flex", justifyContent: "space-between", marginBottom: 8 },
  step: { display: "flex", flexDirection: "column", alignItems: "center", flex: 1 },
  dot: { width: 18, height: 18, borderRadius: "50%" },
  stepLabel: { fontSize: 12, marginTop: 6, color: "#555" },
  row: { display: "flex", gap: 10, alignItems: "center", marginBottom: 12 },
  iframe: { width: "100%", height: 480, border: "1px solid #ddd", borderRadius: 8, background: "#000" },
  log: { background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" },
};
