import React from "react";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate2-800/50 p-4 py-10">
      <div className={`w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate2-100 px-5 py-4">
          <h3 className="font-display text-base font-semibold text-slate2-800">{title}</h3>
          <button onClick={onClose} className="focus-ring rounded-md p-1 text-slate2-400 hover:bg-slate2-100 hover:text-slate2-600">
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}
