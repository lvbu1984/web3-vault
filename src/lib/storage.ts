// src/lib/storage.ts

// 你的节点类型（节点池中的一个节点）
export type StorageNode = {
  id: string;
  label: string;
  reliability: number;        // 0 ~ 1
  basePriceMultiplier: number;
  tags: string[];
  online: boolean;
};

// 冗余策略：随机 or 手动
export type ReplicationStrategy = "random" | "manual";

// 上传时的冗余配置
export type UploadReplicationConfig = {
  copies: number;                // 存几份
  strategy: ReplicationStrategy; // "random" | "manual"
  selectedNodeIds?: string[];    // 手动模式下勾选的节点
};

// 某个文件在单个节点上的存储结果
export type FilePlacement = {
  nodeId: string;
  nodeLabel: string;
  status: "pending" | "active" | "failed";
  cid?: string;
};

// 整个文件的元数据（多节点）
export type StoredFileMeta = {
  fileId: string;
  name: string;
  size: number;
  placements: FilePlacement[];
};

// 你的节点池（先写几个示例节点，后面可以改成你自己的）
export const NODE_POOL: StorageNode[] = [
  {
    id: "node-hz-1",
    label: "Hangzhou · Vault-1",
    reliability: 0.99,
    basePriceMultiplier: 1.0,
    tags: ["fast", "secure"],
    online: true,
  },
  {
    id: "node-hk-1",
    label: "Hong Kong · Edge-1",
    reliability: 0.985,
    basePriceMultiplier: 1.1,
    tags: ["edge", "balanced"],
    online: true,
  },
  {
    id: "node-sg-1",
    label: "Singapore · Core-1",
    reliability: 0.992,
    basePriceMultiplier: 1.2,
    tags: ["premium", "secure"],
    online: true,
  },
  {
    id: "node-eu-1",
    label: "EU · Archive-1",
    reliability: 0.97,
    basePriceMultiplier: 0.9,
    tags: ["cheap", "archival"],
    online: true,
  },
];

// 模拟的存储后端：现在只在本地打印日志，后面会接 Filecoin Onchain Cloud
export class MockStorageBackend {
  async uploadEncryptedFile(
    fileName: string,
    encryptedData: ArrayBuffer,
    replication: UploadReplicationConfig
  ): Promise<StoredFileMeta> {
    const nodes = pickNodes(replication);

    console.log("📦 [MockStorage] uploading:", {
      fileName,
      size: encryptedData.byteLength,
      replication,
      chosenNodes: nodes.map((n) => n.id),
    });

    const placements: FilePlacement[] = nodes.map((node, index) => ({
      nodeId: node.id,
      nodeLabel: node.label,
      status: "active",
      cid: `mock-cid-${index + 1}`,
    }));

    const meta: StoredFileMeta = {
      fileId: crypto.randomUUID(),
      name: fileName,
      size: encryptedData.byteLength,
      placements,
    };

    console.log("✅ [MockStorage] stored meta:", meta);
    return meta;
  }
}

// 从节点池里选出要用的节点
function pickNodes(replication: UploadReplicationConfig): StorageNode[] {
  const { copies, strategy, selectedNodeIds } = replication;

  // 手动模式：优先用用户选的节点
  if (strategy === "manual" && selectedNodeIds?.length) {
    const selected = NODE_POOL.filter((n) =>
      selectedNodeIds.includes(n.id)
    );
    if (selected.length > 0) {
      return selected.slice(0, copies);
    }
  }

  // 随机模式：从在线节点随机选 N 个
  const onlineNodes = NODE_POOL.filter((n) => n.online);
  return [...onlineNodes]
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(copies, onlineNodes.length));
}

