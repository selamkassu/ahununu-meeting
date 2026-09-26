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
  Plus,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  Code,
  Minus,
  Unlink,
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
    name: "Emotions & Actions",
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
  const savedRangeRef = useRef<Range | null>(null);

  // Popover modal states
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");
  const [isEditingExistingLink, setIsEditingExistingLink] = useState(false);

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
    code: false,
    link: false,
    unorderedList: false,
    orderedList: false,
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    alignJustify: false,
    formatBlock: "",
  });

  // Track internal typing to avoid resetting cursor
  const isInternalUpdate = useRef(false);

  // Sync external value with editor innerHTML
  useEffect(() => {
    if (editorRef.current && !isInternalUpdate.current) {
      if (editorRef.current.innerHTML !== (value || "")) {
        editorRef.current.innerHTML = value || "";
      }
    }
    isInternalUpdate.current = false;
  }, [value]);

  // Continuously save active range inside editor
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
    try {
      const range = sel.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedRangeRef.current = range.cloneRange();
      }
    } catch {}
  }, []);

  // Restore saved range inside editor
  const restoreSelection = useCallback(() => {
    if (!savedRangeRef.current || !editorRef.current) return;
    const sel = window.getSelection();
    if (!sel) return;
    try {
      sel.removeAllRanges();
      sel.addRange(savedRangeRef.current);
    } catch {}
  }, []);

  // Detect active formatting at cursor / selection
  const updateActiveStates = useCallback(() => {
    if (!editorRef.current || disabled) return;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    try {
      const range = sel.getRangeAt(0);
      if (!editorRef.current.contains(range.commonAncestorContainer)) return;

      let isBold = false;
      let isItalic = false;
      let isUnderline = false;
      let isStrike = false;
      let isCode = false;
      let isLink = false;
      let blockTag = "";
      let isUl = false;
      let isOl = false;
      let align = "";

      try {
        isBold = document.queryCommandState("bold");
        isItalic = document.queryCommandState("italic");
        isUnderline = document.queryCommandState("underline");
        isStrike = document.queryCommandState("strikeThrough");
        isUl = document.queryCommandState("insertUnorderedList");
        isOl = document.queryCommandState("insertOrderedList");
      } catch {}

      // Walk up the DOM tree from commonAncestorContainer to check node tags & styles
      let curr: Node | null = range.commonAncestorContainer;
      if (curr.nodeType === Node.TEXT_NODE) curr = curr.parentNode;

      while (curr && curr !== editorRef.current) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const el = curr as HTMLElement;
          const tag = el.tagName.toLowerCase();

          if (
            tag === "b" ||
            tag === "strong" ||
            el.style.fontWeight === "bold" ||
            parseInt(el.style.fontWeight, 10) >= 600
          ) {
            isBold = true;
          }
          if (tag === "i" || tag === "em" || el.style.fontStyle === "italic") {
            isItalic = true;
          }
          if (tag === "u" || el.style.textDecoration?.includes("underline")) {
            isUnderline = true;
          }
          if (
            tag === "s" ||
            tag === "strike" ||
            tag === "del" ||
            el.style.textDecoration?.includes("line-through")
          ) {
            isStrike = true;
          }
          if (tag === "code") {
            isCode = true;
          }
          if (tag === "a") {
            isLink = true;
          }
          if (["h1", "h2", "h3", "blockquote", "pre"].includes(tag) && !blockTag) {
            blockTag = tag;
          }
          if (tag === "ul") isUl = true;
          if (tag === "ol") isOl = true;

          const textAlign = el.style.textAlign || el.getAttribute("align");
          if (textAlign && !align) {
            align = textAlign.toLowerCase();
          }
        }
        curr = curr.parentNode;
      }

      setActiveStates({
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        strikeThrough: isStrike,
        code: isCode,
        link: isLink,
        unorderedList: isUl,
        orderedList: isOl,
        alignLeft: align === "left" || (!align && !isUl && !isOl),
        alignCenter: align === "center",
        alignRight: align === "right",
        alignJustify: align === "justify",
        formatBlock: blockTag,
      });
    } catch {}
  }, [disabled]);

  // Global selection listener so toolbar state updates as cursor moves
  useEffect(() => {
    const handleSelectionChange = () => {
      saveSelection();
      updateActiveStates();
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [saveSelection, updateActiveStates]);

  const handleInput = () => {
    if (!editorRef.current) return;
    isInternalUpdate.current = true;
    const html = editorRef.current.innerHTML;
    // Normalize empty content
    if (html === "<p><br></p>" || html === "<br>" || html === "<div><br></div>" || html.trim() === "") {
      onChange("");
    } else {
      onChange(html);
    }
    updateActiveStates();
  };

  // General formatting command executor
  const exec = (command: string, val: string | undefined = undefined) => {
    if (disabled || !editorRef.current) return;

    // Check if editor currently holds selection
    const sel = window.getSelection();
    const isInside =
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);

    if (!isInside && savedRangeRef.current) {
      restoreSelection();
    }

    try {
      document.execCommand("styleWithCSS", false, "false");
    } catch {}

    document.execCommand(command, false, val);
    handleInput();
    saveSelection();
    updateActiveStates();
  };

  // Block formatting toggle (H1, H2, H3, Blockquote)
  // Operates ONLY on marked / selected text without affecting surrounding text
  const toggleBlock = (tag: "h1" | "h2" | "h3" | "blockquote") => {
    if (disabled || !editorRef.current) return;

    const sel = window.getSelection();
    const isInside =
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);

    if (!isInside && savedRangeRef.current) {
      restoreSelection();
    }

    const currentSel = window.getSelection();
    if (!currentSel || currentSel.rangeCount === 0) return;
    const range = currentSel.getRangeAt(0);

    // 1. Check if selection is already inside an existing heading or blockquote
    let existingBlock: HTMLElement | null = null;
    let node: Node | null = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
    while (node && node !== editorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const t = (node as HTMLElement).tagName.toLowerCase();
        if (["h1", "h2", "h3", "blockquote"].includes(t)) {
          existingBlock = node as HTMLElement;
          break;
        }
      }
      node = node.parentNode;
    }

    if (existingBlock) {
      const currentTag = existingBlock.tagName.toLowerCase();
      const isFull =
        range.collapsed ||
        range.toString().trim() === existingBlock.textContent?.trim();

      if (currentTag === tag) {
        // Toggle OFF: convert back to normal paragraph or unwrap
        if (isFull) {
          const p = document.createElement("p");
          while (existingBlock.firstChild) {
            p.appendChild(existingBlock.firstChild);
          }
          existingBlock.parentNode?.replaceChild(p, existingBlock);
          const newRange = document.createRange();
          newRange.selectNodeContents(p);
          currentSel.removeAllRanges();
          currentSel.addRange(newRange);
        } else {
          // Partial selection inside heading: extract selected text into normal paragraph
          const fragment = range.extractContents();
          const p = document.createElement("p");
          p.appendChild(fragment);
          range.insertNode(p);
          const newRange = document.createRange();
          newRange.selectNodeContents(p);
          currentSel.removeAllRanges();
          currentSel.addRange(newRange);
        }
      } else {
        // Switch heading tag (e.g. H1 -> H2, or H2 -> H3)
        if (isFull) {
          const newEl = document.createElement(tag);
          while (existingBlock.firstChild) {
            newEl.appendChild(existingBlock.firstChild);
          }
          existingBlock.parentNode?.replaceChild(newEl, existingBlock);
          const newRange = document.createRange();
          newRange.selectNodeContents(newEl);
          currentSel.removeAllRanges();
          currentSel.addRange(newRange);
        } else {
          const fragment = range.extractContents();
          const newEl = document.createElement(tag);
          newEl.appendChild(fragment);
          range.insertNode(newEl);
          const newRange = document.createRange();
          newRange.selectNodeContents(newEl);
          currentSel.removeAllRanges();
          currentSel.addRange(newRange);
        }
      }
    } else if (!range.collapsed) {
      // 2. Marked / selected text only: format ONLY the selected text
      // Check if the selection covers an entire parent block (<p> or <div>)
      let parentBlock: HTMLElement | null = null;
      let pNode: Node | null = range.commonAncestorContainer;
      if (pNode.nodeType === Node.TEXT_NODE) pNode = pNode.parentNode;
      while (pNode && pNode !== editorRef.current) {
        if (pNode.nodeType === Node.ELEMENT_NODE) {
          const t = (pNode as HTMLElement).tagName.toLowerCase();
          if (["p", "div"].includes(t)) {
            parentBlock = pNode as HTMLElement;
            break;
          }
        }
        pNode = pNode.parentNode;
      }

      if (
        parentBlock &&
        parentBlock !== editorRef.current &&
        parentBlock.textContent?.trim() === range.toString().trim()
      ) {
        // Selection exactly covers that paragraph: replace the paragraph element with the heading
        const newEl = document.createElement(tag);
        while (parentBlock.firstChild) {
          newEl.appendChild(parentBlock.firstChild);
        }
        parentBlock.parentNode?.replaceChild(newEl, parentBlock);
        const newRange = document.createRange();
        newRange.selectNodeContents(newEl);
        currentSel.removeAllRanges();
        currentSel.addRange(newRange);
      } else {
        // Selection is a specific marked subset of text: extract and wrap ONLY the selected text!
        const fragment = range.extractContents();
        const headingEl = document.createElement(tag);
        headingEl.appendChild(fragment);

        range.insertNode(headingEl);

        const newRange = document.createRange();
        newRange.selectNodeContents(headingEl);
        currentSel.removeAllRanges();
        currentSel.addRange(newRange);
      }
    } else {
      // 3. Collapsed caret (no text selected):
      let parentBlock: HTMLElement | null = null;
      let curr: Node | null = range.startContainer;
      if (curr.nodeType === Node.TEXT_NODE) curr = curr.parentNode;
      while (curr && curr !== editorRef.current) {
        if (curr.nodeType === Node.ELEMENT_NODE) {
          const t = (curr as HTMLElement).tagName.toLowerCase();
          if (["p", "div"].includes(t)) {
            parentBlock = curr as HTMLElement;
            break;
          }
        }
        curr = curr.parentNode;
      }

      if (parentBlock && parentBlock !== editorRef.current) {
        const newEl = document.createElement(tag);
        while (parentBlock.firstChild) {
          newEl.appendChild(parentBlock.firstChild);
        }
        parentBlock.parentNode?.replaceChild(newEl, parentBlock);
        const newRange = document.createRange();
        newRange.selectNodeContents(newEl);
        newRange.collapse(false);
        currentSel.removeAllRanges();
        currentSel.addRange(newRange);
      } else {
        const newEl = document.createElement(tag);
        newEl.innerHTML = "<br>";
        range.insertNode(newEl);
        const newRange = document.createRange();
        newRange.setStart(newEl, 0);
        newRange.collapse(true);
        currentSel.removeAllRanges();
        currentSel.addRange(newRange);
      }
    }

    handleInput();
    saveSelection();
    updateActiveStates();
  };

  // Inline code toggle (wraps selected text in <code>, toggles off if already inside <code>)
  const toggleInlineCode = () => {
    if (disabled || !editorRef.current) return;

    const sel = window.getSelection();
    const isInside =
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);

    if (!isInside && savedRangeRef.current) {
      restoreSelection();
    }

    const currentSel = window.getSelection();
    if (!currentSel || currentSel.rangeCount === 0) return;
    const range = currentSel.getRangeAt(0);

    // Check if selection is inside a <code> tag
    let node: Node | null = range.commonAncestorContainer;
    let codeElement: HTMLElement | null = null;
    while (node && node !== editorRef.current) {
      if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === "code") {
        codeElement = node as HTMLElement;
        break;
      }
      node = node.parentNode;
    }

    if (codeElement) {
      // Toggle off: unwrap <code>
      const parent = codeElement.parentNode;
      if (parent) {
        while (codeElement.firstChild) {
          parent.insertBefore(codeElement.firstChild, codeElement);
        }
        parent.removeChild(codeElement);
      }
    } else if (!range.collapsed) {
      // Wrap selected text in <code>
      try {
        const text = range.toString();
        const code = document.createElement("code");
        code.textContent = text;
        range.deleteContents();
        range.insertNode(code);

        range.selectNodeContents(code);
        currentSel.removeAllRanges();
        currentSel.addRange(range);
      } catch {
        document.execCommand("insertHTML", false, `<code>${range.toString()}</code>`);
      }
    }

    handleInput();
    saveSelection();
    updateActiveStates();
  };

  // Horizontal Rule insertion
  const insertHorizontalRule = () => {
    if (disabled || !editorRef.current) return;
    const sel = window.getSelection();
    const isInside =
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).commonAncestorContainer);

    if (!isInside && savedRangeRef.current) {
      restoreSelection();
    }
    document.execCommand("insertHorizontalRule", false, undefined);
    handleInput();
    saveSelection();
    updateActiveStates();
  };

  // 1. Link handling
  const openLinkModal = () => {
    saveSelection();
    const sel = window.getSelection();
    const text = sel ? sel.toString() : "";
    setLinkText(text);

    // Check if already in an anchor tag
    let existingUrl = "";
    let isLink = false;
    if (sel && sel.rangeCount > 0) {
      let node: Node | null = sel.getRangeAt(0).commonAncestorContainer;
      if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
      while (node && node !== editorRef.current) {
        if (node.nodeType === Node.ELEMENT_NODE && (node as HTMLElement).tagName.toLowerCase() === "a") {
          existingUrl = (node as HTMLAnchorElement).href;
          isLink = true;
          break;
        }
        node = node.parentNode;
      }
    }

    setLinkUrl(existingUrl);
    setIsEditingExistingLink(isLink);
    setShowLinkModal(true);
  };

  const insertLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }
    restoreSelection();

    const formattedUrl =
      linkUrl.startsWith("http://") ||
      linkUrl.startsWith("https://") ||
      linkUrl.startsWith("mailto:") ||
      linkUrl.startsWith("tel:")
        ? linkUrl.trim()
        : `https://${linkUrl.trim()}`;

    const textToDisplay = linkText.trim() || linkUrl.trim();
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const a = document.createElement("a");
      a.href = formattedUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = textToDisplay;
      a.className = "text-brand underline hover:text-brand-dark";

      range.deleteContents();
      range.insertNode(a);

      range.setStartAfter(a);
      range.setEndAfter(a);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      document.execCommand("createLink", false, formattedUrl);
    }

    handleInput();
    saveSelection();
    updateActiveStates();
    setShowLinkModal(false);
  };

  const removeLink = () => {
    restoreSelection();
    document.execCommand("unlink", false);
    handleInput();
    saveSelection();
    updateActiveStates();
    setShowLinkModal(false);
  };

  // 2. Emoji handling
  const insertEmoji = (emoji: string) => {
    restoreSelection();
    document.execCommand("insertText", false, emoji);
    handleInput();
    saveSelection();
    updateActiveStates();
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
    restoreSelection();
    const imgHtml = `<img src="${imageUrl.trim()}" alt="${
      imageAlt.trim() || "Image"
    }" style="max-width:100%; height:auto; border-radius:8px; margin:8px 0; border:1px solid #E4E7EC;" />`;
    document.execCommand("insertHTML", false, imgHtml);
    handleInput();
    saveSelection();
    updateActiveStates();
    setShowImageModal(false);
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      restoreSelection();
      const imgHtml = `<img src="${base64}" alt="${file.name}" style="max-width:100%; height:auto; border-radius:8px; margin:8px 0; border:1px solid #E4E7EC;" />`;
      document.execCommand("insertHTML", false, imgHtml);
      handleInput();
      saveSelection();
      updateActiveStates();
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
      const sizeStr =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.round(file.size / 1024)} KB`;

      restoreSelection();
      const chipHtml = `<a href="${dataUrl}" download="${file.name}" class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate2-200 bg-slate2-50 my-1 font-mono text-xs text-slate2-700 hover:bg-slate2-100 hover:text-brand transition-colors no-underline" contenteditable="false">📎 <span class="font-medium">${file.name}</span> <span class="text-slate2-400">(${sizeStr})</span></a>&nbsp;`;
      document.execCommand("insertHTML", false, chipHtml);
      handleInput();
      saveSelection();
      updateActiveStates();
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
    saveSelection();
    updateActiveStates();
    setShowTableModal(false);
  };

  const isEditorEmpty = !value || value === "<p><br></p>" || value === "<br>" || value.trim() === "";

  return (
    <div
      className={`relative rounded-xl border border-slate2-200 bg-white transition-all shadow-sm ${
        disabled
          ? "opacity-75 bg-slate2-50 cursor-not-allowed"
          : "focus-within:border-brand focus-within:ring-1 focus-within:ring-brand"
      }`}
    >
      {/* Hidden file inputs */}
      <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttachmentUpload} />
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
            onMouseDown={(e) => {
              e.preventDefault();
              exec("undo");
            }}
            className="rounded p-1.5 text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800 disabled:opacity-40 transition-colors"
          >
            <Undo2 size={15} />
          </button>
          <button
            type="button"
            title="Redo (Ctrl+Y)"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("redo");
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBlock("h1");
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBlock("h2");
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBlock("h3");
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              exec("bold");
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              exec("italic");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.italic
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Italic size={15} />
          </button>
          <button
            type="button"
            title="Underline (Ctrl+U)"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("underline");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.underline
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Underline size={15} />
          </button>
          <button
            type="button"
            title="Strikethrough"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("strikeThrough");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.strikeThrough
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Strikethrough size={15} />
          </button>
        </div>

        {/* Lists (Bulleted, Numbered) */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Bulleted list"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("insertUnorderedList");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.unorderedList
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <List size={15} />
          </button>
          <button
            type="button"
            title="Numbered list"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("insertOrderedList");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.orderedList
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <ListOrdered size={15} />
          </button>
        </div>

        {/* Blockquote, Inline Code, Horizontal Line */}
        <div className="flex items-center gap-0.5 px-1.5 border-r border-slate2-200">
          <button
            type="button"
            title="Blockquote"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              toggleBlock("blockquote");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.formatBlock === "blockquote"
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Quote size={15} />
          </button>
          <button
            type="button"
            title="Inline code"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              toggleInlineCode();
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.code
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Code size={15} />
          </button>
          <button
            type="button"
            title="Horizontal line"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              insertHorizontalRule();
            }}
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
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyLeft");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignLeft
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignLeft size={15} />
          </button>
          <button
            type="button"
            title="Align Center"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyCenter");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignCenter
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignCenter size={15} />
          </button>
          <button
            type="button"
            title="Align Right"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyRight");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignRight
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <AlignRight size={15} />
          </button>
          <button
            type="button"
            title="Align Justify"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              exec("justifyFull");
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.alignJustify
                ? "bg-brand/15 text-brand font-bold"
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
            onMouseDown={(e) => {
              e.preventDefault();
              openLinkModal();
            }}
            className={`rounded p-1.5 transition-colors ${
              activeStates.link || showLinkModal
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <LinkIcon size={15} />
          </button>
          <button
            type="button"
            title="Insert Emoji"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              saveSelection();
              setShowEmojiPicker((v) => !v);
            }}
            className={`rounded p-1.5 transition-colors ${
              showEmojiPicker
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <Smile size={15} />
          </button>
          <button
            type="button"
            title="Attach file"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
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
            onMouseDown={(e) => {
              e.preventDefault();
              openImageModal();
            }}
            className={`rounded p-1.5 transition-colors ${
              showImageModal
                ? "bg-brand/15 text-brand font-bold"
                : "text-slate2-600 hover:bg-slate2-200/70 hover:text-slate2-800"
            }`}
          >
            <ImageIcon size={15} />
          </button>
          <button
            type="button"
            title="Insert table"
            disabled={disabled}
            onMouseDown={(e) => {
              e.preventDefault();
              openTableModal();
            }}
            className={`rounded p-1.5 transition-colors ${
              showTableModal
                ? "bg-brand/15 text-brand font-bold"
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
        <div className="absolute top-12 left-4 z-30 w-84 rounded-xl border border-slate2-200 bg-white p-4 shadow-xl">
          <div className="flex items-center justify-between pb-2 border-b border-slate2-100">
            <span className="text-xs font-semibold text-slate2-800">
              {isEditingExistingLink ? "Edit Link" : "Insert Link"}
            </span>
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
                Display Text (Selected text)
              </label>
              <input
                type="text"
                value={linkText}
                onChange={(e) => setLinkText(e.target.value)}
                placeholder="Link text"
                className="w-full rounded-md border border-slate2-200 px-2.5 py-1.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:border-brand"
              />
            </div>
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
            <div className="flex items-center justify-between pt-1">
              <div>
                {isEditingExistingLink && (
                  <button
                    type="button"
                    onClick={removeLink}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-danger hover:bg-red-50"
                  >
                    <Unlink size={13} /> Remove Link
                  </button>
                )}
              </div>
              <div className="flex gap-2">
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
                  {isEditingExistingLink ? "Update Link" : "Apply Link"}
                </button>
              </div>
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
                      onMouseDown={(e) => {
                        e.preventDefault();
                        insertEmoji(emoji);
                      }}
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
                Insert Image
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
                  onChange={(e) => setTableRows(parseInt(e.target.value, 10) || 1)}
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
                  onChange={(e) => setTableCols(parseInt(e.target.value, 10) || 1)}
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
          onKeyUp={() => {
            saveSelection();
            updateActiveStates();
          }}
          onMouseUp={() => {
            saveSelection();
            updateActiveStates();
          }}
          onFocus={() => {
            saveSelection();
            updateActiveStates();
          }}
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

export default RichTextEditor;
