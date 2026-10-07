"use client";

import { Download, Files, Languages } from "lucide-react";
import { useMemo, useState } from "react";
import { MaterialReviewButton } from "@/components/material-review-button";
import { MaterialStatus } from "@/components/status-badge";
import type { MaterialFormat, MaterialRecord, MaterialVersion } from "@/lib/types";

const kindLabel = {
  resume_ats: "ATS 简历",
  resume_hallmark: "Hallmark 简历",
  cover_letter: "Cover Letter",
} as const;

const languageLabel: Record<MaterialVersion["language"], string> = {
  en: "English",
  de: "Deutsch",
};

const formatLabel: Record<MaterialFormat, string> = {
  pdf: "PDF",
  docx: "DOCX",
  typ: "TYP",
  json: "JSON",
};

const formatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Vienna",
});

function unavailableLabel(file: MaterialVersion | undefined, demo: boolean) {
  if (demo) return "演示模式";
  if (file?.status === "compile_pending") return "待编译";
  if (file?.status === "failed") return "生成失败";
  return "暂无文件";
}

export function MaterialRecordCard({ record, demo }: { record: MaterialRecord; demo: boolean }) {
  const initialVariant = record.variants[0];
  const [language, setLanguage] = useState(initialVariant.language);
  const [version, setVersion] = useState(initialVariant.version);
  const languages = useMemo(() => [...new Set(record.variants.map((variant) => variant.language))], [record.variants]);
  const versions = useMemo(() => record.variants.filter((variant) => variant.language === language), [language, record.variants]);
  const selectedVariant = versions.find((variant) => variant.version === version) ?? versions[0];
  const filesByFormat = new Map(selectedVariant.files.map((file) => [file.format, file]));
  const reviewVersionId = selectedVariant.files.find((file) => file.status === "draft")?.id;

  function selectLanguage(nextLanguage: MaterialVersion["language"]) {
    const latestForLanguage = record.variants.find((variant) => variant.language === nextLanguage);
    if (!latestForLanguage) return;
    setLanguage(nextLanguage);
    setVersion(latestForLanguage.version);
  }

  return (
    <article className="material-record">
      <header className="material-record__header">
        <div className="material-record__mark"><Files aria-hidden="true" size={21} /><span>{kindLabel[record.kind]}</span></div>
        <div className="material-record__identity">
          <p className="eyebrow">{record.company}</p>
          <h2>{record.jobTitle}</h2>
          <p>{kindLabel[record.kind]}</p>
        </div>
        <div className="material-record__languages" aria-label="材料语言" role="group">
          <Languages aria-hidden="true" size={17} />
          {languages.map((item) => (
            <button
              aria-pressed={item === language}
              className="material-language"
              data-active={item === language}
              key={item}
              onClick={() => selectLanguage(item)}
              type="button"
            >
              {languageLabel[item]}
            </button>
          ))}
        </div>
      </header>

      <div className="material-record__body">
        <div className="material-record__version">
          <label htmlFor={`version-${record.id}`}>版本</label>
          <select
            id={`version-${record.id}`}
            onChange={(event) => setVersion(Number(event.target.value))}
            value={selectedVariant.version}
          >
            {versions.map((variant) => <option key={variant.id} value={variant.version}>v{variant.version}</option>)}
          </select>
        </div>

        <div className="material-record__meta">
          <MaterialStatus status={selectedVariant.status} />
          <span>{formatter.format(new Date(selectedVariant.createdAt))}</span>
          <span>{selectedVariant.model ?? "手动创建"}</span>
        </div>

        <div className="material-record__downloads" aria-label={`${kindLabel[record.kind]}下载格式`} role="group">
          {(["pdf", "docx", "typ", "json"] as const).map((format) => {
            const file = filesByFormat.get(format);
            const available = Boolean(file?.storagePath) && !demo;
            return available ? (
              <a className="material-download" href={`/api/files/${file!.id}`} key={format}>
                <span>{formatLabel[format]}</span>
                <small>下载</small>
                <Download aria-hidden="true" size={16} />
              </a>
            ) : (
              <span aria-disabled="true" className="material-download material-download--disabled" key={format}>
                <span>{formatLabel[format]}</span>
                <small>{unavailableLabel(file, demo)}</small>
              </span>
            );
          })}
        </div>

        {!demo && reviewVersionId ? (
          <div className="material-record__review">
            <MaterialReviewButton materialVersionId={reviewVersionId} />
            <small>审核会同时应用到此版本的全部格式</small>
          </div>
        ) : null}
      </div>
    </article>
  );
}
