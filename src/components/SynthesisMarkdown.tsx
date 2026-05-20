"use client";

import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  extractDirectAnswerMarkdown,
  normalizeSynthesisParagraphs,
} from "@/lib/synthesis-markdown";

const synthesisComponents: Components = {
  hr: () => null,
  em: ({ children }) => <span className="not-italic">{children}</span>,
  i: ({ children }) => <span className="not-italic">{children}</span>,
  p: ({ children }) => (
    <p className="mb-6 mt-0 leading-[1.5] text-neutral-300 last:mb-0">
      {children}
    </p>
  ),
  h1: ({ children }) => (
    <h1 className="mb-4 mt-8 text-2xl font-medium leading-[1.5] text-neutral-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-4 mt-8 text-xl font-medium leading-[1.5] text-neutral-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-3 mt-6 text-lg font-medium leading-[1.5] text-neutral-100 first:mt-0">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="my-6 list-disc space-y-2 pl-6 leading-[1.5] text-neutral-300">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-6 list-decimal space-y-2 pl-6 leading-[1.5] text-neutral-300">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-[1.5]">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-100">{children}</strong>
  ),
};

interface SynthesisMarkdownProps {
  children: string;
  className?: string;
}

export function SynthesisMarkdown({ children, className = "" }: SynthesisMarkdownProps) {
  const cleaned = normalizeSynthesisParagraphs(
    extractDirectAnswerMarkdown(children),
  );

  return (
    <article className={`synthesis-prose max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={synthesisComponents}>
        {cleaned}
      </ReactMarkdown>
    </article>
  );
}
