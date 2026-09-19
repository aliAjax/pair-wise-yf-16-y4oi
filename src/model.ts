// 客户接批台领域模型：雪板工单、客户偏好版本、接批状态

export type Shape = "全地域" | "公园板" | "竞速板" | "粉雪板";
export type Status = "queued" | "in_progress" | "recheck" | "done";
export type Bite = "弱咬雪" | "中等咬雪" | "强咬雪";

export interface RepairSpot {
  id: string;
  label: string;
  short: string;
}

// 底板修补位置分区（板头 → 板尾）
export const REPAIR_SPOTS: RepairSpot[] = [
  { id: "tip", label: "板头", short: "板头" },
  { id: "front", label: "前固定器区", short: "前器" },
  { id: "middle", label: "板中", short: "板中" },
  { id: "waist", label: "板腰", short: "板腰" },
  { id: "rear", label: "后固定器区", short: "后器" },
  { id: "tail", label: "板尾", short: "板尾" },
];

export function spotLabel(id: string): string {
  return REPAIR_SPOTS.find((s) => s.id === id)?.label ?? id;
}

export const SHAPES: Shape[] = ["全地域", "公园板", "竞速板", "粉雪板"];

export const EDGE_PRESETS: Record<Shape, { side: number; base: number }> = {
  全地域: { side: 88, base: 1 },
  公园板: { side: 89, base: 0.5 },
  竞速板: { side: 87, base: 1 },
  粉雪板: { side: 89, base: 1 },
};

export const WAX_OPTIONS = ["低温蜡", "通用温区蜡", "高温蜡", "高氟竞速蜡", "天然环保蜡"];
export const BITE_OPTIONS: Bite[] = ["弱咬雪", "中等咬雪", "强咬雪"];

export interface PrefVersion {
  version: number;
  wax: string;
  bite: Bite;
  note: string;
  changedAt: string; // ISO
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  prefVersions: PrefVersion[];
}

export interface Board {
  id: string; // 工单号
  customerId: string;
  brand: string;
  length: number;
  shape: Shape;
  sideEdge: number; // 侧刃角度（度）
  baseEdge: number; // 底刃角度（度）
  wax: string; // 打蜡类型
  baseDamage: boolean; // 是否有底板损伤
  repairSpots: string[]; // 修补位置分区 id
  status: Status;
  prefVersionAtAccept: number | null; // 接批时偏好版本快照
  prefVersionAtDone: number | null; // 完工时偏好版本快照（完工后冻结）
  createdAt: string;
  completedAt: string | null;
}

export interface StationState {
  customers: Customer[];
  boards: Board[];
  activeCustomerId: string | null; // 接批台一次只服务一个客户
  batchBoardIds: string[]; // 本次接批锁定的雪板
}

export function currentPref(customer: Customer): PrefVersion {
  return customer.prefVersions[customer.prefVersions.length - 1];
}

export function prefAt(customer: Customer, version: number | null): PrefVersion | null {
  if (version === null) return null;
  return customer.prefVersions.find((p) => p.version === version) ?? null;
}

export function nextOrderId(boards: Board[]): string {
  const max = boards.reduce((m, b) => {
    const n = Number(b.id.replace("ORD-", ""));
    return Number.isFinite(n) ? Math.max(m, n) : m;
  }, 100);
  return `ORD-${max + 1}`;
}

export const STATUS_LABEL: Record<Status, string> = {
  queued: "待接批",
  in_progress: "施工中",
  recheck: "待复检",
  done: "已完工",
};

// ---------- 示例数据 ----------

const seedState: StationState = {
  activeCustomerId: null,
  batchBoardIds: [],
  customers: [
    {
      id: "C1",
      name: "陈默",
      phone: "138-0010-2210",
      prefVersions: [
        {
          version: 1,
          wax: "高氟竞速蜡",
          bite: "强咬雪",
          note: "刻滑训练，刃口要锋利",
          changedAt: "2026-09-15T10:20:00+08:00",
        },
      ],
    },
    {
      id: "C2",
      name: "林一帆",
      phone: "139-5520-8833",
      prefVersions: [
        {
          version: 1,
          wax: "低温粉雪蜡",
          bite: "弱咬雪",
          note: "粉雪周使用，保持弱咬雪手感",
          changedAt: "2026-09-16T14:05:00+08:00",
        },
      ],
    },
    {
      id: "C3",
      name: "张磊",
      phone: "137-9001-4421",
      prefVersions: [
        {
          version: 1,
          wax: "通用温区蜡",
          bite: "中等咬雪",
          note: "日常机压雪道滑行",
          changedAt: "2026-09-05T09:00:00+08:00",
        },
        {
          version: 2,
          wax: "低温蜡",
          bite: "弱咬雪",
          note: "改练公园道具，降低抓地力",
          changedAt: "2026-09-17T18:40:00+08:00",
        },
      ],
    },
  ],
  boards: [
    {
      id: "ORD-106",
      customerId: "C3",
      brand: "Burton Custom",
      length: 156,
      shape: "全地域",
      sideEdge: 88,
      baseEdge: 1,
      wax: "低温蜡",
      baseDamage: false,
      repairSpots: [],
      status: "done",
      prefVersionAtAccept: 1,
      prefVersionAtDone: 1,
      createdAt: "2026-09-10T11:00:00+08:00",
      completedAt: "2026-09-12T16:30:00+08:00",
    },
    {
      // 有底板损伤但未填修补位置：接批时会触发整批拒绝
      id: "ORD-112",
      customerId: "C1",
      brand: "Volkl Racetiger",
      length: 165,
      shape: "竞速板",
      sideEdge: 87,
      baseEdge: 1,
      wax: "P-Tex 修补后加高氟竞速蜡",
      baseDamage: true,
      repairSpots: [],
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: "2026-09-17T09:30:00+08:00",
      completedAt: null,
    },
    {
      id: "ORD-120",
      customerId: "C1",
      brand: "Fischer RC4",
      length: 172,
      shape: "竞速板",
      sideEdge: 86,
      baseEdge: 1,
      wax: "高氟竞速蜡",
      baseDamage: false,
      repairSpots: [],
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: "2026-09-17T09:35:00+08:00",
      completedAt: null,
    },
    {
      id: "ORD-118",
      customerId: "C2",
      brand: "Burton Fish",
      length: 158,
      shape: "粉雪板",
      sideEdge: 89,
      baseEdge: 1,
      wax: "低温粉雪蜡",
      baseDamage: true,
      repairSpots: ["middle", "waist"],
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: "2026-09-18T13:10:00+08:00",
      completedAt: null,
    },
    {
      id: "ORD-122",
      customerId: "C2",
      brand: "Gentemstick Mantaray",
      length: 162,
      shape: "粉雪板",
      sideEdge: 89,
      baseEdge: 1,
      wax: "低温粉雪蜡",
      baseDamage: false,
      repairSpots: [],
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: "2026-09-18T13:15:00+08:00",
      completedAt: null,
    },
    {
      id: "ORD-126",
      customerId: "C3",
      brand: "Capita DOA",
      length: 152,
      shape: "公园板",
      sideEdge: 89,
      baseEdge: 0.5,
      wax: "低温蜡",
      baseDamage: false,
      repairSpots: [],
      status: "queued",
      prefVersionAtAccept: null,
      prefVersionAtDone: null,
      createdAt: "2026-09-18T17:45:00+08:00",
      completedAt: null,
    },
  ],
};

// ---------- 浏览器本地存储 ----------

const STORAGE_KEY = "hxyfront-62004-ski-batch-station-v1";

export function loadState(): StationState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as StationState;
      if (Array.isArray(parsed.boards) && Array.isArray(parsed.customers)) {
        return parsed;
      }
    }
  } catch {
    // 数据损坏时回退到示例数据
  }
  return JSON.parse(JSON.stringify(seedState)) as StationState;
}

export function saveState(state: StationState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景忽略写入失败
  }
}

export function resetState(): StationState {
  return JSON.parse(JSON.stringify(seedState)) as StationState;
}
