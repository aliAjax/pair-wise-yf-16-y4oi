import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import {
  Action,
  Board,
  BoardStatus,
  BOARD_TYPES,
  STATUS_LABEL,
  ShopState,
  WAX_TYPES,
  resetStorage,
  useShop,
  validateBatch,
} from "./store";

type Dispatch = React.Dispatch<Action>;
interface PanelProps {
  state: ShopState;
  dispatch: Dispatch;
}

const fmtTime = (ts: number) => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

function StatusBadge({ status }: { status: BoardStatus }) {
  return <span className={`badge ${status}`}>{STATUS_LABEL[status]}</span>;
}

/* ---------------- 指标 ---------------- */

function Metrics({ state }: { state: ShopState }) {
  const open = state.boards.filter((b) => b.status !== "done");
  const avgEdge = state.boards.length
    ? (state.boards.reduce((s, b) => s + b.sideEdge, 0) / state.boards.length).toFixed(1)
    : "0";
  const items: [string, string][] = [
    ["待维护", String(open.length)],
    ["完工工单", String(state.boards.length - open.length)],
    ["平均刃角", `${avgEdge}°`],
    ["底板修补", String(state.boards.filter((b) => b.baseDamage).length)],
  ];
  return (
    <section className="metrics">
      {items.map(([label, value]) => (
        <article key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
        </article>
      ))}
    </section>
  );
}

/* ---------------- 接批台 ---------------- */

function IntakePanel({ state, dispatch }: PanelProps) {
  const pendingCustomers = useMemo(
    () => [...new Set(state.boards.filter((b) => b.status === "pending").map((b) => b.customer))],
    [state.boards]
  );
  const [customer, setCustomer] = useState("");
  const active = pendingCustomers.includes(customer) ? customer : pendingCustomers[0] ?? "";
  const candidates = state.boards.filter((b) => b.customer === active && b.status === "pending");
  const [picked, setPicked] = useState<string[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setPicked(null);
    setErrors([]);
    setNotice("");
  }, [active]);

  const selected = picked ?? candidates.map((c) => c.id);

  const toggle = (id: string) => {
    setNotice("");
    setErrors([]);
    setPicked((prev) => {
      const cur = prev ?? candidates.map((c) => c.id);
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  };

  const submit = () => {
    const errs = validateBatch(state, active, selected);
    if (errs.length > 0) {
      // 整批拒绝：队列和原工单不变
      setErrors(errs);
      setNotice("");
      return;
    }
    dispatch({ type: "ACCEPT_BATCH", customer: active, boardIds: selected });
    setErrors([]);
    setNotice(`已接批 ${selected.length} 块雪板（${active}），批次进入队列`);
    setPicked(null);
  };

  return (
    <aside className="panel intake">
      <h2>客户接批台</h2>
      <p className="hint">一次只接同一客户尚未完工的雪板；有底板损伤的必须填写修补位置，否则整批拒绝。</p>

      {pendingCustomers.length === 0 ? (
        <p className="empty">暂无待接批雪板</p>
      ) : (
        <>
          <label>
            <span>客户</span>
            <select value={active} onChange={(e) => setCustomer(e.target.value)}>
              {pendingCustomers.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>

          <div className="candidates">
            {candidates.map((b) => {
              const missing = b.baseDamage && b.repairSpots.length === 0;
              return (
                <label key={b.id} className={`candidate${missing ? " danger" : ""}`}>
                  <input
                    type="checkbox"
                    checked={selected.includes(b.id)}
                    onChange={() => toggle(b.id)}
                  />
                  <span>
                    <b>{b.id}</b> · {b.brand} {b.length}cm · {b.boardType}
                    {b.baseDamage && (
                      <em>{missing ? "⚠ 底板损伤，缺修补位置" : `损伤修补：${b.repairSpots.join("、")}`}</em>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          {errors.length > 0 && (
            <div className="error-box">
              <b>整批拒绝 · 队列与工单未变动</b>
              <ul>
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {notice && <div className="notice-box">{notice}</div>}

          <button className="primary block" onClick={submit}>
            接批（{selected.length} 块）
          </button>
        </>
      )}

      <h3 className="sub">批次队列</h3>
      <div className="batch-list">
        {state.batches.length === 0 && <p className="empty">尚无批次</p>}
        {[...state.batches].reverse().map((b) => (
          <div key={b.id} className="batch-item">
            <b>{b.id}</b>
            <span>{b.customer} · {b.boardIds.length} 块 · {fmtTime(b.createdAt)}</span>
            <small>{b.boardIds.join("、")}</small>
          </div>
        ))}
      </div>
    </aside>
  );
}

/* ---------------- 工单队列（完工筛选） ---------------- */

const FILTERS: { key: BoardStatus | "all"; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待接批" },
  { key: "active", label: "维护中" },
  { key: "recheck", label: "待复检" },
  { key: "done", label: "已完工" },
];

function QueuePanel({ state, dispatch }: PanelProps) {
  const [filter, setFilter] = useState<BoardStatus | "all">("all");
  const boards = state.boards.filter((b) => filter === "all" || b.status === filter);

  return (
    <section className="panel queue">
      <div className="heading">
        <div>
          <p>维护工单列表</p>
          <h2>工单队列</h2>
        </div>
      </div>
      <div className="chips">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={filter === f.key ? "chip on" : "chip"}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
            <i>{f.key === "all" ? state.boards.length : state.boards.filter((b) => b.status === f.key).length}</i>
          </button>
        ))}
      </div>

      <div className="records">
        {boards.length === 0 && <p className="empty">该状态下没有工单</p>}
        {boards.map((b) => (
          <article key={b.id} className="board-card">
            <div className="board-main">
              <div className="board-title">
                <h3>{b.id} · {b.brand} {b.length}cm</h3>
                <StatusBadge status={b.status} />
              </div>
              <p>
                {b.customer} · {b.boardType} · 侧刃{b.sideEdge}° / 底刃{b.baseEdge}° · {b.wax}
                {b.batchId && ` · 批次 ${b.batchId}`}
              </p>
              {b.baseDamage && (
                <p className="damage-tag">
                  底板损伤：{b.repairSpots.length > 0 ? b.repairSpots.join("、") : "缺修补位置"}
                </p>
              )}
              {b.status === "recheck" && (
                <p className="recheck-tag">客户偏好已变更，退回待复检——复检确认前不能完工</p>
              )}
            </div>
            <div className="board-actions">
              {b.status === "recheck" && (
                <>
                  <button className="primary" onClick={() => dispatch({ type: "CONFIRM_RECHECK", boardId: b.id })}>
                    复检确认
                  </button>
                  <button disabled title="复检确认前不能完工">完工</button>
                </>
              )}
              {b.status === "active" && (
                <button className="primary" onClick={() => dispatch({ type: "COMPLETE_BOARD", boardId: b.id })}>
                  完工
                </button>
              )}
              {b.status === "pending" && <span className="hint">等待接批</span>}
              {b.status === "done" && b.completedAt && (
                <span className="hint">完工于 {fmtTime(b.completedAt)}</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ---------------- 客户偏好（版本化） ---------------- */

function PrefPanel({ state, dispatch }: PanelProps) {
  const customers = useMemo(
    () => [...new Set([...Object.keys(state.prefs), ...state.boards.map((b) => b.customer)])],
    [state]
  );
  const [customer, setCustomer] = useState("");
  const active = customers.includes(customer) ? customer : customers[0] ?? "";
  const pref = state.prefs[active];
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft(state.prefs[active]?.current ?? "");
  }, [active, state.prefs]);

  const unfinished = state.boards.filter((b) => b.customer === active && b.status !== "done").length;
  const dirty = draft.trim() !== "" && draft.trim() !== (pref?.current ?? "");

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>版本化偏好</p>
          <h2>客户偏好</h2>
        </div>
      </div>
      <label>
        <span>客户</span>
        <select value={active} onChange={(e) => setCustomer(e.target.value)}>
          {customers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        <span>偏好内容（每次保存生成新版本）</span>
        <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      {unfinished > 0 && (
        <p className="hint">保存新版本后，{active} 的 {unfinished} 块未完工雪板将退回待复检，复检确认前不能完工。</p>
      )}
      <button
        className="primary block"
        disabled={!dirty}
        onClick={() => dispatch({ type: "UPDATE_PREF", customer: active, note: draft })}
      >
        保存新版本{pref ? `（当前 v${pref.versions.length}）` : ""}
      </button>
      <div className="versions">
        {pref &&
          [...pref.versions].reverse().map((v) => (
            <div key={v.version} className="version-item">
              <b>v{v.version}{v.version === pref.versions.length ? " · 当前" : ""}</b>
              <span>{v.note}</span>
              <small>{fmtTime(v.changedAt)}</small>
            </div>
          ))}
      </div>
    </section>
  );
}

/* ---------------- 新建工单 ---------------- */

function NewOrderPanel({ dispatch }: { dispatch: Dispatch }) {
  const [form, setForm] = useState({
    customer: "",
    brand: "",
    length: 156,
    boardType: BOARD_TYPES[0],
    sideEdge: 88,
    baseEdge: 1,
    wax: WAX_TYPES[0],
    baseDamage: false,
  });
  const [saved, setSaved] = useState("");

  const set = (patch: Partial<typeof form>) => {
    setForm((f) => ({ ...f, ...patch }));
    setSaved("");
  };

  const submit = () => {
    if (!form.customer.trim() || !form.brand.trim()) return;
    dispatch({
      type: "ADD_BOARD",
      board: { ...form, customer: form.customer.trim(), brand: form.brand.trim() },
    });
    setSaved(`已创建工单，进入待接批队列（${form.customer.trim()}）`);
    setForm((f) => ({ ...f, brand: "", baseDamage: false }));
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>专业字段</p>
          <h2>新建工单</h2>
        </div>
      </div>
      <div className="field-grid">
        <label>
          <span>客户姓名</span>
          <input value={form.customer} onChange={(e) => set({ customer: e.target.value })} placeholder="填写客户姓名" />
        </label>
        <label>
          <span>雪板品牌</span>
          <input value={form.brand} onChange={(e) => set({ brand: e.target.value })} placeholder="填写雪板品牌" />
        </label>
        <label>
          <span>长度（cm）</span>
          <input type="number" min={100} max={200} value={form.length}
            onChange={(e) => set({ length: Number(e.target.value) || 0 })} />
        </label>
        <label>
          <span>板型</span>
          <select value={form.boardType} onChange={(e) => set({ boardType: e.target.value })}>
            {BOARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label>
          <span>侧刃角度（°）</span>
          <input type="number" step={0.5} min={0} value={form.sideEdge}
            onChange={(e) => set({ sideEdge: Number(e.target.value) || 0 })} />
        </label>
        <label>
          <span>底刃角度（°）</span>
          <input type="number" step={0.5} min={0} value={form.baseEdge}
            onChange={(e) => set({ baseEdge: Number(e.target.value) || 0 })} />
        </label>
        <label>
          <span>打蜡类型</span>
          <select value={form.wax} onChange={(e) => set({ wax: e.target.value })}>
            {WAX_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={form.baseDamage}
            onChange={(e) => set({ baseDamage: e.target.checked })} />
          <span>底板损伤（接批前需在损伤标记区填写修补位置）</span>
        </label>
      </div>
      {saved && <div className="notice-box">{saved}</div>}
      <button className="primary block" disabled={!form.customer.trim() || !form.brand.trim()} onClick={submit}>
        创建工单
      </button>
    </section>
  );
}

/* ---------------- 刃角参数表 ---------------- */

function NumberField({ value, disabled, onCommit }: { value: number; disabled?: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input
      type="number"
      step={0.5}
      min={0}
      disabled={disabled}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== null) {
          const v = parseFloat(draft);
          if (!Number.isNaN(v) && v >= 0 && v !== value) onCommit(v);
          setDraft(null);
        }
      }}
    />
  );
}

function EdgeTable({ state, dispatch }: PanelProps) {
  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>刃角参数表</p>
          <h2>刃角与打蜡</h2>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>工单</th><th>客户</th><th>板型</th><th>侧刃°</th><th>底刃°</th><th>打蜡类型</th>
            </tr>
          </thead>
          <tbody>
            {state.boards.map((b) => {
              const locked = b.status === "done";
              return (
                <tr key={b.id} className={locked ? "locked" : ""}>
                  <td>{b.id}</td>
                  <td>{b.customer}</td>
                  <td>{b.boardType}</td>
                  <td>
                    <NumberField value={b.sideEdge} disabled={locked}
                      onCommit={(v) => dispatch({ type: "UPDATE_BOARD", boardId: b.id, patch: { sideEdge: v } })} />
                  </td>
                  <td>
                    <NumberField value={b.baseEdge} disabled={locked}
                      onCommit={(v) => dispatch({ type: "UPDATE_BOARD", boardId: b.id, patch: { baseEdge: v } })} />
                  </td>
                  <td>
                    <select value={b.wax} disabled={locked}
                      onChange={(e) => dispatch({ type: "UPDATE_BOARD", boardId: b.id, patch: { wax: e.target.value } })}>
                      {WAX_TYPES.map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">已完工工单参数锁定，其余修改实时同步到工单队列与指标。</p>
    </section>
  );
}

/* ---------------- 底板损伤标记区 ---------------- */

function DamagePanel({ state, dispatch }: PanelProps) {
  const [spotDrafts, setSpotDrafts] = useState<Record<string, string>>({});

  const addSpot = (b: Board) => {
    const spot = (spotDrafts[b.id] ?? "").trim();
    if (!spot) return;
    dispatch({ type: "UPDATE_BOARD", boardId: b.id, patch: { repairSpots: [...b.repairSpots, spot] } });
    setSpotDrafts((d) => ({ ...d, [b.id]: "" }));
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>底板损伤标记区</p>
          <h2>损伤与修补位置</h2>
        </div>
      </div>
      <div className="damage-list">
        {state.boards.map((b) => {
          const locked = b.status === "done";
          const missing = b.baseDamage && b.repairSpots.length === 0;
          return (
            <div key={b.id} className={`damage-row${missing ? " danger" : ""}`}>
              <label className="check">
                <input
                  type="checkbox"
                  checked={b.baseDamage}
                  disabled={locked}
                  onChange={(e) =>
                    dispatch({ type: "UPDATE_BOARD", boardId: b.id, patch: { baseDamage: e.target.checked } })
                  }
                />
                <span><b>{b.id}</b> · {b.brand} {b.length}cm（{b.customer}）</span>
              </label>
              {b.baseDamage && (
                <div className="spots">
                  {b.repairSpots.map((s) => (
                    <span key={s} className="spot">
                      {s}
                      {!locked && (
                        <button
                          aria-label="删除修补位置"
                          onClick={() =>
                            dispatch({
                              type: "UPDATE_BOARD",
                              boardId: b.id,
                              patch: { repairSpots: b.repairSpots.filter((x) => x !== s) },
                            })
                          }
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                  {!locked && (
                    <span className="spot-add">
                      <input
                        placeholder="填写修补位置"
                        value={spotDrafts[b.id] ?? ""}
                        onChange={(e) => setSpotDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addSpot(b)}
                      />
                      <button onClick={() => addSpot(b)}>添加</button>
                    </span>
                  )}
                  {missing && <em className="warn">缺修补位置，接批将被整批拒绝</em>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ---------------- 客户历史 ---------------- */

function HistoryPanel({ state }: { state: ShopState }) {
  const customers = useMemo(
    () => [...new Set([...Object.keys(state.prefs), ...state.boards.map((b) => b.customer)])],
    [state]
  );
  const [customer, setCustomer] = useState("");
  const active = customers.includes(customer) ? customer : customers[0] ?? "";
  const pref = state.prefs[active];
  const boards = state.boards.filter((b) => b.customer === active);
  const batches = state.batches.filter((b) => b.customer === active);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>客户历史维护记录</p>
          <h2>客户历史</h2>
        </div>
        <select className="inline-select" value={active} onChange={(e) => setCustomer(e.target.value)}>
          {customers.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="history-grid">
        <div>
          <h3 className="sub">偏好版本（{pref?.versions.length ?? 0}）</h3>
          {pref ? (
            [...pref.versions].reverse().map((v) => (
              <div key={v.version} className="version-item">
                <b>v{v.version}{v.version === pref.versions.length ? " · 当前" : ""}</b>
                <span>{v.note}</span>
                <small>{fmtTime(v.changedAt)}</small>
              </div>
            ))
          ) : (
            <p className="empty">暂无偏好记录</p>
          )}
        </div>
        <div>
          <h3 className="sub">接批批次（{batches.length}）</h3>
          {batches.length === 0 && <p className="empty">暂无批次</p>}
          {[...batches].reverse().map((b) => (
            <div key={b.id} className="batch-item">
              <b>{b.id}</b>
              <span>{b.boardIds.length} 块 · {fmtTime(b.createdAt)}</span>
              <small>{b.boardIds.join("、")}</small>
            </div>
          ))}
        </div>
        <div>
          <h3 className="sub">工单记录（{boards.length}）</h3>
          {boards.length === 0 && <p className="empty">暂无工单</p>}
          {boards.map((b) => (
            <div key={b.id} className="history-item">
              <div className="board-title">
                <b>{b.id} · {b.brand} {b.length}cm</b>
                <StatusBadge status={b.status} />
              </div>
              <small>
                {b.boardType} · 侧刃{b.sideEdge}° / 底刃{b.baseEdge}° · {b.wax}
                {b.baseDamage && ` · 修补：${b.repairSpots.join("、") || "缺位置"}`}
                {b.status === "done" && b.completedAt && ` · 完工于 ${fmtTime(b.completedAt)}`}
              </small>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- 应用 ---------------- */

function App() {
  const [state, dispatch] = useShop();

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62004 · 源提示词6 · Port 62004</p>
        <h1>客户接批台 · 滑雪板调校维护</h1>
        <span>
          按客户接批未完工雪板，底板损伤必须登记修补位置；客户偏好每次修改保留版本，
          未完工雪板自动退回待复检，复检确认后方可完工。完工筛选、刃角表、损伤标记与客户历史实时同步，数据保存在浏览器本地。
        </span>
        <div>
          <button
            onClick={() => {
              if (window.confirm("重置为演示数据？本地修改将丢失。")) {
                resetStorage();
                dispatch({ type: "RESET" });
              }
            }}
          >
            重置演示数据
          </button>
        </div>
      </section>

      <Metrics state={state} />

      <section className="workspace">
        <IntakePanel state={state} dispatch={dispatch} />
        <QueuePanel state={state} dispatch={dispatch} />
      </section>

      <section className="grid-2">
        <PrefPanel state={state} dispatch={dispatch} />
        <NewOrderPanel dispatch={dispatch} />
      </section>

      <section className="grid-2">
        <EdgeTable state={state} dispatch={dispatch} />
        <DamagePanel state={state} dispatch={dispatch} />
      </section>

      <HistoryPanel state={state} />
    </main>
  );
}

export default App;
