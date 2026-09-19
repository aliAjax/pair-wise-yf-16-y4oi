import { useEffect, useMemo, useState } from "react";
import "./styles.css";
import { SnowboardMarker } from "./SnowboardMarker";
import {
  BITE_OPTIONS,
  Board,
  Customer,
  EDGE_PRESETS,
  PrefVersion,
  SHAPES,
  Shape,
  StationState,
  Status,
  WAX_OPTIONS,
  currentPref,
  loadState,
  nextOrderId,
  prefAt,
  resetState,
  saveState,
  spotLabel,
  STATUS_LABEL,
} from "./model";

type StatusFilter = Status | "all";

interface Notice {
  type: "reject" | "info";
  text: string;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_BADGE: Record<Status, string> = {
  queued: "badge queued",
  in_progress: "badge in-progress",
  recheck: "badge recheck",
  done: "badge done",
};

function App() {
  const [station, setStation] = useState<StationState>(loadState);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [shapeFilter, setShapeFilter] = useState<Shape | "all">("all");
  const [historyCustomerId, setHistoryCustomerId] = useState<string>("C3");

  // 新增工单表单
  const blankForm = {
    customerId: "C1",
    brand: "",
    length: "156",
    shape: "全地域" as Shape,
    sideEdge: String(EDGE_PRESETS["全地域"].side),
    baseEdge: String(EDGE_PRESETS["全地域"].base),
    wax: "通用温区蜡",
    baseDamage: false,
    repairSpots: [] as string[],
  };
  const [form, setForm] = useState(blankForm);

  // 客户偏好草稿（当前批次客户）
  const activeCustomer =
    station.customers.find((c) => c.id === station.activeCustomerId) ?? null;
  const activePref = activeCustomer ? currentPref(activeCustomer) : null;
  const [prefDraft, setPrefDraft] = useState({ wax: "", bite: "中等咬雪" as PrefVersion["bite"], note: "" });

  // 数据写浏览器本地
  useEffect(() => {
    saveState(station);
  }, [station]);

  // 批次全部完工后自动收台，才能接下一位客户
  useEffect(() => {
    if (!station.activeCustomerId) return;
    const remaining = station.boards.filter(
      (b) => station.batchBoardIds.includes(b.id) && b.status !== "done"
    );
    if (remaining.length === 0) {
      setStation((prev) => ({ ...prev, activeCustomerId: null, batchBoardIds: [] }));
      setNotice({ type: "info", text: "本批雪板已全部完工，接批台已空闲，可接待下一位客户。" });
    }
  }, [station.boards, station.activeCustomerId, station.batchBoardIds]);

  // 切换批次客户时重置偏好草稿
  useEffect(() => {
    if (activePref) {
      setPrefDraft({ wax: activePref.wax, bite: activePref.bite, note: activePref.note });
    }
  }, [station.activeCustomerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const customerById = (id: string) => station.customers.find((c) => c.id === id);

  // ---------- 接批：原子校验，整批拒绝则队列和原工单不变 ----------
  const acceptBatch = (customerId: string) => {
    const customer = customerById(customerId);
    if (!customer) return;
    if (station.activeCustomerId) {
      setNotice({
        type: "reject",
        text: `接批台正在服务 ${
          customerById(station.activeCustomerId)!.name
        }，需本批全部完工后才能接待下一位客户。`,
      });
      return;
    }
    const queue = station.boards.filter((b) => b.customerId === customerId && b.status === "queued");
    if (queue.length === 0) {
      setNotice({ type: "reject", text: `${customer.name} 当前没有待接批的雪板。` });
      return;
    }
    const invalid = queue.filter((b) => b.baseDamage && b.repairSpots.length === 0);
    if (invalid.length > 0) {
      setNotice({
        type: "reject",
        text: `整批拒绝：${customer.name} 的 ${invalid
          .map((b) => b.id)
          .join("、")} 存在底板损伤但未填写修补位置。请先在队列中补齐修补位置后重新接批；本次操作已中止，队列与原工单均未变更。`,
      });
      return;
    }
    const version = currentPref(customer).version;
    const ids = queue.map((b) => b.id);
    setStation((prev) => ({
      ...prev,
      activeCustomerId: customerId,
      batchBoardIds: ids,
      boards: prev.boards.map((b) =>
        ids.includes(b.id)
          ? { ...b, status: "in_progress" as Status, prefVersionAtAccept: version }
          : b
      ),
    }));
    setNotice({
      type: "info",
      text: `已接批 ${customer.name} 的 ${ids.length} 块雪板（${ids.join("、")}），偏好按 v${version} 快照执行。`,
    });
  };

  // ---------- 保存客户偏好：保留新版本，未完工板退回待复检 ----------
  const savePreference = () => {
    if (!activeCustomer || !activePref) return;
    if (
      prefDraft.wax === activePref.wax &&
      prefDraft.bite === activePref.bite &&
      prefDraft.note === activePref.note
    ) {
      setNotice({ type: "info", text: "偏好内容与当前版本一致，未生成新版本。" });
      return;
    }
    const nextVersion: PrefVersion = {
      version: activePref.version + 1,
      wax: prefDraft.wax,
      bite: prefDraft.bite,
      note: prefDraft.note.trim(),
      changedAt: new Date().toISOString(),
    };
    const customerId = activeCustomer.id;
    setStation((prev) => {
      const unfinished = prev.boards.filter(
        (b) => b.customerId === customerId && b.status !== "done"
      );
      // 偏好变更覆盖该客户全部未完工雪板，新入队的也一并纳入本批，避免脱离批次无法复检/接批
      const mergedIds = Array.from(
        new Set([...prev.batchBoardIds, ...unfinished.map((b) => b.id)])
      );
      return {
        ...prev,
        batchBoardIds: mergedIds,
        customers: prev.customers.map((c) =>
          c.id === customerId
            ? { ...c, prefVersions: [...c.prefVersions, nextVersion] }
            : c
        ),
        // 该客户所有未完工雪板退回待复检；已完成记录不改
        boards: prev.boards.map((b) =>
          b.customerId === customerId && b.status !== "done"
            ? {
                ...b,
                status: "recheck" as Status,
                prefVersionAtAccept: b.prefVersionAtAccept ?? nextVersion.version,
              }
            : b
        ),
      };
    });
    setNotice({
      type: "reject",
      text: `客户偏好已保存为 v${nextVersion.version}（历史版本全部保留）。${activeCustomer.name} 的所有未完工雪板已退回「待复检」，复检确认前不能完工。`,
    });
  };

  const confirmRecheck = (boardId: string) => {
    setStation((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.id === boardId && b.status === "recheck" ? { ...b, status: "in_progress" as Status } : b
      ),
    }));
  };

  const confirmAllRechecks = () => {
    if (!station.activeCustomerId) return;
    setStation((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.customerId === prev.activeCustomerId && b.status === "recheck"
          ? { ...b, status: "in_progress" as Status }
          : b
      ),
    }));
  };

  // ---------- 完工：复检确认前不能完工 ----------
  const markDone = (boardId: string) => {
    const board = station.boards.find((b) => b.id === boardId);
    if (!board || board.status !== "in_progress" || !activeCustomer) return;
    setStation((prev) => ({
      ...prev,
      boards: prev.boards.map((b) =>
        b.id === boardId
          ? {
              ...b,
              status: "done" as Status,
              completedAt: new Date().toISOString(),
              prefVersionAtDone: currentPref(activeCustomer).version,
            }
          : b
      ),
    }));
  };

  const patchBoard = (boardId: string, patch: Partial<Board>) => {
    setStation((prev) => ({
      ...prev,
      boards: prev.boards.map((b) => (b.id === boardId ? { ...b, ...patch } : b)),
    }));
  };

  const toggleSpot = (boardId: string, spotId: string) => {
    const board = station.boards.find((b) => b.id === boardId);
    if (!board) return;
    const spots = board.repairSpots.includes(spotId)
      ? board.repairSpots.filter((s) => s !== spotId)
      : [...board.repairSpots, spotId];
    patchBoard(boardId, { repairSpots: spots });
  };

  // ---------- 新增工单 ----------
  const submitOrder = () => {
    if (!form.brand.trim()) {
      setNotice({ type: "reject", text: "请填写雪板品牌后再入队。" });
      return;
    }
    if (form.baseDamage && form.repairSpots.length === 0) {
      setNotice({ type: "reject", text: "已标记底板损伤，必须填写修补位置后才能加入队列。" });
      return;
    }
    const board: Board = {
      id: nextOrderId(station.boards),
      customerId: form.customerId,
      brand: form.brand.trim(),
      length: Number(form.length) || 150,
      shape: form.shape,
      sideEdge: Number(form.sideEdge) || EDGE_PRESETS[form.shape].side,
      baseEdge: Number(form.baseEdge) || EDGE_PRESETS[form.shape].base,
      wax: form.wax,
      baseDamage: form.baseDamage,
      repairSpots: form.repairSpots,
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    setStation((prev) => ({ ...prev, boards: [...prev.boards, board] }));
    setForm({
      ...blankForm,
      customerId: form.customerId,
      repairSpots: [],
    });
    setNotice({ type: "info", text: `${board.id} 已进入待接批队列。` });
  };

  const resetDemo = () => {
    if (!window.confirm("恢复为示例数据？当前本地记录将被覆盖。")) return;
    setStation(resetState());
    setNotice({ type: "info", text: "已恢复示例数据。" });
  };

  // ---------- 筛选与统计 ----------
  const filteredBoards = useMemo(
    () =>
      station.boards.filter(
        (b) =>
          (statusFilter === "all" || b.status === statusFilter) &&
          (shapeFilter === "all" || b.shape === shapeFilter)
      ),
    [station.boards, statusFilter, shapeFilter]
  );

  const nonDone = station.boards.filter((b) => b.status !== "done");
  const doneBoards = station.boards.filter((b) => b.status === "done");
  const avgSideEdge = nonDone.length
    ? (nonDone.reduce((s, b) => s + b.sideEdge, 0) / nonDone.length).toFixed(1)
    : "—";
  const damagedCount = station.boards.filter((b) => b.baseDamage).length;

  // 接批台候选客户分组
  const queueGroups = station.customers
    .map((c) => ({
      customer: c,
      queue: station.boards.filter((b) => b.customerId === c.id && b.status === "queued"),
    }))
    .filter((g) => g.queue.length > 0);

  const batchBoards = station.boards.filter((b) => station.batchBoardIds.includes(b.id));
  const recheckCount = batchBoards.filter((b) => b.status === "recheck").length;

  const historyCustomer = customerById(historyCustomerId) ?? station.customers[0];
  const historyDone = station.boards
    .filter((b) => b.customerId === historyCustomer?.id && b.status === "done")
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1));

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62004 · 滑雪板调校维护 · 数据存浏览器本地</p>
        <h1>客户接批台</h1>
        <span>
          一次只接同一客户尚未完工的雪板；有底板损伤的雪板必须填写修补位置，否则整批拒绝、队列与原工单不变。
          接批后修改客户偏好会保留版本并把该客户未完工雪板退回待复检，复检确认前不能完工；已完成记录冻结不改。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>待维护</small>
          <strong>{nonDone.length}</strong>
        </article>
        <article>
          <small>完工工单</small>
          <strong>{doneBoards.length}</strong>
        </article>
        <article>
          <small>平均侧刃角</small>
          <strong>{avgSideEdge}°</strong>
        </article>
        <article>
          <small>底板修补</small>
          <strong>{damagedCount}</strong>
        </article>
      </section>

      {notice && (
        <div className={"notice " + notice.type} onClick={() => setNotice(null)} role="status">
          {notice.text}
          <button className="notice-close" aria-label="关闭提示">
            ×
          </button>
        </div>
      )}

      {/* ===== 接批台 ===== */}
      <section className="panel station">
        <div className="heading">
          <div>
            <p>Batch Dock</p>
            <h2>接批台</h2>
          </div>
          {activeCustomer && activePref && (
            <span className="dock-state">
              正在服务 <b>{activeCustomer.name}</b> · 批次 {batchBoards.length} 块 · 执行偏好 v
              {activePref.version}
            </span>
          )}
        </div>

        {!activeCustomer ? (
          queueGroups.length === 0 ? (
            <p className="empty">队列已清空，等待新工单入队。</p>
          ) : (
            <div className="queue-groups">
              {queueGroups.map(({ customer, queue }) => {
                const invalid = queue.filter((b) => b.baseDamage && b.repairSpots.length === 0);
                const pref = currentPref(customer);
                return (
                  <article key={customer.id} className={"queue-group" + (invalid.length ? " has-invalid" : "")}>
                    <header>
                      <div>
                        <h3>{customer.name}</h3>
                        <p>
                          {customer.phone} · {queue.length} 块待接 · 当前偏好 v{pref.version}（{pref.wax} /{" "}
                          {pref.bite}）
                        </p>
                      </div>
                      <button className="primary" onClick={() => acceptBatch(customer.id)}>
                        接此客户批次
                      </button>
                    </header>
                    <div className="queue-board-lines">
                      {queue.map((b) => (
                        <div key={b.id} className="queue-line">
                          <span className="order-no">{b.id}</span>
                          <span>
                            {b.brand} {b.length}cm · {b.shape} · 侧刃{b.sideEdge}°/底刃{b.baseEdge}° ·{" "}
                            {b.wax}
                          </span>
                          {b.baseDamage && (
                            <em className={b.repairSpots.length ? "damage ok" : "damage missing"}>
                              底板损伤
                              {b.repairSpots.length
                                ? ` · 修补：${b.repairSpots.map(spotLabel).join("、")}`
                                : " · 缺修补位置，接批将整批拒绝"}
                            </em>
                          )}
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : (
          <div className="active-dock">
            <div className="pref-editor">
              <h3>客户偏好 · 版本化</h3>
              <div className="pref-form">
                <label>
                  <span>打蜡类型</span>
                  <select
                    value={prefDraft.wax}
                    onChange={(e) => setPrefDraft((d) => ({ ...d, wax: e.target.value }))}
                  >
                    {WAX_OPTIONS.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>咬雪偏好</span>
                  <select
                    value={prefDraft.bite}
                    onChange={(e) =>
                      setPrefDraft((d) => ({ ...d, bite: e.target.value as PrefVersion["bite"] }))
                    }
                  >
                    {BITE_OPTIONS.map((w) => (
                      <option key={w}>{w}</option>
                    ))}
                  </select>
                </label>
                <label className="pref-note">
                  <span>偏好说明</span>
                  <input
                    value={prefDraft.note}
                    placeholder="本次调整原因，将随版本留存"
                    onChange={(e) => setPrefDraft((d) => ({ ...d, note: e.target.value }))}
                  />
                </label>
                <button className="primary" onClick={savePreference}>
                  保存为新版本
                </button>
              </div>
              <ol className="pref-versions">
                {[...activeCustomer.prefVersions].reverse().map((p) => (
                  <li
                    key={p.version}
                    className={p.version === currentPref(activeCustomer).version ? "current" : ""}
                  >
                    <b>v{p.version}</b>
                    <span>
                      {p.wax} · {p.bite}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <time>{fmt(p.changedAt)}</time>
                    {p.version === currentPref(activeCustomer).version && <em>当前执行</em>}
                  </li>
                ))}
              </ol>
            </div>

            <div className="batch-boards">
              {recheckCount > 0 && (
                <div className="recheck-bar">
                  {recheckCount} 块雪板因偏好变更待复检，确认前不能完工。
                  <button onClick={confirmAllRechecks}>复检全部确认</button>
                </div>
              )}
              {batchBoards.map((b) => (
                <BoardCard
                  key={b.id}
                  board={b}
                  customer={activeCustomer}
                  station={station}
                  onPatch={patchBoard}
                  onToggleSpot={toggleSpot}
                  onConfirmRecheck={confirmRecheck}
                  onDone={markDone}
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ===== 筛选 + 新增工单 ===== */}
      <section className="workspace">
        <aside className="panel side">
          <h2>完工状态筛选</h2>
          <div className="chips filter-chips">
            {(["all", "queued", "in_progress", "recheck", "done"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                className={statusFilter === s ? "chip-on" : ""}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "全部状态" : STATUS_LABEL[s]}
              </button>
            ))}
          </div>

          <h2 className="second">板型筛选</h2>
          <div className="chips filter-chips">
            <button
              className={shapeFilter === "all" ? "chip-on" : ""}
              onClick={() => setShapeFilter("all")}
            >
              全部板型
            </button>
            {SHAPES.map((s) => (
              <button key={s} className={shapeFilter === s ? "chip-on" : ""} onClick={() => setShapeFilter(s)}>
                {s}
              </button>
            ))}
          </div>

          <div className="new-order">
            <p>专业字段</p>
            <h2>新增工单入队</h2>
            <label>
              <span>客户</span>
              <select
                value={form.customerId}
                onChange={(e) => setForm((f) => ({ ...f, customerId: e.target.value }))}
              >
                {station.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>雪板品牌</span>
              <input
                value={form.brand}
                placeholder="如 Burton Custom"
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
              />
            </label>
            <div className="form-row">
              <label>
                <span>长度 (cm)</span>
                <input
                  type="number"
                  value={form.length}
                  onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                />
              </label>
              <label>
                <span>板型</span>
                <select
                  value={form.shape}
                  onChange={(e) => {
                    const shape = e.target.value as Shape;
                    setForm((f) => ({
                      ...f,
                      shape,
                      sideEdge: String(EDGE_PRESETS[shape].side),
                      baseEdge: String(EDGE_PRESETS[shape].base),
                    }));
                  }}
                >
                  {SHAPES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>侧刃角 (°)</span>
                <input
                  type="number"
                  step="0.5"
                  value={form.sideEdge}
                  onChange={(e) => setForm((f) => ({ ...f, sideEdge: e.target.value }))}
                />
              </label>
              <label>
                <span>底刃角 (°)</span>
                <input
                  type="number"
                  step="0.25"
                  value={form.baseEdge}
                  onChange={(e) => setForm((f) => ({ ...f, baseEdge: e.target.value }))}
                />
              </label>
            </div>
            <label>
              <span>打蜡类型</span>
              <select value={form.wax} onChange={(e) => setForm((f) => ({ ...f, wax: e.target.value }))}>
                {WAX_OPTIONS.map((w) => (
                  <option key={w}>{w}</option>
                ))}
              </select>
            </label>
            <label className="check-line">
              <input
                type="checkbox"
                checked={form.baseDamage}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    baseDamage: e.target.checked,
                    repairSpots: e.target.checked ? f.repairSpots : [],
                  }))
                }
              />
              <span>存在底板损伤（必须指定修补位置）</span>
            </label>
            {form.baseDamage && (
              <div className="spot-chips">
                {(["tip", "front", "middle", "waist", "rear", "tail"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={"spot-chip" + (form.repairSpots.includes(id) ? " selected" : "")}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        repairSpots: f.repairSpots.includes(id)
                          ? f.repairSpots.filter((s) => s !== id)
                          : [...f.repairSpots, id],
                      }))
                    }
                  >
                    {spotLabel(id)}
                  </button>
                ))}
              </div>
            )}
            <button className="primary full" onClick={submitOrder}>
              加入待接批队列
            </button>
          </div>
        </aside>

        <section className="panel main-col">
          {/* ===== 刃角参数表 ===== */}
          <div className="heading">
            <div>
              <p>Edge Chart</p>
              <h2>刃角参数表</h2>
            </div>
            <span className="hint">施工中雪板可直接调整，其余状态只读</span>
          </div>
          <div className="edge-table">
            <table>
              <thead>
                <tr>
                  <th>工单号</th>
                  <th>客户 / 雪板</th>
                  <th>板型</th>
                  <th>侧刃角</th>
                  <th>底刃角</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {nonDone.map((b) => {
                  const editable =
                    station.activeCustomerId === b.customerId &&
                    station.batchBoardIds.includes(b.id) &&
                    b.status === "in_progress";
                  return (
                    <tr key={b.id} className={b.status === "recheck" ? "row-recheck" : ""}>
                      <td className="order-no">{b.id}</td>
                      <td>
                        {customerById(b.customerId)?.name} · {b.brand} {b.length}
                      </td>
                      <td>{b.shape}</td>
                      <td>
                        <input
                          type="number"
                          step="0.5"
                          value={b.sideEdge}
                          disabled={!editable}
                          onChange={(e) => patchBoard(b.id, { sideEdge: Number(e.target.value) })}
                        />
                        °
                      </td>
                      <td>
                        <input
                          type="number"
                          step="0.25"
                          value={b.baseEdge}
                          disabled={!editable}
                          onChange={(e) => patchBoard(b.id, { baseEdge: Number(e.target.value) })}
                        />
                        °
                      </td>
                      <td>
                        <span className={STATUS_BADGE[b.status]}>{STATUS_LABEL[b.status]}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ===== 维护工单列表（含底板损伤标记区） ===== */}
          <div className="heading list-heading">
            <div>
              <p>Work Orders</p>
              <h2>维护工单列表</h2>
            </div>
            <span className="hint">
              命中 {filteredBoards.length} / {station.boards.length} 块
            </span>
          </div>
          <div className="records">
            {filteredBoards.length === 0 && <p className="empty">当前筛选条件下没有雪板。</p>}
            {filteredBoards.map((b) => (
              <BoardCard
                key={b.id}
                board={b}
                customer={customerById(b.customerId)!}
                station={station}
                onPatch={patchBoard}
                onToggleSpot={toggleSpot}
                onConfirmRecheck={confirmRecheck}
                onDone={markDone}
              />
            ))}
          </div>
        </section>
      </section>

      {/* ===== 客户历史维护记录（完工记录冻结） ===== */}
      <section className="panel history">
        <div className="heading">
          <div>
            <p>Customer History</p>
            <h2>客户历史维护记录</h2>
          </div>
          <span className="hint">已完成记录为完工时刻快照，不随后续偏好修改而改变</span>
        </div>
        <div className="chips customer-chips">
          {station.customers.map((c) => {
            const doneCount = station.boards.filter(
              (b) => b.customerId === c.id && b.status === "done"
            ).length;
            return (
              <button
                key={c.id}
                className={historyCustomer?.id === c.id ? "chip-on" : ""}
                onClick={() => setHistoryCustomerId(c.id)}
              >
                {c.name}（完工 {doneCount}）
              </button>
            );
          })}
        </div>

        {historyCustomer && (
          <div className="history-body">
            <div className="history-prefs">
              <h3>{historyCustomer.name} 的偏好版本</h3>
              <ol className="pref-versions">
                {[...historyCustomer.prefVersions].reverse().map((p) => (
                  <li key={p.version}>
                    <b>v{p.version}</b>
                    <span>
                      {p.wax} · {p.bite}
                      {p.note ? ` · ${p.note}` : ""}
                    </span>
                    <time>{fmt(p.changedAt)}</time>
                  </li>
                ))}
              </ol>
            </div>
            <div className="history-records">
              {historyDone.length === 0 ? (
                <p className="empty">该客户暂无已完工记录。</p>
              ) : (
                historyDone.map((b) => {
                  const snap = prefAt(historyCustomer, b.prefVersionAtDone);
                  return (
                    <article key={b.id} className="history-card">
                      <header>
                        <b>{b.id}</b>
                        <span className={STATUS_BADGE.done}>{STATUS_LABEL.done}</span>
                        <time>{b.completedAt ? fmt(b.completedAt) : ""}</time>
                      </header>
                      <p>
                        {b.brand} {b.length}cm · {b.shape} · 侧刃{b.sideEdge}° / 底刃{b.baseEdge}° ·{" "}
                        {b.wax}
                      </p>
                      {b.baseDamage && (
                        <p className="damage ok">
                          底板损伤已修补：{b.repairSpots.map(spotLabel).join("、")}
                        </p>
                      )}
                      <p className="snapshot">
                        完工偏好快照 v{b.prefVersionAtDone}
                        {snap ? `：${snap.wax} · ${snap.bite}` : ""}（记录冻结，不再修改）
                      </p>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>

      <footer className="footer">
        <span>所有工单、偏好版本与完工记录均保存在浏览器 localStorage，刷新不丢失。</span>
        <button onClick={resetDemo}>恢复示例数据</button>
      </footer>
    </main>
  );
}

// ---------- 雪板工单卡片 ----------

interface BoardCardProps {
  board: Board;
  customer: Customer;
  station: StationState;
  onPatch: (id: string, patch: Partial<Board>) => void;
  onToggleSpot: (id: string, spotId: string) => void;
  onConfirmRecheck: (id: string) => void;
  onDone: (id: string) => void;
}

function BoardCard({
  board,
  customer,
  station,
  onPatch,
  onToggleSpot,
  onConfirmRecheck,
  onDone,
}: BoardCardProps) {
  const inBatch =
    station.activeCustomerId === board.customerId &&
    station.batchBoardIds.includes(board.id);
  const editableMarker = board.status === "queued" || (inBatch && board.status === "in_progress");
  const editableWork = inBatch && board.status === "in_progress";
  const acceptSnap = prefAt(customer, board.prefVersionAtAccept);

  return (
    <article className={"board-card status-" + board.status}>
      <div className="board-main">
        <header>
          <b className="order-no">{board.id}</b>
          <span className={STATUS_BADGE[board.status]}>{STATUS_LABEL[board.status]}</span>
          <h3>
            {board.brand} {board.length}cm
          </h3>
          <span className="shape-tag">{board.shape}</span>
        </header>

        <p className="board-spec">
          侧刃 {board.sideEdge}° · 底刃 {board.baseEdge}° ·
          {editableWork ? (
            <select
              className="inline-select"
              value={board.wax}
              onChange={(e) => onPatch(board.id, { wax: e.target.value })}
            >
              {WAX_OPTIONS.map((w) => (
                <option key={w}>{w}</option>
              ))}
            </select>
          ) : (
            <span> {board.wax}</span>
          )}
        </p>

        <div className="damage-control">
          <label className="check-line">
            <input
              type="checkbox"
              checked={board.baseDamage}
              disabled={!editableMarker}
              onChange={(e) =>
                onPatch(board.id, {
                  baseDamage: e.target.checked,
                  repairSpots: e.target.checked ? board.repairSpots : [],
                })
              }
            />
            <span>底板损伤</span>
          </label>
          {board.baseDamage && board.repairSpots.length === 0 && (
            <em className="damage missing">未填写修补位置：待接批工单将导致整批拒绝</em>
          )}
          {board.baseDamage && board.repairSpots.length > 0 && (
            <em className="damage ok">修补位置：{board.repairSpots.map(spotLabel).join("、")}</em>
          )}
        </div>

        {board.status === "recheck" && (
          <div className="recheck-note">
            客户偏好已更新，本板已退回待复检；复检确认前不能完工。
            <button onClick={() => onConfirmRecheck(board.id)}>复检确认</button>
          </div>
        )}

        {board.status === "done" && (
          <p className="snapshot">
            {board.completedAt ? `${fmt(board.completedAt)} 完工` : ""} · 完工偏好快照 v
            {board.prefVersionAtDone}（记录冻结不改）
          </p>
        )}

        {board.status !== "done" && acceptSnap && (
          <p className="snapshot">
            接批于偏好 v{board.prefVersionAtAccept}：{acceptSnap.wax} · {acceptSnap.bite}
          </p>
        )}

        <div className="card-actions">
          {editableWork && (
            <button className="primary" onClick={() => onDone(board.id)}>
              标记完工
            </button>
          )}
          {board.status === "recheck" && (
            <button className="primary" onClick={() => onConfirmRecheck(board.id)}>
              复检确认
            </button>
          )}
          {board.status === "queued" && board.baseDamage && board.repairSpots.length === 0 && (
            <span className="hint">在下方底板图补齐修补位置</span>
          )}
        </div>
      </div>

      <SnowboardMarker
        spots={board.repairSpots}
        damaged={board.baseDamage}
        editable={editableMarker}
        onToggle={(spotId) => onToggleSpot(board.id, spotId)}
      />
    </article>
  );
}

export default App;
