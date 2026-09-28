import React, { useState, useRef, useEffect, useMemo } from "react";
import { Search, ChevronDown, Check, X, Users, UserCheck } from "lucide-react";
import type { User, MeetingParticipant } from "../../types";
import { Avatar } from "./Primitives";

interface SearchableUserSelectProps {
  users: User[];
  selectedUserId: string;
  onSelect: (userId: string) => void;
  meetingParticipants?: MeetingParticipant[];
  organizerId?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableUserSelect({
  users,
  selectedUserId,
  onSelect,
  meetingParticipants = [],
  organizerId,
  placeholder = "Assign to…",
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

  // Selected user object
  const selectedUser = useMemo(() => {
    return users.find((u) => u.id === selectedUserId) || null;
  }, [users, selectedUserId]);

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
    onSelect(userId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect("");
  };

  const renderUserItem = (u: User) => {
    const isSelected = u.id === selectedUserId;
    const isParticipant = participantIds.has(u.id);

    return (
      <button
        key={u.id}
        type="button"
        onClick={() => handleSelect(u.id)}
        className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs transition-colors group ${
          isSelected
            ? "bg-brand/10 text-brand-dark font-medium"
            : "text-slate2-700 hover:bg-slate2-50 hover:text-slate2-900"
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar name={u.name} color={u.avatarColor} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-slate2-800 group-hover:text-brand-dark truncate">
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

        {isSelected && (
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
        className={`w-full h-[38px] rounded-lg border bg-white px-3 py-2 text-sm text-left flex items-center justify-between gap-2 focus-ring transition-colors ${
          disabled
            ? "opacity-60 cursor-not-allowed bg-slate2-50 border-slate2-200"
            : isOpen
            ? "border-brand ring-2 ring-brand/20 shadow-sm"
            : "border-slate2-200 hover:border-slate2-300"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedUser ? (
            <>
              <div className="scale-75 origin-left -mr-1">
                <Avatar
                  name={selectedUser.name}
                  color={selectedUser.avatarColor}
                />
              </div>
              <span className="font-medium text-slate2-800 truncate">
                {selectedUser.name}
              </span>
            </>
          ) : (
            <span className="text-slate2-400 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 text-slate2-400">
          {selectedUser && !disabled && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleClear}
              className="p-0.5 rounded hover:bg-slate2-100 hover:text-slate2-600 transition-colors"
              title="Clear selection"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={15}
            className={`transition-transform duration-200 ${
              isOpen ? "rotate-180 text-brand" : "text-slate2-400"
            }`}
          />
        </div>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full min-w-[280px] sm:min-w-[320px] rounded-xl border border-slate2-200 bg-white shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
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
                placeholder="Search user by name, title, dept..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white rounded-lg border border-slate2-200 text-slate2-800 placeholder:text-slate2-400 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand"
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
              // Search results view
              filteredUsers.map(renderUserItem)
            ) : (
              // Categorized view: Meeting Participants first, then Other Users
              <>
                {participantsList.length > 0 && (
                  <div>
                    <div className="bg-slate2-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate2-500 border-b border-slate2-100 flex items-center justify-between">
                      <span>Meeting Participants</span>
                      <span>{participantsList.length}</span>
                    </div>
                    {participantsList.map(renderUserItem)}
                  </div>
                )}

                {othersList.length > 0 && (
                  <div>
                    {participantsList.length > 0 && (
                      <div className="bg-slate2-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate2-500 border-y border-slate2-100 flex items-center justify-between">
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
        </div>
      )}
    </div>
  );
}
