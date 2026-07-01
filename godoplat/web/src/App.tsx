import { useEffect, useState, useCallback } from "react";
import { type Job, type JobState, PIPELINE, isTerminal } from "./job.js";

async function postJob(
  prompt: string,
  apiKey: string,
  baseUrl: string,
  gameType: string,
): Promise<Job> {
  const res = await fetch("/api/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, apiKey, baseUrl: baseUrl || undefined, gameType }),
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

// One-click starter prompts so non-coders aren't staring at a blank box.
const BABYLON_EXAMPLES: { label: string; prompt: string }[] = [
  { label: "卡丁车", prompt: "a small low-poly kart racer with 3 laps and a lap timer" },
  { label: "打砖块", prompt: "a colorful breakout game: paddle, ball, rows of bricks, score" },
  { label: "贪吃蛇", prompt: "a 3D snake game on a grid; eat food to grow, game over on self-collision" },
  { label: "平台跳跃", prompt: "a simple 3D platformer: run and jump across floating platforms to a goal flag" },
  { label: "太空射击", prompt: "a top-down space shooter: move a ship, shoot incoming asteroids, score counter" },
];
const ONCHAIN_EXAMPLES: { label: string; prompt: string }[] = [
  { label: "井字棋", prompt: "a two-player tic-tac-toe game fully on chain" },
  { label: "四子棋", prompt: "a Connect Four game on chain: two players drop tokens, detect 4-in-a-row" },
  { label: "石头剪刀布", prompt: "an on-chain rock-paper-scissors with commit-reveal for two players" },
];

// BYOK: the key is kept only in sessionStorage (cleared when the tab closes),
// never localStorage, and is sent per-job. The server holds it in memory only.
const KEY_STORAGE = "goldrush.anthropicKey";
const BASEURL_STORAGE = "goldrush.baseUrl";

export function App() {
  const [prompt, setPrompt] = useState("");
  const [gameType, setGameType] = useState<"babylon" | "onchain">("babylon");
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
      const job = await postJob(p, k, b, gameType);
      setActiveId(job.id);
      setActive(job);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  // Iterative edit: submit a follow-up job that refines an existing game.
  // Reuses the current key/baseUrl/engine; the change is described in plain text.
  const submitEdit = async (parentJobId: string, editPrompt: string) => {
    const k = apiKey.trim();
    const e = editPrompt.trim();
    if (!k || !e) return;
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: e,
          apiKey: k,
          baseUrl: baseUrl.trim() || undefined,
          gameType,
          parentJobId,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "failed to submit edit");
      const job = (await res.json()) as Job;
      setActiveId(job.id);
      setActive(job);
    } catch (err) {
      setErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={S.page}>
      <header style={S.header}>
        <h1 style={{ margin: 0 }}>GoldRush Studio</h1>
        <p style={S.sub}>一句话生成可玩游戏 · 不会写代码也能做 · 生成后用大白话继续改</p>
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

        <details style={S.help}>
          <summary style={S.helpSummary}>第一次用？怎么获取 / 填写 key</summary>
          <div style={S.helpBody}>
            <p style={S.helpP}>
              这里需要一个 <b>Anthropic API key</b>（生成游戏时调用 Claude 用的，费用走你自己的账号）。
            </p>
            <ol style={S.helpList}>
              <li>
                官方：登录{" "}
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">
                  console.anthropic.com
                </a>{" "}
                → API Keys → Create Key，复制 <code>sk-ant-…</code> 填到上面。
              </li>
              <li>
                用第三方中转站：把中转站给你的 key 填上面，并在下方「中转站 / Base URL」填它的地址。
              </li>
            </ol>
            <p style={S.helpP}>
              放心：key 只用于本次生成、仅存在浏览器和服务器内存里，<b>不会上传、不写数据库、不进日志</b>。
            </p>
          </div>
        </details>

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

        <div style={S.engineRow}>
          <button
            type="button"
            style={gameType === "babylon" ? S.engineOn : S.engineOff}
            onClick={() => setGameType("babylon")}
          >
            网页游戏 (Babylon.js)
          </button>
          <button
            type="button"
            style={gameType === "onchain" ? S.engineOn : S.engineOff}
            onClick={() => setGameType("onchain")}
            title="实验中：需要额外的链上沙箱镜像，尚未随平台默认提供"
          >
            链上游戏 (Solidity) · 实验
          </button>
        </div>
        <p style={S.keyNote}>
          {gameType === "onchain"
            ? "链上游戏（实验）：规则/状态/胜负写进 Solidity 合约。目前需要单独构建链上沙箱镜像才能跑通，平台默认镜像不含它——先了解方向即可，建议用「网页游戏」体验完整流程。"
            : "网页游戏：纯浏览器 Babylon.js 3D 游戏，支持实时玩法。"}
        </p>

        <div style={S.exampleRow}>
          <span style={S.exampleHint}>不知道写什么？点一个试试：</span>
          {(gameType === "onchain" ? ONCHAIN_EXAMPLES : BABYLON_EXAMPLES).map((ex) => (
            <button
              key={ex.label}
              type="button"
              style={S.exampleChip}
              onClick={() => setPrompt(ex.prompt)}
              title={ex.prompt}
            >
              {ex.label}
            </button>
          ))}
        </div>

        <textarea
          style={S.textarea}
          placeholder={
            gameType === "onchain"
              ? "描述一个回合制链上游戏，例如：a tic-tac-toe game on chain"
              : "描述你想要的游戏，例如：a small low-poly kart racer with 3 laps"
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <button
          style={S.button}
          onClick={submit}
          disabled={submitting || !prompt.trim() || !apiKey.trim() || gameType === "onchain"}
        >
          {submitting ? "提交中…" : gameType === "onchain" ? "链上模式暂不可用" : "生成游戏"}
        </button>
        {err && <div style={S.error}>{err}</div>}
      </section>

      {active && <ActivePanel job={active} onEdit={submitEdit} editing={submitting} />}

      <section>
        <h2 style={S.h2}>画廊</h2>
        {gallery.filter((j) => j.state === "done").length === 0 ? (
          <div style={S.empty}>
            <div style={S.emptyIcon}>🎮</div>
            <p style={S.emptyTitle}>还没有游戏</p>
            <p style={S.muted}>
              在上面填好 key、点一个示例（或自己写一句），点「生成游戏」——
              做好的游戏会出现在这里，可以直接玩、分享、或继续修改。
            </p>
          </div>
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

function ActivePanel({
  job,
  onEdit,
  editing,
}: {
  job: Job;
  onEdit: (parentJobId: string, editPrompt: string) => void;
  editing: boolean;
}) {
  const [editPrompt, setEditPrompt] = useState("");
  const currentIdx = PIPELINE.indexOf(job.state);
  const failed = job.state === "failed" || job.state === "timeout";
  const running = !failed && job.state !== "done";

  // Live elapsed timer while running — reassures the user it isn't stuck.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [running]);
  const elapsedS = Math.max(0, Math.floor((now - job.createdAt) / 1000));
  const elapsedText = `${Math.floor(elapsedS / 60)} 分 ${elapsedS % 60} 秒`;
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

      {running && (
        <div style={S.elapsed}>
          已生成 <b>{elapsedText}</b> · AI 写游戏通常要 15–20 分钟,请耐心等,别关页面
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

          <div style={S.editBox}>
            <div style={S.editTitle}>不满意？用一句话继续改：</div>
            <textarea
              style={S.textarea}
              placeholder="例如：把车改成红色 / 加一个跳跃 / 背景换成夜晚"
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
              rows={2}
            />
            <button
              style={S.button}
              disabled={editing || !editPrompt.trim()}
              onClick={() => {
                onEdit(job.id, editPrompt);
                setEditPrompt("");
              }}
            >
              {editing ? "提交中…" : "继续修改"}
            </button>
          </div>
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
  help: { marginTop: 10, fontSize: 13 },
  helpSummary: { cursor: "pointer", color: "#3949ab", userSelect: "none" },
  helpBody: { marginTop: 8, padding: 12, background: "#f5f6ff", border: "1px solid #e0e3f5", borderRadius: 8, color: "#444" },
  helpP: { margin: "6px 0", lineHeight: 1.6 },
  helpList: { margin: "6px 0", paddingLeft: 20, lineHeight: 1.7 },
  keyNote: { fontSize: 12, color: "#888", lineHeight: 1.5, margin: "8px 0 16px" },
  engineRow: { display: "flex", gap: 8, marginBottom: 4 },
  exampleRow: { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", margin: "4px 0 10px" },
  exampleHint: { fontSize: 13, color: "#888" },
  exampleChip: { padding: "5px 12px", fontSize: 13, borderRadius: 999, border: "1px solid #c5cae9", background: "#f5f6ff", color: "#3949ab", cursor: "pointer" },
  engineOn: { flex: 1, padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "2px solid #2e7d32", background: "#e8f5e9", color: "#1b5e20", cursor: "pointer", fontWeight: 600 },
  engineOff: { flex: 1, padding: "9px 12px", fontSize: 14, borderRadius: 8, border: "1px solid #ccc", background: "#fff", color: "#555", cursor: "pointer" },
  textarea: { width: "100%", boxSizing: "border-box", fontSize: 15, padding: 10, borderRadius: 8, border: "1px solid #ccc", resize: "vertical" },
  button: { marginTop: 10, padding: "10px 18px", fontSize: 15, background: "#2e7d32", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", textDecoration: "none", display: "inline-block" },
  error: { marginTop: 12, padding: 10, background: "#fdecea", color: "#b71c1c", borderRadius: 8, whiteSpace: "pre-wrap" },
  h2: { fontSize: 18 },
  muted: { color: "#888", fontSize: 14 },
  empty: { textAlign: "center", padding: "36px 20px", background: "#fafafa", border: "1px dashed #ddd", borderRadius: 12 },
  elapsed: { marginTop: 10, padding: "8px 12px", background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, fontSize: 13, color: "#6d4c41" },
  emptyIcon: { fontSize: 40, lineHeight: 1 },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: "#555", margin: "10px 0 4px" },
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
  editBox: { marginTop: 16, padding: 14, background: "#f1f8e9", border: "1px solid #c5e1a5", borderRadius: 10 },
  editTitle: { fontSize: 14, fontWeight: 600, color: "#33691e", marginBottom: 8 },
  log: { background: "#1e1e1e", color: "#d4d4d4", padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 240, overflow: "auto", whiteSpace: "pre-wrap" },
};
