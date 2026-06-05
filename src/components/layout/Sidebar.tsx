"use client";

import Image from "next/image";
import { useState } from "react";
import columnsLogo from "../../../public/columns-logo.png";
import type { SessionUser } from "@/types";
import { useTheme } from "@/components/layout/Providers";
import { ComposeModal } from "@/components/cast/ComposeModal";
import { AddColumnModal } from "@/components/feed/AddColumnModal";
import { ImportColumnModal } from "@/components/feed/ImportColumnModal";
import { SidebarColumnList } from "@/components/layout/SidebarColumnList";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { NotificationsModal } from "@/components/layout/NotificationsModal";
import { ProfileSearchModal } from "@/components/search/ProfileSearchModal";
import { useNotificationUnread } from "@/hooks/useNotificationUnread";
import { useUiStore } from "@/store/ui";

const SIDEBAR_WIDTH = 200;
/** Narrow rail — fits md avatar (28px) + padding without clipping. */
const SIDEBAR_COLLAPSED_WIDTH = 70;
interface SidebarProps {
  user: SessionUser;
  onLogout: () => void;
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [importColumnOpen, setImportColumnOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsSession, setNotificationsSession] = useState(0);
  const openProfilePreview = useUiStore((s) => s.openProfilePreview);
  const { unreadCount: unreadNotificationCount, markSeen: markNotificationsSeen } =
    useNotificationUnread(user.fid, notificationsOpen);

  const widthPx = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH;

  function openNotifications() {
    setNotificationsSession((s) => s + 1);
    setNotificationsOpen(true);
  }

  function openMyProfile() {
    openProfilePreview({
      fid: user.fid,
      username: user.username,
      displayName: user.displayName,
      pfpUrl: user.pfpUrl,
    });
  }

  function closeNotifications() {
    setNotificationsOpen(false);
  }

  return (
    <>
      <aside
        style={{ width: widthPx }}
        className="shrink-0 flex flex-col h-full border-r border-[var(--border)] bg-[var(--background)] transition-[width] duration-200 ease-out z-30 overflow-hidden"
      >
        <div
          className={`flex h-12 shrink-0 border-b border-[var(--border)] px-2 ${
            collapsed ? "items-center justify-center" : "items-center gap-2"
          }`}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="p-1 rounded-lg hover:bg-[var(--surface-hover)] transition-colors shrink-0"
              title="Expand sidebar"
            >
              <ColumnsLogo />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="flex items-center gap-2 min-w-0 flex-1 rounded-lg p-1 -m-1 hover:bg-[var(--surface-hover)] transition-colors text-left"
                title="Collapse sidebar"
              >
                <ColumnsLogo />
                <span className="font-semibold text-sm text-[var(--foreground)] truncate">
                  Columns
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors shrink-0"
                title="Collapse sidebar"
              >
                <IconChevronLeft />
              </button>
            </>
          )}
        </div>

        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto min-h-0">
              <SidebarButton
                collapsed={collapsed}
                icon={<IconPlus />}
                label="New Cast"
                accent
                onClick={() => setComposeOpen(true)}
              />

              <SidebarButton
                collapsed={collapsed}
                icon={<IconSearch />}
                label="Search"
                onClick={() => setSearchOpen(true)}
              />

              <SidebarButton
                collapsed={collapsed}
                icon={<IconBell />}
                label="Notifications"
                badgeCount={unreadNotificationCount}
                title={
                  unreadNotificationCount > 0
                    ? `Notifications — ${unreadNotificationCount} unread`
                    : "Notifications"
                }
                onClick={openNotifications}
              />

              <SidebarButton
                collapsed={collapsed}
                icon={<IconColumns />}
                label="Add column"
                onClick={() => setAddColumnOpen(true)}
              />

              <SidebarButton
                collapsed={collapsed}
                icon={<IconImport />}
                label="Import column"
                onClick={() => setImportColumnOpen(true)}
              />

              {!collapsed && <SidebarColumnList />}

              <div className="mt-auto" />

              <SidebarButton
                collapsed={collapsed}
                icon={theme === "dark" ? <IconSun /> : <IconMoon />}
                label={theme === "dark" ? "Light mode" : "Dark mode"}
                onClick={toggleTheme}
              />
            </nav>

            <div className="shrink-0 border-t border-[var(--border)] p-2 space-y-0.5">
              <SidebarButton
                collapsed={collapsed}
                icon={<IconSignOut />}
                label="Sign out"
                onClick={onLogout}
              />
              <button
                type="button"
                onClick={openMyProfile}
                title={collapsed ? user.displayName : undefined}
                className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-[var(--surface-hover)] transition-colors ${collapsed ? "justify-center" : ""}`}
              >
                <UserAvatar
                  src={user.pfpUrl}
                  alt={user.displayName}
                  size="md"
                  className="ring-2 ring-transparent group-hover:ring-[var(--accent)]"
                />
                {!collapsed && (
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-medium text-[var(--foreground)] truncate">
                      {user.displayName}
                    </p>
                    <p className="text-[10px] text-[var(--muted)] truncate">
                      @{user.username}
                    </p>
                  </div>
                )}
              </button>
            </div>
      </aside>

      <NotificationsModal
        open={notificationsOpen}
        listSession={notificationsSession}
        onClose={closeNotifications}
        viewerFid={user.fid}
        onFreshLoad={(latestMs) =>
          markNotificationsSeen(latestMs > 0 ? latestMs : undefined)
        }
      />

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}
      {searchOpen && <ProfileSearchModal open onClose={() => setSearchOpen(false)} />}
      {addColumnOpen && <AddColumnModal onClose={() => setAddColumnOpen(false)} />}
      {importColumnOpen && <ImportColumnModal onClose={() => setImportColumnOpen(false)} />}
    </>
  );
}

// ─── Sidebar button ───────────────────────────────────────────────────────────
function SidebarButton({
  collapsed,
  icon,
  label,
  accent,
  active,
  badgeCount,
  title,
  onClick,
}: {
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  active?: boolean;
  /** Unread notification count on the bell icon */
  badgeCount?: number;
  title?: string;
  onClick: () => void;
}) {
  const base = accent
    ? "bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white"
    : active
      ? "text-[var(--foreground)] bg-[var(--surface-hover)]"
      : "text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]";

  return (
    <button
      onClick={onClick}
      title={title ?? (collapsed ? label : undefined)}
      className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors ${base} ${collapsed ? "justify-center" : ""} w-full`}
    >
      <span className="relative shrink-0">
        {icon}
        {badgeCount != null && badgeCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-1 flex items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold leading-none text-white ring-2 ring-[var(--background)]"
            aria-hidden
          >
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </span>
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function ColumnsLogo() {
  return (
    <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0">
      <Image src={columnsLogo} alt="Columns" width={28} height={28} className="object-cover" />
    </div>
  );
}

function IconChevronLeft() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
  );
}
function IconPlus() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
function IconSearch() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
      />
    </svg>
  );
}
function IconBell() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
      />
    </svg>
  );
}
function IconImport() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
      />
    </svg>
  );
}
function IconColumns() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
    </svg>
  );
}
function IconSignOut() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}
function IconSun() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );
}
function IconMoon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  );
}
