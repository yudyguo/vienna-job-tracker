// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialRecordCard } from "@/components/material-record-card";
import type { MaterialRecord, MaterialVariant, MaterialVersion } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

function materialFile(language: "en" | "de", version: number, format: MaterialVersion["format"]): MaterialVersion {
  return {
    id: `${language}-${version}-${format}`,
    materialId: `material-${language}`,
    version,
    jobId: "job-1",
    jobTitle: "Product Designer",
    company: "Example",
    kind: "resume_ats",
    language,
    format,
    status: "reviewed",
    storagePath: `job-1/${language}/v${version}/document.${format}`,
    createdAt: `2026-08-${10 + version}T08:00:00.000Z`,
    model: "deepseek-v4-pro",
    factIds: ["fact-1"],
  };
}

function variant(language: "en" | "de", version: number): MaterialVariant {
  const files = (["pdf", "docx", "typ", "json"] as const).map((format) => materialFile(language, version, format));
  return {
    id: `material-${language}:v${version}`,
    materialId: `material-${language}`,
    language,
    version,
    status: "reviewed",
    createdAt: files[0].createdAt,
    model: "deepseek-v4-pro",
    factIds: ["fact-1"],
    files,
  };
}

const record: MaterialRecord = {
  id: "job-1:resume_ats",
  jobId: "job-1",
  jobTitle: "Product Designer",
  company: "Example",
  kind: "resume_ats",
  latestCreatedAt: "2026-08-12T08:00:00.000Z",
  variants: [variant("en", 2), variant("de", 1), variant("en", 1)],
};

describe("material record card", () => {
  it("switches language and downloads the selected language files from one record", () => {
    render(<MaterialRecordCard demo={false} record={record} />);

    expect(screen.getByRole("link", { name: "PDF下载" })).toHaveAttribute("href", "/api/files/en-2-pdf");
    fireEvent.click(screen.getByRole("button", { name: "Deutsch" }));
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("link", { name: "PDF下载" })).toHaveAttribute("href", "/api/files/de-1-pdf");
  });

  it("switches historical versions without creating another record", () => {
    render(<MaterialRecordCard demo={false} record={record} />);

    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.change(screen.getByRole("combobox", { name: "版本" }), { target: { value: "1" } });
    expect(screen.getByRole("link", { name: "DOCX下载" })).toHaveAttribute("href", "/api/files/en-1-docx");
  });
});
