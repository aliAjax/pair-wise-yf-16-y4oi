import { useEffect, useReducer } from "react";

/** 工单状态：待接批 → 维护中 →（偏好变更退回）待复检 → 复检确认 → 维护中 → 已完工 */
export type BoardStatus = "pending" | "active" | "recheck" | "done";

export const STATUS_LABEL: Record<BoardStatus, string> = {
  pending: "待接批",
  active: "维护中",
  recheck: "待复检",
  done: "已完工",
};

export interface Board {
  id: string;
  customer: string;
  brand: string;
  length: number;
  boardType: string;
  sideEdge: number; // 侧刃角度
  baseEdge: number; // 底刃角度
  wax: string;
  baseDamage: boolean;
  repairSpots: string[]; // 修补位置（有底板损伤时必填）
  status: BoardStatus;
  prevStatus: BoardStatus | null; // 退回待复检前的状态，复检确认后恢复
  batchId: string | null;
  recheckConfirmed: boolean;
  createdAt: number;
  completedAt: number | null;
}

export interface Batch {
  id: string;
  customer: string;
  boardIds: string[];
  createdAt: number;
}

export interface PrefVersion {
  version: number;
  note: string;
  changedAt: number;
}

export interface CustomerPref {
  customer: string;
  current: string;
  versions: PrefVersion[];
}

export interface ShopState {
  boards: Board[];
  batches: Batch[];
  prefs: Record<string, CustomerPref>;
  orderSeq: number;
  batchSeq: number;
}

export type Action =
  | { type: "ACCEPT_BATCH"; customer: string; boardIds: string[] }
  | { type: "UPDATE_PREF"; customer: string; note: string }
  | { type: "CONFIRM_RECHECK"; boardId: string }
  | { type: "COMPLETE_BOARD"; boardId: string }
  | {
      type: "ADD_BOARD";
      board: {
        customer: string;
        brand: string;
        length: number;
        boardType: string;
        sideEdge: number;
        baseEdge: number;
        wax: string;
        baseDamage: boolean;
      };
    }
  | {
      type: "UPDATE_BOARD";
      boardId: string;
      patch: Partial<Pick<Board, "sideEdge" | "baseEdge" | "wax" | "baseDamage" | "repairSpots">>;
    }
  | { type: "RESET" };

const T0 = Date.UTC(2026, 8, 19, 1, 0); // 2026-09-19 09:00 +08:00
const H = 3600_000;

export function seedState(): ShopState {
  return {
    orderSeq: 119,
    batchSeq: 2,
    boards: [
      {
        id: "ORD-101", customer: "张伟", brand: "Burton Custom", length: 156, boardType: "全地域",
        sideEdge: 88, baseEdge: 1, wax: "低温蜡", baseDamage: false, repairSpots: [],
        status: "active", prevStatus: null, batchId: "B-00", recheckConfirmed: true,
        createdAt: T0, completedAt: null,
      },
      {
        id: "ORD-102", customer: "张伟", brand: "Burton Process", length: 154, boardType: "公园板",
        sideEdge: 89, baseEdge: 1, wax: "通用蜡", baseDamage: true, repairSpots: ["板头左侧磕碰"],
        status: "active", prevStatus: null, batchId: "B-00", recheckConfirmed: true,
        createdAt: T0, completedAt: null,
      },
      {
        id: "ORD-118", customer: "张伟", brand: "Nitro Quiver", length: 158, boardType: "粉雪板",
        sideEdge: 88, baseEdge: 1, wax: "通用蜡", baseDamage: false, repairSpots: [],
        status: "recheck", prevStatus: "active", batchId: "B-00", recheckConfirmed: false,
        createdAt: T0 + 0.5 * H, completedAt: null,
      },
      {
        id: "ORD-103", customer: "李娜", brand: "Salomon SickStick", length: 158, boardType: "粉雪板",
        sideEdge: 87, baseEdge: 0.5, wax: "粉雪蜡", baseDamage: false, repairSpots: [],
        status: "pending", prevStatus: null, batchId: null, recheckConfirmed: false,
        createdAt: T0 + 1 * H, completedAt: null,
      },
      {
        id: "ORD-104", customer: "李娜", brand: "Salomon Dancehaul", length: 161, boardType: "粉雪板",
        sideEdge: 88, baseEdge: 1, wax: "低温蜡", baseDamage: true, repairSpots: [],
        status: "pending", prevStatus: null, batchId: null, recheckConfirmed: false,
        createdAt: T0 + 1.2 * H, completedAt: null,
      },
      {
        id: "ORD-112", customer: "王强", brand: "竞速板", length: 165, boardType: "竞速板",
        sideEdge: 87, baseEdge: 0.5, wax: "竞速蜡", baseDamage: true,
        repairSpots: ["板底中部划痕12cm · 待补P-Tex"],
        status: "pending", prevStatus: null, batchId: null, recheckConfirmed: false,
        createdAt: T0 + 2 * H, completedAt: null,
      },
      {
        id: "ORD-106", customer: "王强", brand: "Burton Custom", length: 156, boardType: "全地域",
        sideEdge: 88, baseEdge: 1, wax: "低温蜡", baseDamage: false, repairSpots: [],
        status: "done", prevStatus: null, batchId: "B-01", recheckConfirmed: true,
        createdAt: T0 - 26 * H, completedAt: T0 - 2 * H,
      },
    ],
    batches: [
      { id: "B-00", customer: "张伟", boardIds: ["ORD-101", "ORD-102", "ORD-118"], createdAt: T0 + 0.2 * H },
      { id: "B-01", customer: "王强", boardIds: ["ORD-106"], createdAt: T0 - 25 * H },
    ],
    prefs: {
      张伟: {
        customer: "张伟",
        current: "加强板尾抓地，弱咬雪",
        versions: [
          { version: 1, note: "弱咬雪，板头少上蜡", changedAt: T0 - 30 * H },
          { version: 2, note: "加强板尾抓地，弱咬雪", changedAt: T0 + 0.8 * H },
        ],
      },
      李娜: {
        customer: "李娜",
        current: "粉雪蜡优先，板底要滑",
        versions: [{ version: 1, note: "粉雪蜡优先，板底要滑", changedAt: T0 + 1 * H }],
      },
      王强: {
        customer: "王强",
        current: "竞速蜡，刃角不要动",
        versions: [{ version: 1, note: "竞速蜡，刃角不要动", changedAt: T0 - 25 * H }],
      },
    },
  };
}

/**
 * 接批校验：一次只接同一客户尚未完工（待接批）的雪板；
 * 有底板损伤的必须填写修补位置。返回错误列表，空数组表示可接批。
 */
export function validateBatch(state: ShopState, customer: string, boardIds: string[]): string[] {
  const errors: string[] = [];
  if (!customer) errors.push("请选择客户");
  if (boardIds.length === 0) errors.push("请至少选择一块待接批雪板");
  const picked = boardIds.map((id) => state.boards.find((b) => b.id === id));
  if (picked.some((b) => !b || b.customer !== customer || b.status !== "pending")) {
    errors.push("一次只能接同一客户尚未完工且待接批的雪板");
  }
  for (const b of picked) {
    if (b && b.baseDamage && b.repairSpots.length === 0) {
      errors.push(`${b.id}（${b.brand} ${b.length}cm）有底板损伤，必须填写修补位置`);
    }
  }
  return errors;
}

export function reducer(state: ShopState, action: Action): ShopState {
  switch (action.type) {
    case "ACCEPT_BATCH": {
      // 整批校验失败则原样返回：队列和原工单不变
      if (validateBatch(state, action.customer, action.boardIds).length > 0) return state;
      const batchId = `B-${String(state.batchSeq).padStart(2, "0")}`;
      const batch: Batch = {
        id: batchId,
        customer: action.customer,
        boardIds: [...action.boardIds],
        createdAt: Date.now(),
      };
      const boards = state.boards.map((b) =>
        action.boardIds.includes(b.id) ? { ...b, status: "active" as BoardStatus, batchId } : b
      );
      return { ...state, boards, batches: [...state.batches, batch], batchSeq: state.batchSeq + 1 };
    }

    case "UPDATE_PREF": {
      const note = action.note.trim();
      if (!note) return state;
      const existing = state.prefs[action.customer];
      if (existing && existing.current === note) return state;
      const versions = [
        ...(existing?.versions ?? []),
        { version: (existing?.versions.length ?? 0) + 1, note, changedAt: Date.now() },
      ];
      const prefs = {
        ...state.prefs,
        [action.customer]: { customer: action.customer, current: note, versions },
      };
      // 偏好变更：该客户未完工雪板退回待复检，已完成记录不改
      const boards = state.boards.map((b) =>
        b.customer === action.customer && b.status !== "done"
          ? {
              ...b,
              status: "recheck" as BoardStatus,
              prevStatus: b.status === "recheck" ? b.prevStatus : b.status,
              recheckConfirmed: false,
            }
          : b
      );
      return { ...state, prefs, boards };
    }

    case "CONFIRM_RECHECK": {
      const target = state.boards.find((b) => b.id === action.boardId);
      if (!target || target.status !== "recheck") return state;
      const boards = state.boards.map((b) =>
        b.id === action.boardId
          ? { ...b, status: b.prevStatus ?? "active", prevStatus: null, recheckConfirmed: true }
          : b
      );
      return { ...state, boards };
    }

    case "COMPLETE_BOARD": {
      // 复检确认前不能完工：只有维护中的工单可完工
      const target = state.boards.find((b) => b.id === action.boardId);
      if (!target || target.status !== "active") return state;
      const boards = state.boards.map((b) =>
        b.id === action.boardId
          ? { ...b, status: "done" as BoardStatus, completedAt: Date.now() }
          : b
      );
      return { ...state, boards };
    }

    case "ADD_BOARD": {
      const id = `ORD-${state.orderSeq}`;
      const board: Board = {
        ...action.board,
        id,
        repairSpots: [],
        status: "pending",
        prevStatus: null,
        batchId: null,
        recheckConfirmed: false,
        createdAt: Date.now(),
        completedAt: null,
      };
      return { ...state, boards: [...state.boards, board], orderSeq: state.orderSeq + 1 };
    }

    case "UPDATE_BOARD": {
      // 已完成记录不改
      const target = state.boards.find((b) => b.id === action.boardId);
      if (!target || target.status === "done") return state;
      const boards = state.boards.map((b) =>
        b.id === action.boardId ? { ...b, ...action.patch } : b
      );
      return { ...state, boards };
    }

    case "RESET":
      return seedState();

    default:
      return state;
  }
}

const STORAGE_KEY = "hxyfront-62004:shop:v1";

function loadState(): ShopState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ShopState;
      if (Array.isArray(parsed.boards) && Array.isArray(parsed.batches) && parsed.prefs) {
        return parsed;
      }
    }
  } catch {
    // 本地数据损坏时回退到演示数据
  }
  return seedState();
}

/** 全局唯一的店铺数据仓库：所有视图共享，变更即写入浏览器本地 */
export function useShop() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as ShopState, loadState);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // 存储不可用时静默降级为内存态
    }
  }, [state]);
  return [state, dispatch] as const;
}

export function resetStorage() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export const BOARD_TYPES = ["全地域", "公园板", "竞速板", "粉雪板"];
export const WAX_TYPES = ["通用蜡", "低温蜡", "粉雪蜡", "竞速蜡"];
