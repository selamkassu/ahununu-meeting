import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, Users, UserCheck, CheckSquare, Square } from "lucide-react";
import type { User, MeetingParticipant } from "../../types";
import { Avatar } from "./Primitives";

interface SearchableUserSelectProps {
  users: User[];
  selectedUserId?: string;
  onSelect?: (userId: string) => void;
  isMulti?: boolean;
  selectedUserIds?: string[];
  onSelectMultiple?: (userIds: string[]) => void;
  meetingParticipants?: MeetingParticipant[];
  organizerId?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableUserSelect({
  users,
  selectedUserId = "",
  onSelect,
  isMulti = false,
  selectedUserIds = [],
  onSelectMultiple,
  meetingParticipants = [],
  organizerId,
  placeholder = isMulti ? "Assign to one or multiple users…" : "Assign to…",
  className = "",
  disabled = false,
}: SearchableUserSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Set of participant user IDs (including organizer if provided)
  const participantIds = useMemo(() => {
    const ids = new Set<string>();
    if (meetingParticipants) {
      meetingParticipants.forEach((p) => {
        if (p.user?.id) ids.add(p.user.id);
      });
    }
    if (organizerId) {
      ids.add(organizerId);
    }
    return ids;
  }, [meetingParticipants, organizerId]);

  // Selected users in multi mode
  const selectedUsers = useMemo(() => {
    if (!isMulti) return [];
    return users.filter((u) => selectedUserIds.includes(u.id));
  }, [isMulti, users, selectedUserIds]);

  // Selected user in single mode
  const selectedUser = useMemo(() => {
    if (isMulti) return null;
    return users.find((u) => u.id === selectedUserId) || null;
  }, [isMulti, users, selectedUserId]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
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

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("");
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  // Filtered users based on search
  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return users;

    return users.filter((u) => {
      const nameMatch = u.name.toLowerCase().includes(query);
      const emailMatch = u.email?.toLowerCase().includes(query);
      const deptMatch = u.department?.name?.toLowerCase().includes(query);
      const titleMatch = u.jobTitle?.toLowerCase().includes(query);
      return nameMatch || emailMatch || deptMatch || titleMatch;
    });
  }, [users, searchQuery]);

  // Group into participants and other users if not searching
  const { participantsList, othersList } = useMemo(() => {
    if (searchQuery.trim()) {
      return {
        participantsList: filteredUsers.filter((u) => participantIds.has(u.id)),
        othersList: filteredUsers.filter((u) => !participantIds.has(u.id)),
      };
    }

    const participants: User[] = [];
    const others: User[] = [];

    users.forEach((u) => {
      if (participantIds.has(u.id)) {
        participants.push(u);
      } else {
        others.push(u);
      }
    });

    return { participantsList: participants, othersList: others };
  }, [filteredUsers, users, participantIds, searchQuery]);

  const handleSelect = (userId: string) => {
    if (isMulti) {
      const current = new Set(selectedUserIds);
      if (current.has(userId)) {
        current.delete(userId);
      } else {
        current.add(userId);
      }
      onSelectMultiple?.(Array.from(current));
    } else {
      onSelect?.(userId);
      setIsOpen(false);
    }
  };

  const handleRemoveOne = (e: React.MouseEvent, userId: string) => {
    e.stopPropagation();
    if (isMulti) {
      onSelectMultiple?.(selectedUserIds.filter((id) => id !== userId));
    } else {
      onSelect?.("");
    }
  };

  const handleClearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMulti) {
      onSelectMultiple?.([]);
    } else {
      onSelect?.("");
    }
  };

  const handleSelectAllParticipants = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isMulti) return;
    const current = new Set(selectedUserIds);
    participantIds.forEach((id) => current.add(id));
    onSelectMultiple?.(Array.from(current));
  };

  const isUserSelected = (userId: string) => {
    return isMulti ? selectedUserIds.includes(userId) : selectedUserId === userId;
  };

  const renderUserItem = (u: User) => {
    const isSelected = isUserSelected(u.id);
    const isParticipant = participantIds.has(u.id);

    return (
      <button
        key={u.id}
        type="button"
        onClick={() => handleSelect(u.id)}
        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors group cursor-pointer ${
          isSelected
            ? "bg-[#005f56]/10 text-[#005f56] font-medium"
            : "text-slate2-700 hover:bg-slate2-50 hover:text-slate2-900"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          {isMulti && (
            <div className="shrink-0 text-slate2-400 group-hover:text-[#005f56]">
              {isSelected ? (
                <CheckSquare size={16} className="text-[#005f56]" />
              ) : (
                <Square size={16} className="text-slate2-300" />
              )}
            </div>
          )}
          <Avatar name={u.name} color={u.avatarColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate2-800 group-hover:text-[#005f56] truncate">
                {u.name}
              </span>
              {isParticipant && (
                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.2 bg-emerald-50 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                  <UserCheck size={10} /> Participant
                </span>
              )}
            </div>
            {(u.jobTitle || u.department?.name) && (
              <p className="text-[11px] text-slate2-400 truncate">
                {u.jobTitle ? u.jobTitle : ""}
                {u.jobTitle && u.department?.name ? " · " : ""}
                {u.department?.name ? u.department.name : ""}
              </p>
            )}
          </div>
        </div>

        {!isMulti && isSelected && (
          <Check size={15} className="text-brand shrink-0 ml-2" />
        )}
      </button>
    );
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full min-h-[38px] rounded-lg border bg-white px-2.5 py-1.5 text-sm text-left flex items-center justify-between gap-2 focus-ring transition-colors ${
          disabled
            ? "opacity-60 cursor-not-allowed bg-slate2-50 border-slate2-200"
            : isOpen
            ? "border-[#005f56] ring-2 ring-[#005f56]/20 shadow-xs"
            : "border-slate2-200 hover:border-slate2-300"
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          {isMulti ? (
            selectedUsers.length > 0 ? (
              selectedUsers.slice(0, 3).map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 rounded-md bg-[#e6f4f1] text-[#005f56] border border-[#c2e7df] px-1.5 py-0.5 text-xs font-medium"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: u.avatarColor || "#005f56" }}
                  />
                  <span className="truncate max-w-[100px]">{u.name.split(" ")[0]}</span>
                  {!disabled && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleRemoveOne(e, u.id)}
                      className="hover:text-red-600 rounded p-0.2"
                    >
                      <X size={11} />
                    </span>
                  )}
                </span>
              )).concat(
                selectedUsers.length > 3 ? (
                  [
                    <span
                      key="more"
                      className="inline-flex items-center rounded bg-slate2-100 px-1.5 py-0.5 text-[11px] font-bold text-slate2-600"
                    >
                      +{selectedUsers.length - 3} more
                    </span>,
                  ]
                ) : []
              )
            ) : (
              <span className="text-slate2-400 text-xs truncate px-1">{placeholder}</span>
            )
          ) : selectedUser ? (
            <>
              <div className="scale-75 origin-left -mr-1">
                <Avatar
                  name={selectedUser.name}
                  color={selectedUser.avatarColor}
                />
              </div>
              <span className="font-medium text-slate2-800 text-xs truncate">
                {selectedUser.name}
              </span>
            </>
          ) : (
            <span className="text-slate2-400 text-xs truncate px-1">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate2-400">
          {((isMulti && selectedUserIds.length > 0) || (!isMulti && selectedUser)) && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClearAll}
              className="p-1 rounded hover:bg-slate2-100 hover:text-slate2-600 transition-colors"
              title="Clear all"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180 text-[#005f56]" : "text-slate2-400"
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[280px] sm:min-w-[340px] rounded-xl border border-slate2-200 bg-white shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
          {/* Quick Actions Header for Multi-select */}
          {isMulti && (
            <div className="px-3 py-1.5 bg-[#f0f9f7] border-b border-[#d1efe8] flex items-center justify-between text-xs">
              <span className="font-semibold text-[#005f56]">
                {selectedUserIds.length === 0
                  ? "Select team assignees"
                  : `${selectedUserIds.length} assignee${selectedUserIds.length > 1 ? "s" : ""} selected`}
              </span>
              <div className="flex items-center gap-2">
                {participantIds.size > 0 && (
                  <button
                    type="button"
                    onClick={handleSelectAllParticipants}
                    className="text-[11px] font-semibold text-[#005f56] hover:underline cursor-pointer"
                  >
                    Select participants
                  </button>
                )}
                {selectedUserIds.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[11px] font-semibold text-slate2-400 hover:text-danger cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Search Box Header */}
          <div className="p-2 border-b border-slate2-100 bg-slate2-50/70">
            <div className="relative flex items-center">
              <Search
                size={14}
                className="absolute left-2.5 text-slate2-400 pointer-events-none"
              />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, title, department…"
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white rounded-lg border border-slate2-200 text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:ring-1 focus:ring-[#005f56] focus:border-[#005f56]"
                onClick={(e) => e.stopPropagation()}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 text-slate2-400 hover:text-slate2-600 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>
          </div>

          {/* User List Options */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate2-50">
            {filteredUsers.length === 0 ? (
              <div className="py-6 px-4 text-center text-xs text-slate2-400">
                <Users size={20} className="mx-auto mb-1.5 text-slate2-300" />
                No team members found matching "{searchQuery}"
              </div>
            ) : searchQuery.trim() ? (
              filteredUsers.map(renderUserItem)
            ) : (
              <>
                {participantsList.length > 0 && (
                  <div>
                    <div className="bg-slate2-50/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate2-500 border-b border-slate2-100 flex items-center justify-between">
                      <span>Meeting Participants</span>
                      <span>{participantsList.length}</span>
                    </div>
                    {participantsList.map(renderUserItem)}
                  </div>
                )}

                {othersList.length > 0 && (
                  <div>
                    {participantsList.length > 0 && (
                      <div className="bg-slate2-50/80 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate2-500 border-y border-slate2-100 flex items-center justify-between">
                        <span>All Other Members</span>
                        <span>{othersList.length}</span>
                      </div>
                    )}
                    {othersList.map(renderUserItem)}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Multi-select Done Button Footer */}
          {isMulti && (
            <div className="p-2 border-t border-slate2-100 bg-slate2-50/90 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3 py-1 rounded-md bg-[#005f56] text-white text-xs font-semibold hover:bg-[#004740] transition-colors cursor-pointer"
              >
                Done ({selectedUserIds.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
