import React from "react";

interface RichTextRendererProps {
  content: string;
  className?: string;
}

export function isHtmlContent(str: string): boolean {
  if (!str) return false;
  return /<\/?[a-z][\s\S]*>/i.test(str);
}

export function RichTextRenderer({ content, className = "" }: RichTextRendererProps) {
  if (!content) return null;

  const isHtml = isHtmlContent(content);

  if (!isHtml) {
    return (
      <div className={`whitespace-pre-wrap text-sm text-slate2-700 leading-relaxed ${className}`}>
        {content}
      </div>
    );
  }

  return (
    <div
      className={`prose-content text-sm text-slate2-700 leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
