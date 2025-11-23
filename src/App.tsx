import { useRef, useState, useEffect } from "react";
import "./App.css";

type ReplicationStrategy = "random" | "manual";

type StorageNode = {
  id: string;
  label: string;
  reliability: number;
  basePriceMultiplier: number;
};

const NODE_POOL: StorageNode[] = [
  {
    id: "f03080038",
    label: "Node f03080038 · Hangzhou IDC",
    reliability: 0.998,
    basePriceMultiplier: 1.0,
  },
  {
    id: "f0491919",
    label: "Node f0491919 · Shanghai DC",
    reliability: 0.996,
    basePriceMultiplier: 1.1,
  },
  {
    id: "f0123456",
    label: "Node f0123456 · Beijing DC",
    reliability: 0.995,
    basePriceMultiplier: 0.95,
  },
  {
    id: "f0654321",
    label: "Node f0654321 · Shenzhen DC",
    reliability: 0.997,
    basePriceMultiplier: 1.05,
  },
];

type RecentFileStatus = "encrypted" | "uploading" | "error";

type RecentFile = {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  status: RecentFileStatus;
  // 只有当前会话上传的文件才有真实内容，用于下载
  fileBlob?: File;
};

const initialFiles: RecentFile[] = [
  {
    id: "1",
    name: "Filecoin Community.docx",
    size: "15.7 KB",
    uploadedAt: "2025-11-21 13:50",
    status: "encrypted",
  },
  {
    id: "2",
    name: "passport_backup.pdf",
    size: "2.3 MB",
    uploadedAt: "2025-11-18 21:30",
    status: "encrypted",
  },
  {
    id: "3",
    name: "family_photos_2024.zip",
    size: "1.2 GB",
    uploadedAt: "2025-11-16 19:02",
    status: "encrypted",
  },
  {
    id: "4",
    name: "seed_phrase.txt",
    size: "4.2 KB",
    uploadedAt: "2025-11-10 09:11",
    status: "encrypted",
  },
];

type OnchainEventStatus = "pending" | "confirmed" | "error";

type OnchainEvent = {
  id: string;
  type: string;
  message: string;
  timestamp: string;
  status: OnchainEventStatus;
};

const initialOnchainEvents: OnchainEvent[] = [
  {
    id: "e1",
    type: "ProofVerified",
    message:
      "File Filecoin Community.docx · PDP proof verified · warm storage active",
    timestamp: "2025-11-21 13:50:58",
    status: "confirmed",
  },
  {
    id: "e2",
    type: "DealSubmitted",
    message:
      "Storage deal submitted to Filecoin Onchain Cloud · replication 3x",
    timestamp: "2025-11-20 10:21:10",
    status: "confirmed",
  },
  {
    id: "e3",
    type: "Upload",
    message: "Uploaded seed_phrase.txt · 3 copies to your node pool",
    timestamp: "2025-11-20 10:21:08",
    status: "confirmed",
  },
];

// === Storage & pricing model ===
const TOTAL_CAPACITY_GB = 100; // 目前不再展示上限了，仅保留常量
const INITIAL_STORAGE_USED_GB = 12.3;
const BASE_PRICE_PER_GB = 0.03; // USDFC / GB·month

function bytesToGb(bytes: number): number {
  return bytes / (1024 * 1024 * 1024);
}

function getNodePriceMultiplier(id: string): number {
  const node = NODE_POOL.find((n) => n.id === id);
  return node ? node.basePriceMultiplier : 1;
}

function calculateMonthlyCost(
  usedGb: number,
  copies: number,
  strategy: ReplicationStrategy,
  selectedNodeIds: string[]
): number {
  if (usedGb <= 0) return 0;

  let avgMultiplier = 1;

  if (strategy === "manual" && selectedNodeIds.length > 0) {
    const sum = selectedNodeIds.reduce(
      (acc, id) => acc + getNodePriceMultiplier(id),
      0
    );
    avgMultiplier = sum / selectedNodeIds.length;
  } else {
    const sum = NODE_POOL.reduce(
      (acc, node) => acc + node.basePriceMultiplier,
      0
    );
    avgMultiplier = sum / NODE_POOL.length;
  }

  return usedGb * copies * BASE_PRICE_PER_GB * avgMultiplier;
}

/**
 * 一个“假加密函数”：只是等待 400–1000ms，
 * 然后 15% 概率故意抛错，用来测试 error 状态的 UI
 */
function fakeEncrypt(file: File): Promise<void> {
  return new Promise((resolve, reject) => {
    const delay = 400 + Math.random() * 600; // 0.4s ~ 1s
    setTimeout(() => {
      const fail = Math.random() < 0.15; // 15% 概率失败
      if (fail) {
        reject(new Error(`Fake encrypt failed for ${file.name}`));
      } else {
        resolve();
      }
    }, delay);
  });
}

function App() {
  const [isDragging, setIsDragging] = useState(false);

  // 副本数：默认 1
  const [copies, setCopies] = useState<number>(1);

  const [strategy, setStrategy] = useState<ReplicationStrategy>("random");
  const [nodeSearch, setNodeSearch] = useState(""); // 现在作为“节点输入框”的值
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);

  // 历史文件（右侧 Recent files）
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(initialFiles);

  // 链上事件列表
  const [onchainEvents, setOnchainEvents] =
    useState<OnchainEvent[]>(initialOnchainEvents);

  // 实际已经占用的存储
  const [storageUsed, setStorageUsed] =
    useState<number>(INITIAL_STORAGE_USED_GB);

  // 存储时长（天）：30 / 90 / 180 / 360
  const [storageDurationDays, setStorageDurationDays] =
    useState<number>(30);

  // 当前这批“待上传”的文件
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  // 当前这批待上传文件的大小（GB）
  const [pendingSizeGb, setPendingSizeGb] = useState<number>(0);

  // 当前这批待上传文件的预估总价（USDFC）
  const [pendingCost, setPendingCost] = useState<number>(0);

  // UI 高亮：哪条最近文件刚变更状态
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [highlightedStatus, setHighlightedStatus] =
    useState<RecentFileStatus | null>(null);

  // USDFC 余额
  const [usdfcBalance] = useState<number>(23.4);

  // 右下角 Toast 提示
  const [toast, setToast] = useState<{ id: number; message: string } | null>(
    null
  );

  // 哪一行的三点菜单是打开的
  const [menuOpenForId, setMenuOpenForId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 任何影响价格的因素变化 → 重新计算“当前这批待上传”的估价
  useEffect(() => {
    const totalBytes = pendingFiles.reduce(
      (sum, file) => sum + file.size,
      0
    );
    const gb = bytesToGb(totalBytes);
    setPendingSizeGb(gb);

    const monthly = calculateMonthlyCost(
      gb,
      copies,
      strategy,
      selectedNodeIds
    );
    const total = monthly * (storageDurationDays / 30);
    setPendingCost(total);
  }, [pendingFiles, copies, strategy, selectedNodeIds, storageDurationDays]);

  // 这里虽然不再用列表展示节点，但逻辑保留，不影响 UI
  const filteredNodes = NODE_POOL.filter((node) => {
    if (!nodeSearch.trim()) return true;
    const q = nodeSearch.toLowerCase();
    return (
      node.id.toLowerCase().includes(q) ||
      node.label.toLowerCase().includes(q)
    );
  });

  function handleBrowseClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  // 手动添加节点（输入节点号 + Confirm）
  function handleConfirmNode() {
    const value = nodeSearch.trim();
    if (!value) return;

    setSelectedNodeIds((prev) => {
      if (prev.includes(value)) return prev;
      if (prev.length >= copies) return prev;
      return [...prev, value];
    });

    setNodeSearch("");
  }

  // 选择文件（仅放到“待上传列表”，不立刻上传）
  function handleFileSelect(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setPendingFiles(files);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }

  // 点击 Upload 按钮：余额校验 → 加密 → 上链 → 写入 recentFiles & on-chain
  async function handleUploadClick() {
    if (pendingFiles.length === 0) {
      alert("No file selected. Please drop or choose a file first.");
      return;
    }

    if (pendingCost <= 0) {
      alert("Cannot calculate cost for this upload, please try again.");
      return;
    }

    if (pendingCost > usdfcBalance) {
      alert(
        `USDFC balance is not enough for this upload.\n\n` +
          `Current balance: ${usdfcBalance.toFixed(2)} USDFC\n` +
          `Estimated cost (for this upload, ${storageDurationDays} days): ${pendingCost.toFixed(
            2
          )} USDFC\n\n` +
          `Please top up your balance, lower the number of copies, shorten the duration, or upload smaller files.`
      );
      return;
    }

    const now = new Date();
    const uploadedAt = now.toISOString().slice(0, 16).replace("T", " ");

    const newEntries: RecentFile[] = pendingFiles.map((file, idx) => ({
      id: `${now.getTime()}-${idx}`,
      name: file.name,
      size: formatFileSize(file.size),
      uploadedAt,
      status: "uploading",
      fileBlob: file,
    }));

    setRecentFiles((prev) => [...newEntries, ...prev]);

    pendingFiles.forEach((file, idx) => {
      const entryId = `${now.getTime()}-${idx}`;
      simulateEncryptAndUpload(file, entryId, uploadedAt);
    });

    setPendingFiles([]);
  }

  // 下载函数 + Toast
  function handleDownload(file: RecentFile) {
    if (!file.fileBlob) {
      alert(
        "This demo can only download files uploaded in this session.\n\n" +
          "The initial example files do not have real file content attached."
      );
      return;
    }

    const blob = file.fileBlob;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    const id = Date.now();
    setToast({
      id,
      message: `Download started: ${file.name}`,
    });
    setTimeout(() => {
      setToast((prev) => {
        if (!prev) return null;
        return prev.id === id ? null : prev;
      });
    }, 2000);
  }

  // 模拟加密 + 上链 + 写入 On-chain activity
  async function simulateEncryptAndUpload(
    file: File,
    entryId: string,
    uploadedAt: string
  ) {
    try {
      await fakeEncrypt(file);

      setRecentFiles((prev) =>
        prev.map((f) =>
          f.id === entryId ? { ...f, status: "encrypted" } : f
        )
      );

      setStorageUsed((prev) => prev + bytesToGb(file.size));

      const eventId =
        "ev-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const nodeInfo =
        strategy === "manual" && selectedNodeIds.length > 0
          ? `${selectedNodeIds.length} selected node(s)`
          : "your node pool";

      const pendingEvent: OnchainEvent = {
        id: eventId,
        type: "Upload",
        message: `Uploaded ${file.name} · ${copies} copies to ${nodeInfo}`,
        timestamp,
        status: "pending",
      };

      setOnchainEvents((prev) => [pendingEvent, ...prev]);

      setTimeout(() => {
        setOnchainEvents((prev) =>
          prev.map((ev) =>
            ev.id === eventId ? { ...ev, status: "confirmed" } : ev
          )
        );
      }, 700);

      setHighlightedId(entryId);
      setHighlightedStatus("encrypted");
      setTimeout(() => {
        setHighlightedId(null);
        setHighlightedStatus(null);
      }, 900);

      const id = Date.now() + 1;
      setToast({
        id,
        message: `Upload completed: ${file.name}`,
      });
      setTimeout(() => {
        setToast((prev) => {
          if (!prev) return null;
          return prev.id === id ? null : prev;
        });
      }, 2000);
    } catch (err) {
      console.error("Encrypt failed:", err);

      setRecentFiles((prev) =>
        prev.map((f) =>
          f.id === entryId ? { ...f, status: "error" } : f
        )
      );

      const eventId =
        "ev-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 6);
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");

      const errorEvent: OnchainEvent = {
        id: eventId,
        type: "Error",
        message: `Encryption failed for ${file.name} · nothing stored on-chain`,
        timestamp,
        status: "error",
      };

      setOnchainEvents((prev) => [errorEvent, ...prev]);

      setHighlightedId(entryId);
      setHighlightedStatus("error");
      setTimeout(() => {
        setHighlightedId(null);
        setHighlightedStatus(null);
      }, 900);
    }
  }

  return (
    <div className="min-h-screen bg-[#05070b] text-slate-100 flex flex-col">
      {/* 顶部导航 */}
      <header className="border-b border-slate-800/70 bg-[#05070b]/95 backdrop-blur-sm flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl border border-slate-700 flex items-center justify-center text-xs font-semibold tracking-tight">
            VX
          </div>
          <div>
            <div className="font-semibold tracking-tight">VaultX</div>
            <div className="text-xs text-slate-400">
              Security You Control · Encrypted personal cloud
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="px-3 py-1.5 rounded-full bg-slate-900/80 border border-slate-800 flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-slate-300">USDFC</span>
            <span className="tabular-nums text-slate-100">
              {usdfcBalance.toFixed(2)}
            </span>
          </div>

          <button className="px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/70 hover:bg-slate-800/80 text-slate-200 transition-colors">
            0x12ab...4fC9
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="max-w-6xl w-full mx-auto space-y-8">
          {/* 顶部：左上传，右 recent files */}
          <section className="flex flex-col lg:flex-row gap-8">
            {/* 左侧主卡片 */}
            <section className="flex-1 bg-slate-950/70 border border-slate-800/80 rounded-3xl backdrop-blur-md shadow-sm hover:shadow-md transition-shadow p-6 md:p-8 space-y-6">
              <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
                  Your encrypted personal cloud
                </h1>
                <p className="text-sm md:text-base text-slate-400 leading-relaxed">
                  Files are{" "}
                  <span className="text-emerald-400 font-medium">
                    encrypted locally
                  </span>{" "}
                  before leaving your device and stored on{" "}
                  <span className="text-sky-400 font-medium">
                    Filecoin Onchain Cloud
                  </span>
                  . Only you hold the keys.
                </p>
              </div>

              {/* 上传区域 */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                }}
                onDrop={handleDrop}
                onClick={handleBrowseClick}
                className={[
                  "mt-6 rounded-2xl border border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer",
                  "bg-slate-950/70 transition-colors",
                  isDragging
                    ? "border-emerald-400/80 bg-slate-950"
                    : "border-slate-700/80 hover:border-slate-500/90 hover:bg-slate-900/80",
                ].join(" ")}
              >
                <div className="mb-4 h-12 w-12 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700">
                  <span className="text-xl">⬆️</span>
                </div>
                <p className="text-base md:text-lg font-medium text-slate-100">
                  Drop files here or click to select
                </p>
                <p className="text-xs md:text-sm text-slate-500 mt-2">
                  Files will not be uploaded immediately. You can review cost and
                  confirm before uploading.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFileSelect(e.target.files)}
                />

                <div className="mt-4 flex flex-wrap justify-center gap-3 text-[11px] md:text-xs text-slate-400">
                  <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-slate-800">
                    AES-256 local encryption
                  </span>
                  <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-slate-800">
                    PDP-backed warm storage
                  </span>
                  <span className="px-2 py-1 rounded-full bg-slate-900/80 border border-slate-800">
                    Pay-as-you-store · USDFC
                  </span>
                </div>
              </div>

              {/* 冗余 & 节点选择 */}
              <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/70 p-4 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                      Redundancy & node selection
                    </div>
                    <div className="text-xs text-slate-500">
                      Choose how many copies to store and which storage nodes
                      from your trusted node pool.
                    </div>
                  </div>
                  {/* Copies 已移动到右侧卡片中，这里不再展示按钮 */}
                </div>

                <div className="flex flex-col md:flex-row gap-4 text-xs">
                  <div className="flex-1 space-y-2">
                    <div className="font-medium text-slate-200">Strategy</div>
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          className="accent-emerald-400"
                          checked={strategy === "random"}
                          onChange={() => setStrategy("random")}
                        />
                        <span className="text-slate-300">
                          Randomly distribute across your node pool{" "}
                          <span className="text-slate-500">(recommended)</span>
                        </span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          className="accent-emerald-400"
                          checked={strategy === "manual"}
                          onChange={() => setStrategy("manual")}
                        />
                        <span className="text-slate-300">
                          Manually select storage nodes
                        </span>
                      </label>
                    </div>
                  </div>

                  {/* 手动节点选择：输入节点号 + Confirm + 已选择节点卡片 */}
                  {strategy === "manual" && (
                    <div className="flex-1 space-y-3">
                      <div className="font-medium text-slate-200">
                        Choose nodes from your node pool
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={nodeSearch}
                            onChange={(e) => setNodeSearch(e.target.value)}
                            placeholder="Enter node ID (e.g. f0xxxx)"
                            className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 focus:border-emerald-400/60"
                          />
                          <button
                            type="button"
                            onClick={handleConfirmNode}
                            className="px-3 py-1.5 rounded-xl text-[11px] border border-emerald-500/70 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                          >
                            Confirm
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Enter the full node ID you&apos;re familiar with, then
                          click Confirm to add it.
                        </div>
                      </div>

                      {selectedNodeIds.length > 0 && (
                        <div className="mt-1 rounded-xl border border-slate-800 bg-slate-950/80 p-3 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                            Selected nodes
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedNodeIds.map((id) => (
                              <span
                                key={id}
                                className="px-2 py-1 rounded-full bg-slate-900 border border-slate-700 text-[11px] text-slate-100"
                              >
                                {id}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500">
                        You must select at least one node. If none is selected,
                        the system will automatically choose matching nodes for
                        you.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* 右侧：recent files + storage/price + Copies + Upload 按钮 */}
            <aside className="w-full lg:w-80 bg-slate-950/70 border border-slate-800/80 rounded-3xl p-5 flex flex-col gap-4">
              {/* Recent files 标题 */}
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                  Recent files
                </h2>
                {/* 按你的要求，去掉 View all 按钮 */}
              </div>

              {/* Recent files 列表：最多显示 4 行高度，可滚动 */}
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {recentFiles.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No files yet. Start by uploading something important.
                  </p>
                ) : (
                  recentFiles.map((file) => {
                    const isHighlighted = file.id === highlightedId;
                    const highlightClass =
                      isHighlighted && highlightedStatus === "encrypted"
                        ? "bg-emerald-500/10 border-emerald-500/40"
                        : isHighlighted && highlightedStatus === "error"
                        ? "bg-rose-500/10 border-rose-500/40"
                        : "";

                    return (
                      <div
                        key={file.id}
                        className={[
                          "relative flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-900/80 transition-colors border border-transparent",
                          highlightClass,
                        ].join(" ")}
                      >
                        <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center text-xs border border-slate-800">
                          <span className="text-slate-300">
                            {getFileIcon(file.name)}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <p className="text-xs font-medium truncate text-slate-100">
                              {file.name}
                            </p>
                            {file.status === "encrypted" && (
                              <span className="ml-1 text-[10px] text-emerald-400">
                                🔒
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {file.size} • {file.uploadedAt}
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-500">
                          {statusLabel(file.status)}
                        </span>

                        {/* 三点菜单按钮 */}
                        <button
                          type="button"
                          className="ml-1 text-[14px] text-slate-500 hover:text-slate-200 px-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuOpenForId((prev) =>
                              prev === file.id ? null : file.id
                            );
                          }}
                        >
                          ⋮
                        </button>

                        {/* 三点菜单内容 */}
                        {menuOpenForId === file.id && (
                          <div className="absolute right-2 top-9 z-10 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-[11px] shadow-lg">
                            <button
                              type="button"
                              className="block w-full text-left text-slate-300 hover:text-slate-100"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMenuOpenForId(null);
                                handleDownload(file);
                              }}
                            >
                              Download
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Storage used + 当前上传信息 + Duration + Copies + 估价 */}
              <div className="pt-3 border-t border-slate-800 text-[11px] text-slate-500 space-y-2">
                {/* 独立高亮的 Storage used 区域 */}
                <div className="py-3 border-y border-slate-800 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">
                    Storage used
                  </span>
                  <span className="text-lg font-semibold text-slate-100 tabular-nums">
                    {storageUsed.toFixed(3)} GB
                  </span>
                </div>

                {/* 从上到下：文件大小 → 存储天数 → 副本 → 预估费用 */}
                <div className="pt-2 space-y-2">
                  {/* 文件大小 / 当前上传 */}
                  <div className="flex items-center justify-between">
                    <span>Current upload</span>
                    <span className="tabular-nums text-slate-300">
                      {pendingFiles.length === 0
                        ? "No file selected"
                        : `${pendingFiles.length} file${
                            pendingFiles.length > 1 ? "s" : ""
                          } · ${pendingSizeGb.toFixed(3)} GB`}
                    </span>
                  </div>

                  {/* 存储天数 */}
                  <div className="flex items-center justify-between">
                    <span>Storage duration</span>
                    <select
                      value={storageDurationDays}
                      onChange={(e) =>
                        setStorageDurationDays(Number(e.target.value))
                      }
                      className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-400/70"
                    >
                      <option value={30}>30 days</option>
                      <option value={90}>90 days</option>
                      <option value={180}>180 days</option>
                      <option value={360}>360 days</option>
                    </select>
                  </div>

                  {/* 副本数 Copies（从左侧移动到这里） */}
                  <div className="flex items-center justify-between">
                    <span>Copies</span>
                    <div className="flex gap-1">
                      {[1, 2, 3, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => setCopies(n)}
                          className={[
                            "px-2.5 py-1 rounded-full border text-[11px]",
                            copies === n
                              ? "border-emerald-400/80 bg-emerald-400/10 text-emerald-200"
                              : "border-slate-700 bg-slate-950 text-slate-300 hover:border-slate-500",
                          ].join(" ")}
                        >
                          {n}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 预估费用 */}
                  <div className="flex items-center justify-between">
                    <span>Estimated cost (this upload)</span>
                    <span className="tabular-nums text-slate-300">
                      {pendingFiles.length === 0
                        ? "--"
                        : `${pendingCost.toFixed(4)} USDFC`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Upload 按钮：放在右边卡片最底部，居中 + 动画 */}
              <div className="pt-4 mt-2 flex justify-center">
                <button
                  type="button"
                  onClick={handleUploadClick}
                  disabled={pendingFiles.length === 0}
                  className={[
                    "px-5 py-2.5 rounded-full text-xs font-medium border shadow-sm transition-all",
                    pendingFiles.length === 0
                      ? "border-slate-700 bg-slate-900 text-slate-500 cursor-not-allowed"
                      : "border-emerald-500/80 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25 hover:shadow-emerald-500/30 hover:shadow-lg hover:scale-[1.02] animate-pulse",
                  ].join(" ")}
                >
                  {pendingFiles.length === 0
                    ? "Select files to upload"
                    : `Upload ${pendingFiles.length} file${
                        pendingFiles.length > 1 ? "s" : ""
                      }`}
                </button>
              </div>
            </aside>
          </section>

          {/* On-chain activity 卡片（保持原位置不变） */}
          <section className="bg-slate-950/70 border border-slate-800/80 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                  On-chain activity
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Storage deals, proofs and payments related to your uploads.
                </p>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                live
              </span>
            </div>

            <div className="mt-1 max-h-40 overflow-auto space-y-1">
              {onchainEvents.length === 0 ? (
                <p className="text-[11px] text-slate-500">
                  Waiting for on-chain events… Upload a file to see activity.
                </p>
              ) : (
                onchainEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-xl px-3 py-2 bg-slate-950 border border-slate-800"
                  >
                    <div className="mt-0.5">
                      <span
                        className={[
                          "inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium",
                          ev.status === "confirmed"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : ev.status === "pending"
                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/30"
                            : "bg-rose-500/10 text-rose-300 border border-rose-500/30",
                        ].join(" ")}
                      >
                        {ev.type}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-200 truncate">
                        {ev.message}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {ev.timestamp}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* 说明栏 */}
          <section className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 rounded-full border border-slate-700 items-center justify-center text-[11px]">
                ⓘ
              </span>
              <p>
                VaultX is a privacy-first personal vault. Files are encrypted
                client-side and stored across your own storage nodes with the
                redundancy level you choose.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Connected to Filecoin Onchain Cloud · Testnet</span>
            </div>
          </section>
        </div>
      </main>

      {/* 右下角 Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className="rounded-xl border border-slate-800 bg-slate-950/95 px-3 py-2 text-xs text-slate-200 shadow-xl flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* 底部 */}
      <footer className="border-t border-slate-800/70 text-[11px] text-slate-500 py-3 px-6 flex items-center justify-between bg-[#05070b]/95">
        <span>
          © {new Date().getFullYear()} VaultX · Encrypted personal cloud
        </span>
        <span>Built on Filecoin · Filecoin Onchain Cloud · USDFC billing</span>
      </footer>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${sizes[i]}`;
}

function getFileIcon(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".zip") || lower.endsWith(".rar")) return "ZIP";
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "IMG";
  if (lower.match(/\.(mp4|mov|mkv)$/)) return "VID";
  if (lower.match(/\.(doc|docx)$/)) return "DOC";
  if (lower.match(/\.(xls|xlsx)$/)) return "XLS";
  if (lower.match(/\.(txt|md)$/)) return "TXT";
  return "FILE";
}

function statusLabel(status: RecentFileStatus): string {
  switch (status) {
    case "encrypted":
      return "Encrypted";
    case "uploading":
      return "Encrypting…";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export default App;
