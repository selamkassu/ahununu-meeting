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
  placeholder = "Type name, department, role, or email to search...",
  className = "",
  disabled = false,
}: SearchableMultiUserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDeptFilter, setSelectedDeptFilter] = useState<string>("ALL");

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Keyboard navigation & Backspace deletion
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && searchQuery === "" && selectedUserIds.length > 0) {
      // Remove the last selected participant
      onChange(selectedUserIds.slice(0, -1));
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown" && !isOpen) {
      setIsOpen(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      // If there is an exact or first matching user, toggle them
      if (filteredUsers.length > 0) {
        const target = filteredUsers[0];
        toggleUser(target.id);
        setSearchQuery("");
      }
    }
  };

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChange(selectedUserIds.filter((id) => id !== userId));
    } else {
      onChange([...selectedUserIds, userId]);
    }
  };

  const removeUser = (userId: string) => {
    onChange(selectedUserIds.filter((id) => id !== userId));
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
    setSearchQuery("");
    inputRef.current?.focus();
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
      {/* Searchable Input Container Box */}
      <div
        onClick={() => {
          if (!disabled) {
            inputRef.current?.focus();
            setIsOpen(true);
          }
        }}
        className={`w-full min-h-[46px] rounded-lg border bg-white px-2.5 py-1.5 text-sm flex items-center justify-between gap-1.5 cursor-text transition-all ${
          disabled
            ? "opacity-60 cursor-not-allowed bg-slate2-50 border-slate2-200"
            : isOpen
            ? "border-brand ring-2 ring-brand/20 shadow-sm"
            : "border-slate2-200 hover:border-slate2-300"
        }`}
      >
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {/* Selected user chips */}
          {selectedUsers.map((u) => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand/10 border border-brand/20 pl-1.5 pr-2 py-0.5 text-xs font-medium text-brand-dark transition-all hover:bg-brand/15 shrink-0"
            >
              <span
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white shadow-2xs"
                style={{ backgroundColor: u.avatarColor || "#0B7A6B" }}
              >
                {u.name.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[120px] truncate text-[11px] font-semibold text-slate2-800">
                {u.name}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeUser(u.id);
                }}
                className="text-slate2-400 hover:text-rose-600 rounded-full p-0.5 transition-colors"
                title={`Remove ${u.name}`}
              >
                <X size={11} />
              </button>
            </span>
          ))}

          {/* Direct Search Input */}
          <div className="flex-1 min-w-[150px] flex items-center gap-1.5">
            {selectedUsers.length === 0 && !searchQuery && (
              <Search size={14} className="text-slate2-400 shrink-0 pointer-events-none" />
            )}
            <input
              ref={inputRef}
              type="text"
              disabled={disabled}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (!isOpen) setIsOpen(true);
              }}
              onFocus={() => setIsOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={
                selectedUsers.length === 0
                  ? placeholder
                  : "Type to search more..."
              }
              className="w-full border-0 bg-transparent p-0.5 text-xs text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:ring-0"
            />
          </div>
        </div>

        {/* Right Action Icons: Counter, Clear, Dropdown Chevron */}
        <div className="flex items-center gap-1 shrink-0 text-slate2-400 ml-1">
          {searchQuery && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setSearchQuery("");
                inputRef.current?.focus();
              }}
              className="p-1 rounded text-slate2-400 hover:text-slate2-600"
              title="Clear search text"
            >
              <X size={12} />
            </button>
          )}

          {selectedUsers.length > 0 && !disabled && (
            <>
              <span className="rounded-full bg-slate2-100 px-2 py-0.5 text-[10px] font-bold text-slate2-700">
                {selectedUsers.length}
              </span>
              <button
                type="button"
                onClick={clearAll}
                className="p-1 rounded-md text-slate2-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                title="Clear all selected"
              >
                <X size={13} />
              </button>
              <span className="h-3.5 w-px bg-slate2-200" />
            </>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isOpen) {
                inputRef.current?.focus();
              }
              setIsOpen(!isOpen);
            }}
            className="p-1 hover:text-slate2-600 transition-colors"
            title={isOpen ? "Close dropdown" : "Open attendees dropdown"}
          >
            <ChevronDown
              size={15}
              className={`transition-transform duration-200 ${
                isOpen ? "rotate-180 text-brand" : "text-slate2-400"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Dropdown Menu attached directly beneath input */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border border-slate2-200 bg-white shadow-xl overflow-hidden animate-fadeIn">
          {/* Department Filter Pills */}
          {departments.length > 1 && (
            <div className="p-2 border-b border-slate2-100 bg-slate2-50/70 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto text-[11px] scrollbar-thin">
                <span className="text-slate2-400 shrink-0 mr-1 flex items-center gap-0.5">
                  <Building2 size={11} /> Dept:
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedDeptFilter("ALL")}
                  className={`px-2 py-0.5 rounded-full font-medium shrink-0 transition-colors ${
                    selectedDeptFilter === "ALL"
                      ? "bg-brand text-white shadow-2xs"
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
                          ? "bg-brand text-white shadow-2xs"
                          : "bg-slate2-100 text-slate2-600 hover:bg-slate2-200"
                      }`}
                    >
                      {dept} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5 shrink-0 text-[11px]">
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-brand font-semibold hover:underline"
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
          )}

          {/* Search Info Bar */}
          <div className="px-3 py-1.5 bg-slate2-50/40 border-b border-slate2-100 flex items-center justify-between text-[11px] text-slate2-500">
            <span>
              {searchQuery ? (
                <>
                  Matching <strong className="text-slate2-700">"{searchQuery}"</strong> ·{" "}
                </>
              ) : null}
              {filteredUsers.length} attendee{filteredUsers.length !== 1 ? "s" : ""} available
            </span>
            <span>
              <strong className="text-slate2-800">{selectedUserIds.length}</strong> selected
            </span>
          </div>

          {/* Attendees List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate2-50 p-1">
            {filteredUsers.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate2-400">
                <Users size={24} className="mx-auto mb-1.5 text-slate2-300" />
                No attendees match "{searchQuery}"
                {selectedDeptFilter !== "ALL" ? ` in ${selectedDeptFilter}` : ""}.
              </div>
            ) : (
              filteredUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      toggleUser(u.id);
                      inputRef.current?.focus();
                    }}
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
              Press Backspace to delete chip · Esc to close
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-lg bg-brand px-3.5 py-1 text-xs font-semibold text-white shadow-sm hover:bg-brand-dark transition-all"
            >
              Done ({selectedUserIds.length})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
