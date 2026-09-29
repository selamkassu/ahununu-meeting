import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, Users, Building2 } from "lucide-react";
import type { User } from "../../types";
import { Avatar } from "./Primitives";

export interface SearchableMultiUserSelectProps {
  users: User[];
  selectedUserIds: string[];
  onChange: (userIds: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableMultiUserSelect({
  users,
  selectedUserIds,
  onChange,
  placeholder = "Search and select attendees...",
  className = "",
  disabled = false,
}: SearchableMultiUserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Map of users for fast ID lookup
  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    users.forEach((u) => map.set(u.id, u));
    return map;
  }, [users]);

  // Selected user objects
  const selectedUsers = useMemo(() => {
    return selectedUserIds
      .map((id) => userMap.get(id))
      .filter((u): u is User => Boolean(u));
  }, [selectedUserIds, userMap]);

  // Extract unique departments for quick filter pills
  const departments = useMemo(() => {
    const depts = new Set<string>();
    users.forEach((u) => {
      if (u.department?.name) depts.add(u.department.name);
    });
    return Array.from(depts).sort();
  }, [users]);

  // Filtered users based on search query and department filter
  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((u) => {
      // Department filter check
      if (selectedDeptFilter !== "ALL" && u.department?.name !== selectedDeptFilter) {
        return false;
      }
      if (!query) return true;
      const nameMatch = u.name.toLowerCase().includes(query);
      const emailMatch = u.email?.toLowerCase().includes(query);
      const deptMatch = u.department?.name?.toLowerCase().includes(query);
      const titleMatch = u.jobTitle?.toLowerCase().includes(query);
      return nameMatch || emailMatch || deptMatch || titleMatch;
    });
  }, [users, searchQuery, selectedDeptFilter]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Auto-focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Escape key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const selectAllFiltered = () => {
    const filteredIds = filteredUsers.map((u) => u.id);
    const merged = Array.from(new Set([...selectedUserIds, ...filteredIds]));
    onChange(merged);
  };

  const deselectAllFiltered = () => {
    const filteredIdSet = new Set(filteredUsers.map((u) => u.id));
    onChange(selectedUserIds.filter((id) => !filteredIdSet.has(id)));
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Box */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={`w-full min-h-[44px] rounded-lg border bg-white px-3 py-1.5 text-sm flex items-center justify-between gap-2 cursor-pointer transition-all ${
          disabled
            ? "opacity-60 cursor-not-allowed bg-slate2-50 border-slate2-200"
            : isOpen
            ? "border-brand ring-2 ring-brand/20 shadow-sm"
            : "border-slate2-200 hover:border-slate2-300"
        }`}
      >
        <div className="flex-1 min-w-0">
          {selectedUsers.length === 0 ? (
            <div className="flex items-center gap-2 text-slate2-400 py-1">
              <Users size={15} className="text-slate2-400 shrink-0" />
              <span className="truncate">{placeholder}</span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto py-0.5">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 border border-brand/20 pl-1.5 pr-2 py-0.5 text-xs font-medium text-brand-dark transition-all hover:bg-brand/15"
                >
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-2xs"
                    style={{ backgroundColor: u.avatarColor || "#0B7A6B" }}
                  >
                    {u.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-[130px] truncate text-[11px] font-semibold text-slate2-800">
                    {u.name}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => removeUser(u.id, e)}
                    className="text-slate2-400 hover:text-rose-600 rounded-full p-0.5 transition-colors"
                    title={`Remove ${u.name}`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right Action Icons */}
        <div className="flex items-center gap-1.5 shrink-0 text-slate2-400">
          {selectedUsers.length > 0 && !disabled && (
            <>
              <span className="rounded-full bg-slate2-100 px-2 py-0.5 text-[11px] font-bold text-slate2-700">
                {selectedUsers.length}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="p-1 rounded-md text-slate2-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Clear all selected participants"
              >
                <X size={14} />
              </button>
              <span className="h-4 w-px bg-slate2-200" />
            </>
          )}
          <ChevronDown
            size={16}
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180 text-brand" : "text-slate2-400"
            }`}
          />
        </div>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-slate2-200 bg-white shadow-xl overflow-hidden animate-fadeIn">
          {/* Search Header */}
          <div className="p-2.5 border-b border-slate2-100 bg-slate2-50/70 space-y-2">
            <div className="relative flex items-center">
              <Search size={14} className="absolute left-3 text-slate2-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, department, role, or email..."
                className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate2-200 bg-white placeholder:text-slate2-400 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 text-slate2-400 hover:text-slate2-600 p-0.5"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Department Filter Pills (if multiple departments) */}
            {departments.length > 1 && (
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 text-[11px]">
                <span className="text-slate2-400 shrink-0 mr-1 flex items-center gap-0.5">
                  <Building2 size={11} /> Dept:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDeptFilter("ALL")}
                  className={`px-2 py-0.5 rounded-full font-medium shrink-0 transition-colors ${
                    selectedDeptFilter === "ALL"
                      ? "bg-brand text-white"
                      : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                  }`}
                >
                  All ({users.length})
                </button>
                {departments.map((dept) => {
                  const count = users.filter((u) => u.department?.name === dept).length;
                  return (
                    <button
                      key={dept}
                      type="button"
                      onClick={() => setSelectedDeptFilter(dept)}
                      className={`px-2 py-0.5 rounded-full font-medium shrink-0 transition-colors ${
                        selectedDeptFilter === dept
                          ? "bg-brand text-white"
                          : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                      }`}
                    >
                      {dept} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate2-100 bg-slate2-50/50 text-[11px] text-slate2-500">
            <span>
              Showing {filteredUsers.length} user{filteredUsers.length !== 1 ? "s" : ""} ·{" "}
              <strong className="text-slate2-800">{selectedUserIds.length}</strong> selected
            </span>
            <div className="flex items-center gap-2 font-medium">
              <button
                type="button"
                onClick={selectAllFiltered}
                className="text-brand hover:underline"
              >
                Select All
              </button>
              <span className="text-slate2-300">|</span>
              <button
                type="button"
                onClick={deselectAllFiltered}
                className="text-slate2-500 hover:text-slate2-700 hover:underline"
              >
                Clear
              </button>
            </div>
          </div>

          {/* User List */}
          <div className="max-h-56 overflow-y-auto divide-y divide-slate2-50 p-1">
            {filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate2-400">
                <Users size={24} className="mx-auto mb-1.5 text-slate2-300" />
                No matching participants found.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-lg text-xs transition-colors ${
                      isSelected
                        ? "bg-brand/10 text-brand-dark"
                        : "hover:bg-slate2-50 text-slate2-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {/* Checkbox Icon */}
                      <div className="shrink-0 text-slate2-400">
                        {isSelected ? (
                          <div className="flex h-4 w-4 items-center justify-center rounded bg-brand text-white shadow-2xs">
                            <Check size={11} strokeWidth={3} />
                          </div>
                        ) : (
                          <div className="h-4 w-4 rounded border border-slate2-300 bg-white" />
                        )}
                      </div>

                      {/* Avatar */}
                      <Avatar name={u.name} color={u.avatarColor || "#0B7A6B"} />

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={`font-semibold truncate ${
                              isSelected ? "text-brand-dark" : "text-slate2-800"
                            }`}
                          >
                            {u.name}
                          </span>
                          {u.department && (
                            <span className="rounded bg-slate2-100 px-1.5 py-0.5 text-[10px] font-medium text-slate2-600">
                              {u.department.name}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate2-400 truncate">
                          {u.jobTitle || u.email || "Participant"}
                        </p>
                      </div>
                    </div>

                    {isSelected && (
                      <span className="shrink-0 text-[11px] font-semibold text-brand pl-2">
                        Added
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Footer Bar */}
          <div className="p-2 border-t border-slate2-100 bg-slate2-50/70 flex items-center justify-between">
            <span className="text-[11px] text-slate2-400 pl-1">
              Click anywhere outside or "Done" to close
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg bg-brand px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark transition-all"
            >
              Done ({selectedUserIds.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
