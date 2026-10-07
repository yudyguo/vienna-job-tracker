import { describe, expect, it } from "vitest";
import { groupMaterialVersions } from "@/lib/materials/group-materials";
import type { MaterialVersion } from "@/lib/types";

function version(overrides: Partial<MaterialVersion> = {}): MaterialVersion {
  return {
    id: "file-1",
    materialId: "material-en",
    version: 1,
    jobId: "job-1",
    jobTitle: "Product Designer",
    company: "Example",
    kind: "resume_ats",
    language: "en",
    format: "pdf",
    status: "draft",
    storagePath: "job-1/resume.pdf",
    createdAt: "2026-08-10T08:00:00.000Z",
    model: "deepseek-v4-pro",
    factIds: ["fact-1"],
    ...overrides,
  };
}

describe("material library grouping", () => {
  it("collapses all file formats into one logical material variant", () => {
    const formats = ["json", "typ", "docx", "pdf"] as const;
    const records = groupMaterialVersions(formats.map((format, index) => version({ id: `file-${index}`, format })));

    expect(records).toHaveLength(1);
    expect(records[0].variants).toHaveLength(1);
    expect(records[0].variants[0].files.map((file) => file.format)).toEqual(["pdf", "docx", "typ", "json"]);
  });

  it("keeps languages and historical versions inside the same job and material record", () => {
    const records = groupMaterialVersions([
      version({ id: "en-v1", materialId: "material-en", language: "en", version: 1 }),
      version({ id: "en-v2", materialId: "material-en", language: "en", version: 2, createdAt: "2026-08-11T08:00:00.000Z" }),
      version({ id: "de-v1", materialId: "material-de", language: "de", version: 1, createdAt: "2026-08-11T09:00:00.000Z" }),
    ]);

    expect(records).toHaveLength(1);
    expect(records[0].variants).toHaveLength(3);
    expect(records[0].variants.map((variant) => `${variant.language}-v${variant.version}`)).toEqual(["de-v1", "en-v2", "en-v1"]);
  });

  it("does not combine different material kinds", () => {
    const records = groupMaterialVersions([
      version(),
      version({ id: "cover", materialId: "cover-en", kind: "cover_letter", format: "docx" }),
    ]);

    expect(records).toHaveLength(2);
    expect(records.map((record) => record.kind).sort()).toEqual(["cover_letter", "resume_ats"]);
  });

  it("shows a variant as reviewed only when every format has been reviewed or approved", () => {
    const reviewed = groupMaterialVersions([
      version({ id: "pdf", format: "pdf", status: "reviewed" }),
      version({ id: "docx", format: "docx", status: "approved" }),
    ]);
    const mixed = groupMaterialVersions([
      version({ id: "pdf", format: "pdf", status: "reviewed" }),
      version({ id: "docx", format: "docx", status: "draft" }),
    ]);

    expect(reviewed[0].variants[0].status).toBe("reviewed");
    expect(mixed[0].variants[0].status).toBe("draft");
  });
});
