"use client";

interface ContextUsageRingProps {
  usedTokens: number;
  limitTokens: number;
  documentTokens?: number;
  isOverLimit?: boolean;
}

export function ContextUsageRing({
  usedTokens,
  limitTokens,
  documentTokens = 0,
  isOverLimit = false,
}: ContextUsageRingProps) {
  const ratio = limitTokens > 0 ? Math.min(usedTokens / limitTokens, 1) : 0;
  const percent = Math.round(ratio * 100);
  const size = 20;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  const strokeColor = isOverLimit
    ? "#f87171"
    : ratio >= 0.9
      ? "#fbbf24"
      : "#a1a1aa";

  const documentLabel =
    documentTokens > 0
      ? `, incl. ${documentTokens.toLocaleString()} from attached document`
      : "";
  const tooltip = `Context usage — ${percent}% of ${Math.round(limitTokens / 1000)}k tokens (${usedTokens.toLocaleString()} estimated${documentLabel})`;

  return (
    <div className="group relative flex h-6 w-6 shrink-0 items-center justify-center">
      <span className="sr-only">{tooltip}</span>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-zinc-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>
      <div
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-200 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
      >
        {tooltip}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-zinc-700" />
      </div>
    </div>
  );
}
