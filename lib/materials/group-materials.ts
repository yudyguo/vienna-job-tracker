import type { MaterialRecord, MaterialVariant, MaterialVersion } from "@/lib/types";

const formatOrder: Record<MaterialVersion["format"], number> = {
  pdf: 0,
  docx: 1,
  typ: 2,
  json: 3,
};

const statusPriority: Record<MaterialVersion["status"], number> = {
  failed: 5,
  draft: 4,
  compile_pending: 3,
  reviewed: 2,
  approved: 1,
};

function aggregateStatus(files: MaterialVersion[]): MaterialVariant["status"] {
  if (files.length === 0) return "draft";
  if (files.every((file) => file.status === "approved")) return "approved";
  if (files.every((file) => file.status === "approved" || file.status === "reviewed")) return "reviewed";
  return files.reduce((current, file) => (
    statusPriority[file.status] > statusPriority[current] ? file.status : current
  ), files[0].status);
}

export function groupMaterialVersions(materials: MaterialVersion[]): MaterialRecord[] {
  const records = new Map<string, MaterialRecord>();
  const variantMaps = new Map<string, Map<string, MaterialVersion[]>>();

  for (const material of materials) {
    const recordId = `${material.jobId}:${material.kind}`;
    let record = records.get(recordId);
    if (!record) {
      record = {
        id: recordId,
        jobId: material.jobId,
        jobTitle: material.jobTitle,
        company: material.company,
        kind: material.kind,
        latestCreatedAt: material.createdAt,
        variants: [],
      };
      records.set(recordId, record);
      variantMaps.set(recordId, new Map());
    }

    if (new Date(material.createdAt).getTime() > new Date(record.latestCreatedAt).getTime()) {
      record.latestCreatedAt = material.createdAt;
    }

    const variantId = `${material.materialId}:v${material.version}`;
    const variants = variantMaps.get(recordId)!;
    const files = variants.get(variantId) ?? [];
    files.push(material);
    variants.set(variantId, files);
  }

  for (const record of records.values()) {
    const variants = variantMaps.get(record.id)!;
    record.variants = [...variants.entries()].map(([id, unsortedFiles]) => {
      const files = [...unsortedFiles].sort((left, right) => formatOrder[left.format] - formatOrder[right.format]);
      const first = files[0];
      return {
        id,
        materialId: first.materialId,
        language: first.language,
        version: first.version,
        status: aggregateStatus(files),
        createdAt: files.reduce((latest, file) => (
          new Date(file.createdAt).getTime() > new Date(latest).getTime() ? file.createdAt : latest
        ), first.createdAt),
        model: files.find((file) => file.model)?.model ?? null,
        factIds: [...new Set(files.flatMap((file) => file.factIds))],
        files,
      } satisfies MaterialVariant;
    }).sort((left, right) => {
      const createdDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      return createdDifference || right.version - left.version;
    });
  }

  return [...records.values()].sort((left, right) => (
    new Date(right.latestCreatedAt).getTime() - new Date(left.latestCreatedAt).getTime()
  ));
}
