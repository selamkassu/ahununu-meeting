import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Link as LinkIcon,
  Smile,
  Paperclip,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
  X,
  Check,
  Plus,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Minus,
} from "lucide-react";

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
}

const EMOJI_CATEGORIES = [
  {
    name: "Logistics & Work",
    emojis: ["📦", "🚚", "🚛", "📋", "📊", "📈", "📌", "📎", "💼", "🏢", "📍", "⏱️", "🗓️", "🔍", "✈️", "🚢"],
  },
  {
    name: "Status & Signals",
    emojis: ["✅", "❌", "⚠️", "ℹ️", "🔔", "💡", "🎯", "🚀", "⏳", "🔒", "⭐", "🔥", "🤝", "👍", "👎", "👏"],
  },
  {
    name: "Emotions",
    emojis: ["😀", "😊", "🙂", "🤔", "🧐", "😎", "😇", "🎉", "🙌", "💬", "📝", "✍️", "💪", "💡", "✨", "☕"],
  },
];

export function RichTextEditor({
  value,
  onChange,
  placeholder = "Start writing the meeting minutes...",
  minHeight = "180px",
  disabled = false,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  // Popover modal states
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const [showImageModal, setShowImageModal] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");

  const [showTableModal, setShowTableModal] = useState(false);
  const [tableRows, setTableRows] = useState(3);
  const [tableCols, setTableCols] = useState(3);

  // Active toolbar state indicators
  const [activeStates, setActiveStates] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikeThrough: false,
    unorderedList: false,
    orderedList: false,
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
    formatBlock: "",
  });

  // Track initial hydration to avoid resetting cursor when typing
  const isInternalUpdate = useRef(false);

  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  };

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (sel && savedSelectionRef.current) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  const updateActiveStates = useCallback(() => {
    if (!editorRef.current || disabled) return;
    try {
      let fb = "";
      try {
        fb = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
      } catch {}
      setActiveStates({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
        strikeThrough: document.queryCommandState("strikeThrough"),
        unorderedList: document.queryCommandState("insertUnorderedList"),
        orderedList: document.queryCommandState("insertOrderedList"),
        alignLeft: document.queryCommandState("justifyLeft"),
        alignCenter: document.queryCommandState("justifyCenter"),
        alignRight: document.queryCommandState("justifyRight"),
        alignJustify: document.queryCommandState("justifyFull"),
        formatBlock: fb,
      });
    } catch {
      // Ignore queryCommand errors if unsupported in current context
    }
  }, [disabled]);

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    // Normalize empty content
    if (html === "<p><br></p>" || html === "<br>" || html === "<div><br></div>") {
      onChange("");
    } else {
      onChange(html);
    }
    updateActiveStates();
  };

  const exec = (command: string, val: string | undefined = undefined) => {
    if (disabled) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(command, false, val);
    handleInput();
    updateActiveStates();
  };

  const toggleBlock = (tag: string) => {
    if (disabled) return;
    editorRef.current?.focus();
    restoreSelection();
    let current = "";
    try {
      current = (document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
    } catch {}
    if (current === tag) {
      document.execCommand("formatBlock", false, "<p>");
    } else {
      document.execCommand("formatBlock", false, `<${tag}>`);
    }
    handleInput();
    updateActiveStates();
  };

  const insertHorizontalRule = () => {
    if (disabled) return;
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("insertHorizontalRule", false, undefined);
    handleInput();
  };

  // 1. Link handling
  const openLinkModal = () => {
    saveSelection();
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    setLinkText(text);
    setLinkUrl("");
    setShowLinkModal(true);
  };

  const insertLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }
    editorRef.current?.focus();
    restoreSelection();

    const formattedUrl = linkUrl.startsWith("http://") || linkUrl.startsWith("https://") || linkUrl.startsWith("mailto:")
      ? linkUrl.trim()
      : `https://${linkUrl.trim()}`;

    if (linkText.trim()) {
      const a = document.createElement("a");
      a.href = formattedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = linkText.trim();
      a.className = "text-brand underline hover:text-brand-dark";
      
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        range.setStartAfter(a);
        range.setEndAfter(a);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      document.execCommand("createLink", false, formattedUrl);
    }

    handleInput();
    setShowLinkModal(false);
  };

  // 2. Emoji handling
  const insertEmoji = (emoji: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand("insertText", false, emoji);
    handleInput();
    setShowEmojiPicker(false);
  };

  // 3. Image handling
  const openImageModal = () => {
    saveSelection();
    setImageUrl("");
    setImageAlt("");
    setShowImageModal(true);
  };

  const insertImageByUrl = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrl.trim()) {
      setShowImageModal(false);
      return;
    }
    editorRef.current?.focus();
    restoreSelection();
    const imgHtml = `<img src="${imageUrl.trim()}" alt="${imageAlt.trim() || "Image"}" style="max-width:100%; height:auto; border-radius:8px; margin:8px 0; border:1px solid #E4E7EC;" />`;
    document.execCommand("insertHTML", false, imgHtml);
    handleInput();
    setShowImageModal(false);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editorRef.current?.focus();
      restoreSelection();
      const imgHtml = `<img src="${base64}" alt="${file.name}" style="max-width:100%; height:auto; border-radius:8px; margin:8px 0; border:1px solid #E4E7EC;" />`;
      document.execCommand("insertHTML", false, imgHtml);
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
    setShowImageModal(false);
  };

  // 4. File attachment handling
  const handleAttachmentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const sizeStr = file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;
      
      editorRef.current?.focus();
      restoreSelection();
      const chipHtml = `<a href="${dataUrl}" download="${file.name}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate2-200 bg-slate2-50 my-1 font-mono text-xs text-slate2-700 hover:bg-slate2-100 hover:text-brand transition-colors no-underline" contenteditable="false">📎 <span class="font-medium">${file.name}</span> <span class="text-slate2-400">(${sizeStr})</span></a>&nbsp;`;
      document.execCommand("insertHTML", false, chipHtml);
      handleInput();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // 5. Table handling
  const openTableModal = () => {
    saveSelection();
    setShowTableModal(true);
  };

  const insertTable = (e: React.FormEvent) => {
    e.preventDefault();
    editorRef.current?.focus();
    restoreSelection();

    const rows = Math.max(1, Math.min(10, tableRows));
    const cols = Math.max(1, Math.min(10, tableCols));

    let html = `<table style="width:100%; border-collapse:collapse; margin:12px 0; border:1px solid #E4E7EC; border-radius:8px; overflow:hidden;"><thead><tr>`;
    for (let c = 1; c <= cols; c++) {
      html += `<th style="border:1px solid #E4E7EC; background-color:#F6F7F9; padding:8px 12px; font-weight:600; text-align:left; color:#28394A; font-size:13px;">Header ${c}</th>`;
    }
    html += `</tr></thead><tbody>`;
    for (let r = 1; r <= rows; r++) {
      html += `<tr>`;
      for (let c = 1; c <= cols; c++) {
        html += `<td style="border:1px solid #E4E7EC; padding:8px 12px; color:#3B5166; font-size:13px;">Data ${r}, ${c}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table><p><br></p>`;

    document.execCommand("insertHTML", false, html);
    handleInput();
    setShowTableModal(false);
  };

  const isEditorEmpty = !value || value === "<p><br></p>" || value === "<br>" || value.trim() === "";

  return (
    <div className={`relative rounded-xl border border-slate2-200 bg-white transition-all shadow-sm ${
      disabled ? "opacity-75 bg-slate2-50 cursor-not-allowed" : "focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
    }`}>
      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleAttachmentUpload}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageFileUpload}
      />

      {/* Editor Toolbar */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate2-100 bg-slate2-50/70 p-2 rounded-t-xl select-none">
        {/* Undo / Redo */}
        <div className="flex items-center gap-0.5 pr-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Undo (Ctrl+Z)"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("undo"); }}
            className="rounded p-1.5 text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800 disabled:opacity-40 transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("redo"); }}
            className="rounded p-1.5 text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800 disabled:opacity-40 transition-colors"
          >
            <Redo2 size={15} />
          </button>
        </div>

        {/* Headings (H1, H2, H3) */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Heading 1"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); toggleBlock("h1"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "h1"
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Heading1 size={15} />
          </button>
          <button
            type="button"
            title="Heading 2"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); toggleBlock("h2"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "h2"
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Heading2 size={15} />
          </button>
          <button
            type="button"
            title="Heading 3"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); toggleBlock("h3"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "h3"
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Heading3 size={15} />
          </button>
        </div>

        {/* Text Styles (Bold, Italic, Underline, Strikethrough) */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Bold (Ctrl+B)"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("bold"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.bold
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Bold size={15} />
          </button>
          <button
            type="button"
            title="Italic (Ctrl+I)"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("italic"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.italic
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("underline"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.underline
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Underline size={15} />
          </button>
          <button
            type="button"
            title="Strikethrough"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.strikeThrough
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Strikethrough size={15} />
          </button>
        </div>

        {/* Lists (Bullet, Numbered) */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Bullet list"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.unorderedList
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <List size={15} />
          </button>
          <button
            type="button"
            title="Numbered list"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.orderedList
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <ListOrdered size={15} />
          </button>
        </div>

        {/* Quote, Code, Horizontal Line */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Quote"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); toggleBlock("blockquote"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "blockquote"
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Quote size={15} />
          </button>
          <button
            type="button"
            title="Code formatting"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); toggleBlock("pre"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "pre"
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Code size={15} />
          </button>
          <button
            type="button"
            title="Horizontal line"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); insertHorizontalRule(); }}
            className="rounded p-1.5 text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800 disabled:opacity-40 transition-colors"
          >
            <Minus size={15} />
          </button>
        </div>

        {/* Text Alignment (Left, Center, Right, Justify) */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Align Left"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignLeft
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignLeft size={15} />
          </button>
          <button
            type="button"
            title="Align Center"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignCenter
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignCenter size={15} />
          </button>
          <button
            type="button"
            title="Align Right"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("justifyRight"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignRight
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignRight size={15} />
          </button>
          <button
            type="button"
            title="Align Justify"
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); exec("justifyFull"); }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignJustify
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignJustify size={15} />
          </button>
        </div>

        {/* Media & Embeds (Link, Emoji, Attach File, Insert Image, Insert Table) */}
        <div className="flex items-center gap-0.5 pl-1.5">
          <button
            type="button"
            title="Insert link"
            disabled={disabled}
            onClick={openLinkModal}
            className={`rounded p-1.5 transition-colors ${
              showLinkModal
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <LinkIcon size={15} />
          </button>
          <button
            type="button"
            title="Insert Emoji"
            disabled={disabled}
            onClick={() => {
              saveSelection();
              setShowEmojiPicker((v) => !v);
            }}
            className={`rounded p-1.5 transition-colors ${
              showEmojiPicker
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Smile size={15} />
          </button>
          <button
            type="button"
            title="Attach file"
            disabled={disabled}
            onClick={() => {
              saveSelection();
              fileInputRef.current?.click();
            }}
            className="rounded p-1.5 text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800 transition-colors"
          >
            <Paperclip size={15} />
          </button>
          <button
            type="button"
            title="Insert image"
            disabled={disabled}
            onClick={openImageModal}
            className={`rounded p-1.5 transition-colors ${
              showImageModal
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <ImageIcon size={15} />
          </button>
          <button
            type="button"
            title="Insert table"
            disabled={disabled}
            onClick={openTableModal}
            className={`rounded p-1.5 transition-colors ${
              showTableModal
                ? "bg-brand/15 text-brand"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <TableIcon size={15} />
          </button>
        </div>
      </div>

      {/* Popovers & Modals */}
      {/* 1. Insert Link Modal */}
      {showLinkModal && (
        <div className="absolute top-12 left-4 z-30 w-80 rounded-xl border border-slate2-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate2-100">
            <span className="text-xs font-semibold text-slate2-800">Insert Link</span>
            <button
              type="button"
              onClick={() => setShowLinkModal(false)}
              className="text-slate2-400 hover:text-slate2-600"
            >
              <X size={14} />
            </button>
          </div>
          <form onSubmit={insertLink} className="space-y-3 pt-3">
            <div>
              <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                Link URL
              </label>
              <input
                type="text"
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                placeholder="https://example.com"
                autoFocus
                className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                Display Text (optional)
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link title"
                className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-brand"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="rounded-md px-2.5 py-1 text-xs text-slate2-600 hover:bg-slate2-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!linkUrl.trim()}
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-light disabled:opacity-50"
              >
                Insert Link
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 2. Emoji Picker Popover */}
      {showEmojiPicker && (
        <div className="absolute top-12 left-28 z-30 w-72 rounded-xl border border-slate2-200 bg-white p-3 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate2-100 mb-2">
            <span className="text-xs font-semibold text-slate2-800">Select Emoji</span>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(false)}
              className="text-slate2-400 hover:text-slate2-600"
            >
              <X size={14} />
            </button>
          </div>
          <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
            {EMOJI_CATEGORIES.map((cat) => (
              <div key={cat.name}>
                <p className="text-[10px] font-semibold text-slate2-400 uppercase tracking-wider mb-1">
                  {cat.name}
                </p>
                <div className="grid grid-cols-8 gap-1">
                  {cat.emojis.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => insertEmoji(emoji)}
                      className="flex h-7 w-7 items-center justify-center rounded hover:bg-slate2-100 text-sm transition-transform active:scale-125"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Insert Image Modal */}
      {showImageModal && (
        <div className="absolute top-12 left-44 z-30 w-80 rounded-xl border border-slate2-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate2-100">
            <span className="text-xs font-semibold text-slate2-800">Insert Image</span>
            <button
              type="button"
              onClick={() => setShowImageModal(false)}
              className="text-slate2-400 hover:text-slate2-600"
            >
              <X size={14} />
            </button>
          </div>
          <form onSubmit={insertImageByUrl} className="space-y-3 pt-3">
            <div>
              <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                Image Web URL
              </label>
              <input
                type="text"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                autoFocus
                className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                Alt Description (optional)
              </label>
              <input
                type="text"
                value={imageAlt}
                onChange={(e) => setImageAlt(e.target.value)}
                placeholder="e.g. Chart diagram"
                className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-brand"
              />
            </div>
            <div className="pt-1">
              <span className="block text-center text-[10px] text-slate2-400 mb-2">— OR —</span>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="w-full rounded-md border border-dashed border-slate2-300 bg-slate2-50 py-2 text-xs font-medium text-slate2-600 hover:bg-slate2-100 flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus size={13} /> Upload Local Image
              </button>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate2-100">
              <button
                type="button"
                onClick={() => setShowImageModal(false)}
                className="rounded-md px-2.5 py-1 text-xs text-slate2-600 hover:bg-slate2-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!imageUrl.trim()}
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-light disabled:opacity-50"
              >
                Insert URL
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 4. Insert Table Modal */}
      {showTableModal && (
        <div className="absolute top-12 left-52 z-30 w-72 rounded-xl border border-slate2-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate2-100">
            <span className="text-xs font-semibold text-slate2-800">Insert Table</span>
            <button
              type="button"
              onClick={() => setShowTableModal(false)}
              className="text-slate2-400 hover:text-slate2-600"
            >
              <X size={14} />
            </button>
          </div>
          <form onSubmit={insertTable} className="space-y-3 pt-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                  Rows
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={tableRows}
                  onChange={(e) => setTableRows(parseInt(e.target.value) || 1)}
                  className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 focus:outline-none focus:border-brand"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate2-600 mb-1">
                  Columns
                </label>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={tableCols}
                  onChange={(e) => setTableCols(parseInt(e.target.value) || 1)}
                  className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 focus:outline-none focus:border-brand"
                />
              </div>
            </div>
            <p className="text-[11px] text-slate2-400">
              Creates a table with a styled header row and {tableRows} rows.
            </p>
            <div className="flex justify-end gap-2 pt-1 border-t border-slate2-100">
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="rounded-md px-2.5 py-1 text-xs text-slate2-600 hover:bg-slate2-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white hover:bg-brand-light"
              >
                Create Table
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Editable Content Area */}
      <div className="relative">
        {/* Placeholder overlay when editor is empty */}
        {isEditorEmpty && !disabled && (
          <div
            onClick={() => editorRef.current?.focus()}
            className="absolute top-3 left-4 text-sm text-slate2-400 pointer-events-none select-none"
          >
            {placeholder}
          </div>
        )}

        <div
          ref={editorRef}
          contentEditable={!disabled}
          onInput={handleInput}
          onKeyUp={updateActiveStates}
          onMouseUp={updateActiveStates}
          onFocus={updateActiveStates}
          onBlur={saveSelection}
          style={{ minHeight }}
          className={`rich-editor-content p-4 text-sm text-slate2-800 leading-relaxed focus:outline-none overflow-y-auto ${
            disabled ? "cursor-not-allowed text-slate2-600" : ""
          }`}
          spellCheck
        />
      </div>
    </div>
  );
}
