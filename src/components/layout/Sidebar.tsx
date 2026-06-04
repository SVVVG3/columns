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
import { NotificationsPanel } from "@/components/layout/NotificationsPanel";
import { useNotificationUnread } from "@/hooks/useNotificationUnread";

interface SidebarProps {
  user: SessionUser;
  onLogout: () => void;
}

export function Sidebar({ user, onLogout }: SidebarProps) {
  const { theme, toggleTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [addColumnOpen, setAddColumnOpen] = useState(false);
  const [importColumnOpen, setImportColumnOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { hasUnread: hasUnreadNotifications } = useNotificationUnread(
    user.fid,
    notificationsOpen
  );

  const w = collapsed ? "w-14" : "w-[200px]";

  return (
    <>
      <aside
        className={`${w} shrink-0 flex flex-col h-full border-r border-[var(--border)] bg-[var(--background)] transition-all duration-200 z-20 relative`}
      >
        <NotificationsPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          viewerFid={user.fid}
        />
        {/* Logo + collapse toggle */}
        <div className="flex items-center h-12 shrink-0 border-b border-[var(--border)] px-2 gap-2">
          {!collapsed && (
            <>
              <ColumnsLogo />
              <span className="font-semibold text-sm text-[var(--foreground)] truncate flex-1">Columns</span>
            </>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            className={`p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors shrink-0 ${collapsed ? "mx-auto" : "ml-auto"}`}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <IconChevronRight /> : <IconChevronLeft />}
          </button>
        </div>

        {/* Nav actions */}
        <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto min-h-0">
          {/* Compose */}
          <SidebarButton
            collapsed={collapsed}
            icon={<IconPlus />}
            label="New Cast"
            accent
            onClick={() => setComposeOpen(true)}
          />

          <SidebarButton
            collapsed={collapsed}
            icon={<IconBell />}
            label="Notifications"
            active={notificationsOpen}
            badge={hasUnreadNotifications && !notificationsOpen}
            title={
              hasUnreadNotifications && !notificationsOpen
                ? "Notifications — new activity"
                : "Notifications"
            }
            onClick={() => setNotificationsOpen((o) => !o)}
          />

          {/* Add column */}
          <SidebarButton
            collapsed={collapsed}
            icon={<IconColumns />}
            label="Add column"
            onClick={() => setAddColumnOpen(true)}
          />

          {/* Import a shared column */}
          <SidebarButton
            collapsed={collapsed}
            icon={<IconImport />}
            label="Import column"
            onClick={() => setImportColumnOpen(true)}
          />

          {!collapsed && <SidebarColumnList />}

          <div className="mt-auto" />

          {/* Theme toggle */}
          <SidebarButton
            collapsed={collapsed}
            icon={theme === "dark" ? <IconSun /> : <IconMoon />}
            label={theme === "dark" ? "Light mode" : "Dark mode"}
            onClick={toggleTheme}
          />
        </nav>

        {/* Profile */}
        <div className="shrink-0 border-t border-[var(--border)] p-2 relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className={`w-full flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-[var(--surface-hover)] transition-colors ${collapsed ? "justify-center" : ""}`}
          >
            {user.pfpUrl ? (
              <Image
                src={user.pfpUrl}
                alt={user.displayName}
                width={28}
                height={28}
                className="rounded-full shrink-0 ring-2 ring-transparent group-hover:ring-[var(--accent)]"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--surface-hover)] shrink-0" />
            )}
            {!collapsed && (
              <div className="min-w-0 text-left">
                <p className="text-xs font-medium text-[var(--foreground)] truncate">{user.displayName}</p>
                <p className="text-[10px] text-[var(--muted)] truncate">@{user.username}</p>
              </div>
            )}
          </button>

          {/* Profile dropdown */}
          {profileOpen && (
            <div
              className="absolute bottom-full mb-1 left-2 right-2 bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl z-50"
              onMouseLeave={() => setProfileOpen(false)}
            >
              <a
                href={`https://farcaster.xyz/${user.username}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setProfileOpen(false)}
                className="flex flex-col px-3 py-2 border-b border-[var(--border)] hover:bg-[var(--surface-hover)] rounded-t-xl transition-colors"
              >
                <p className="text-sm font-medium text-[var(--foreground)] truncate">{user.displayName}</p>
                <p className="text-xs text-[var(--muted)] truncate">@{user.username} ↗</p>
              </a>
              <button
                onClick={() => { setProfileOpen(false); onLogout(); }}
                className="w-full text-left px-3 py-2 text-sm text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)] rounded-b-xl transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      {composeOpen && <ComposeModal onClose={() => setComposeOpen(false)} />}
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
  badge,
  title,
  onClick,
}: {
  collapsed: boolean;
  icon: React.ReactNode;
  label: string;
  accent?: boolean;
  active?: boolean;
  /** Purple dot when there are unread notifications */
  badge?: boolean;
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
        {badge && (
          <span
            className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[var(--accent)] ring-2 ring-[var(--background)]"
            aria-hidden
          />
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
function IconChevronRight() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
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
