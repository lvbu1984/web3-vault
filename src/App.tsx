import { useRef, useState } from "react";
import "./App.css";

/** ----------------- 类型定义 ----------------- **/

type ReplicationStrategy = "random" | "manual";

type StorageNode = {
  id: string;
  label: string;
  reliability: number;
  basePriceMultiplier: number;
};

type RecentFileStatus = "encrypted" | "uploading" | "error";

type RecentFile = {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
  status: RecentFileStatus;
  type: string;
};

type OnchainEventStatus = "pending" | "confirmed" | "error";

type OnchainEvent = {
  id: string;
  status: OnchainEventStatus;
  statusLabel: string;
  message: string;
  time: string;
};

/** ----------------- 示例数据 ----------------- **/

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

const initialFiles: RecentFile[] = [
  {
    id: "1",
    name: "Filecoin Community.docx",
    size: "15.7 KB",
    uploadedAt: "2025-11-21 13:50",
    status: "encrypted",
    type: "DOC",
  },
  {
    id: "2",
    name: "1.docx",
    size: "15.6 KB",
    uploadedAt: "2025-11-21 13:50",
    status: "encrypted",
    type: "DOC",
  },
  {
    id: "3",
    name: "passport_backup.pdf",
    size: "2.3 MB",
    uploadedAt: "2025-11-18 21:30",
    status: "encrypted",
    type: "PDF",
  },
  {
    id: "4",
    name: "family_photos_2024.zip",
    size: "1.2 GB",
    uploadedAt: "2025-11-16 19:02",
    status: "encrypted",
    type: "ZIP",
  },
  {
    id: "5",
    name: "seed_phrase.txt",
    size: "4.2 KB",
    uploadedAt: "2025-11-10 09:11",
    status: "encrypted",
    type: "TXT",
  },
];

const initialOnchainEvents: OnchainEvent[] = [
  {
    id: "e1",
    status: "confirmed",
    statusLabel: "ProofVerified",
    message: "File Filecoin Community.docx · PDP proof verified · warm storage active",
    time: "2025-11-21 13:50:58",
  },
  {
    id: "e2",
    status: "confirmed",
    statusLabel: "DealSubmitted",
    message: "Storage deal submitted to Filecoin Onchain Cloud",
    time: "2025-11-20 10:21:10",
  },
  {
    id: "e3",
    status: "confirmed",
    statusLabel: "Upload",
    message: "Uploaded seed_phrase.txt · 3 copies to your node pool",
    time: "2025-11-20 10:21:08",
  },
];

/** 定价：每 GB / 月 / 每份副本的基础价格（示例） */
const BASE_PRICE_PER_GB_PER_COPY = 0.0105; // 约算出来 12.3GB * 3 副本 ≈ 0.38 USDFC

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [copies, setCopies] = useState<number>(3);
  const [strategy, setStrategy] = useState<ReplicationStrategy>("random");
  const [nodeSearch, setNodeSearch] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(initialFiles);
  const [onchainEvents] = useState<OnchainEvent[]>(initialOnchainEvents);
  const [storageUsed, setStorageUsed] = useState<number>(12.3); // 示例：12.3GB / 100GB

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** 过滤节点（手动选择时用） */
  const filteredNodes = NODE_POOL.filter((node) => {
    if (!nodeSearch.trim()) return true;
    const q = nodeSearch.toLowerCase();
    return (
      node.id.toLowerCase().includes(q) ||
      node.label.toLowerCase().includes(q)
    );
  });

  /** 选择 / 取消选择 节点（最多 copies 个） */
  function toggleNodeSelection(id: string) {
    setSelectedNodeIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= copies) return prev;
      return [...prev, id];
    });
  }

  /** 选择文件（点击上传） */
  function handleBrowseClick() {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }

  /** 处理文件选择（点击或拖拽后统一走这里） */
  function handleFileSelect(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);

    const now = new Date();
    const timestamp = now.toISOString().slice(0, 16).replace("T", " ");

    const newEntries: RecentFile[] = files.map((file, idx) => {
      return {
        id: `${Date.now()}-${idx}`,
        name: file.name,
        size: formatFileSize(file.size),
        uploadedAt: timestamp,
        status: "encrypted", // 先假装立即加密完成
        type: guessFileType(file.name),
      };
    });

    setRecentFiles((prev) => [...newEntries, ...prev]);

    // 非严格的示例：简单把 storageUsed 加一点，模拟占用空间增长
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    setStorageUsed((prev) => {
      const next = prev + totalGB;
      return next > 100 ? 100 : parseFloat(next.toFixed(2));
    });
  }

  /** 拖拽释放 */
  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  }

  /** 当前总价（只显示总价） */
  const totalCost = storageUsed * copies * BASE_PRICE_PER_GB_PER_COPY;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col">
      {/* 顶部导航 */}
      <header className="border-b border-slate-900/70 bg-slate-950/90 backdrop-blur flex items-center justify-between px-6 py-4">
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
            <span className="tabular-nums text-slate-100">23.40</span>
          </div>

          <button className="px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/70 hover:bg-slate-800/80 text-slate-200 transition-colors">
            0x12ab...4fC9
          </button>
        </div>
      </header>

      {/* 中心内容 */}
      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="max-w-6xl w-full mx-auto flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* 左侧：主卡片（标题 + 上传 + 冗余设置） */}
          <section className="flex-1 bg-slate-950/80 border border-slate-900 rounded-3xl shadow-xl shadow-slate-950/40 p-6 md:p-8 space-y-6">
            {/* 标题 */}
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
                "mt-3 rounded-2xl border border-dashed p-8 flex flex-col items-center justify-center text-center cursor-pointer",
                "bg-slate-950/70 transition-colors",
                isDragging
                  ? "border-emerald-400/80 bg-slate-950"
                  : "border-slate-700/80 hover:border-emerald-400/70 hover:bg-slate-900/80",
              ].join(" ")}
            >
              <div className="mb-4 h-14 w-14 rounded-full bg-slate-900 flex items-center justify-center border border-slate-700">
                <span className="text-2xl">⬆️</span>
              </div>
              <p className="text-base md:text-lg font-medium text-slate-100">
                Drop files here or click to upload
              </p>
              <p className="text-xs md:text-sm text-slate-400 mt-1">
                Client-side encryption · Verifiable storage · No third-party
                access
              </p>

              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files)}
              />

              <div className="mt-4 flex flex-wrap justify-center gap-2 text-[11px] md:text-xs text-slate-400">
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

            {/* 冗余 & 节点选择区域 */}
            <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wide">
                    Redundancy & node selection
                  </div>
                  <div className="text-xs text-slate-500">
                    Choose how many copies to store and which storage nodes from
                    your trusted node pool.
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400">Copies</span>
                  <div className="flex gap-1">
                    {[1, 2, 3, 5].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCopies(n)}
                        className={[
                          "px-2.5 py-1 rounded-full border text-xs",
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
              </div>

              <div className="flex flex-col md:flex-row gap-4 text-xs">
                {/* 策略选择 */}
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

                {/* 手动选择节点 */}
                {strategy === "manual" && (
                  <div className="flex-1 space-y-2">
                    <div className="font-medium text-slate-200">
                      Choose nodes from your node pool
                    </div>

                    {/* 搜索框 */}
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={nodeSearch}
                        onChange={(e) => setNodeSearch(e.target.value)}
                        placeholder="Search by node name / ID / tag"
                        className="w-full rounded-xl bg-slate-950 border border-slate-800 px-3 py-1.5 text-[11px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-emerald-400/60 focus:border-emerald-400/60"
                      />
                      <div className="text-[11px] text-slate-500">
                        Type part of a node name, internal ID or tag to find
                        nodes you&apos;re familiar with.
                      </div>
                    </div>

                    {/* 节点列表 */}
                    <div className="max-h-40 overflow-auto rounded-xl border border-slate-800 bg-slate-950 divide-y divide-slate-800 mt-1">
                      {filteredNodes.length === 0 ? (
                        <div className="px-3 py-2 text-[11px] text-slate-500">
                          No nodes match &quot;{nodeSearch}&quot;.
                        </div>
                      ) : (
                        filteredNodes.map((node) => (
                          <label
                            key={node.id}
                            className="flex items-center gap-2 px-3 py-2 text-[11px] cursor-pointer hover:bg-slate-900/80"
                          >
                            <input
                              type="checkbox"
                              className="accent-emerald-400"
                              checked={selectedNodeIds.includes(node.id)}
                              onChange={() => toggleNodeSelection(node.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-slate-100">
                                  {node.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-slate-500 mt-0.5">
                                <span>
                                  Reliability:{" "}
                                  {(node.reliability * 100).toFixed(1)}%
                                </span>
                                <span>
                                  Price ×
                                  {node.basePriceMultiplier.toFixed(2)}
                                </span>
                              </div>
                            </div>
                          </label>
                        ))
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500">
                      You can select up to {copies} nodes. If fewer are
                      selected, the system will only store on the nodes you
                      chose.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 右侧：Recent files + Storage used + On-chain activity（两张卡 */}
          <aside className="w-full lg:w-80 space-y-4">
            {/* Recent files + Storage used + Price */}
            <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                  Recent files
                </h2>
                <button className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors">
                  View all
                </button>
              </div>

              <div className="space-y-2 overflow-hidden">
                {recentFiles.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No files yet. Start by uploading something important.
                  </p>
                ) : (
                  recentFiles.slice(0, 5).map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-3 rounded-xl px-2.5 py-2 hover:bg-slate-900/90 transition-colors"
                    >
                      <div className="h-8 w-8 rounded-lg bg-slate-900 flex items-center justify-center text-[11px] border border-slate-800">
                        <span className="text-slate-300">{file.type}</span>
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
                    </div>
                  ))
                )}
              </div>

              {/* Storage used + 总价 */}
              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500 space-y-1 mt-3">
                <div className="flex items-center justify-between">
                  <span>Storage used</span>
                  <span className="tabular-nums text-slate-300">
                    {storageUsed.toFixed(1)} GB / 100 GB
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
                  <div
                    className="h-full bg-emerald-400/80"
                    style={{ width: `${Math.min(storageUsed, 100)}%` }}
                  />
                </div>

                <div className="flex items-center justify-between mt-2">
                  <span>Total storage cost</span>
                  <span className="tabular-nums text-slate-200">
                    {totalCost.toFixed(2)} USDFC / month
                  </span>
                </div>
              </div>
            </div>

            {/* On-chain activity 独立卡片（在 Storage used 下面） */}
            <div className="bg-slate-950/80 border border-slate-900 rounded-2xl p-5 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                  On-chain activity
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  live
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mb-3">
                Storage deals, proofs and payments related to your uploads.
              </p>

              <div className="space-y-2 max-h-48 overflow-auto pr-1">
                {onchainEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="flex items-start gap-3 rounded-xl px-3 py-2 bg-slate-950 border border-slate-900"
                  >
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
                      {ev.statusLabel}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-slate-200">
                        {ev.message}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {ev.time}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* 页脚 */}
      <footer className="border-t border-slate-900/70 text-[11px] text-slate-500 py-3 px-6 flex items-center justify-between bg-slate-950/90">
        <span>
          © {new Date().getFullYear()} VaultX · Encrypted personal cloud
        </span>
        <span>Built on Filecoin · Filecoin Onchain Cloud · USDFC billing</span>
      </footer>
    </div>
  );
}

/** ----------------- 工具函数 ----------------- **/

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(1)} ${sizes[i]}`;
}

function guessFileType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) return "PDF";
  if (lower.endsWith(".zip") || lower.endsWith(".rar")) return "ZIP";
  if (lower.match(/\.(doc|docx)$/)) return "DOC";
  if (lower.match(/\.(xls|xlsx)$/)) return "XLS";
  if (lower.match(/\.(txt|md)$/)) return "TXT";
  if (lower.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "IMG";
  if (lower.match(/\.(mp4|mov|mkv)$/)) return "VID";
  return "FILE";
}

function statusLabel(status: RecentFileStatus): string {
  switch (status) {
    case "encrypted":
      return "Encrypted";
    case "uploading":
      return "Uploading…";
    case "error":
      return "Error";
    default:
      return "";
  }
}

export default App;
