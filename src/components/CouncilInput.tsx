"use client";

import { ContextUsageRing } from "@/components/ContextUsageRing";
import { UPLOAD_TRUNCATE_CHARS } from "@/lib/prompts";
import { useRef } from "react";

export interface UploadState {
  filename: string;
  text: string;
  truncated: boolean;
}

interface CouncilInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  upload: UploadState | null;
  onUpload: (upload: UploadState | null) => void;
  compact?: boolean;
  usedTokens: number;
  documentTokens?: number;
  limitTokens: number;
  isOverLimit?: boolean;
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path
        d="M12 5v14M12 5l5 5M12 5L7 10"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CouncilInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  upload,
  onUpload,
  compact = false,
  usedTokens,
  documentTokens = 0,
  limitTokens,
  isOverLimit = false,
}: CouncilInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".txt")) {
      alert("Only .txt files are supported.");
      return;
    }

    const text = await file.text();
    const truncated = text.length > UPLOAD_TRUNCATE_CHARS;
    onUpload({
      filename: file.name,
      text: truncated ? text.slice(0, UPLOAD_TRUNCATE_CHARS) : text,
      truncated,
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!disabled && !isOverLimit && value.trim()) {
        onSubmit();
      }
    }
  };

  return (
    <div className={`w-full ${compact ? "" : "max-w-2xl"}`}>
      {upload && (
        <div className="mb-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-300">
            <span className="max-w-[200px] truncate">{upload.filename}</span>
            {upload.truncated && (
              <span className="text-xs text-amber-400">truncated</span>
            )}
            <button
              type="button"
              onClick={() => onUpload(null)}
              className="text-zinc-500 hover:text-zinc-200"
              aria-label="Remove attachment"
            >
              ×
            </button>
          </span>
        </div>
      )}

      <div className="council-input-bar flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 shadow-lg shadow-black/40">
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt"
          className="hidden"
          onChange={handleFileChange}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isOverLimit}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-100 focus-visible:outline-none disabled:opacity-40"
          aria-label="Attach text file"
        >
          <PlusIcon />
        </button>

        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isOverLimit}
          rows={1}
          placeholder="Ask anything"
          className="max-h-32 min-h-[36px] flex-1 resize-none border-0 bg-transparent py-1.5 text-base leading-normal text-zinc-100 shadow-none ring-0 outline-none placeholder:text-zinc-500 focus:border-0 focus:shadow-none focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none disabled:opacity-50"
        />

        <div className="ml-1 flex shrink-0 items-center gap-3">
          <ContextUsageRing
            usedTokens={usedTokens}
            documentTokens={documentTokens}
            limitTokens={limitTokens}
            isOverLimit={isOverLimit}
          />

          <button
            type="button"
            onClick={onSubmit}
            disabled={disabled || isOverLimit || !value.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-zinc-200 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <SendArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}
