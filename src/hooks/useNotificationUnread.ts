"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { HypersnapNotification } from "@/lib/notifications";
import {
  countUnreadNotifications,
  latestNotificationTimestampMs,
  notificationsSeenStorageKey,
} from "@/lib/notifications";

interface NotificationsPeek {
  notifications: HypersnapNotification[];
}

const PEEK_LIMIT = 50;

/** Polls Hypersnap notifications in the background and tracks unread vs last-opened time. */
export function useNotificationUnread(viewerFid: number, panelOpen: boolean) {
  const queryClient = useQueryClient();
  const storageKey = notificationsSeenStorageKey(viewerFid);

  const [lastSeenMs, setLastSeenMs] = useState(0);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    setLastSeenMs(stored ? Number(stored) : 0);
  }, [storageKey]);

  const { data, refetch: refetchPeek } = useQuery({
    queryKey: ["notifications", viewerFid, "peek"],
    queryFn: async () => {
      const res = await fetch(
        `/api/notifications?limit=${PEEK_LIMIT}&fresh=1`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json() as Promise<NotificationsPeek>;
    },
    staleTime: 15_000,
    refetchInterval: panelOpen ? false : 60_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications ?? [];

  const latestMs = useMemo(
    () => latestNotificationTimestampMs(notifications),
    [notifications]
  );

  const unreadCount = useMemo(
    () => countUnreadNotifications(notifications, lastSeenMs),
    [notifications, lastSeenMs]
  );

  const markSeen = useCallback(
    (seenMs?: number) => {
      const seen = seenMs ?? latestMs;
      if (!seen || seen <= 0) return;
      localStorage.setItem(storageKey, String(seen));
      setLastSeenMs(seen);
    },
    [latestMs, storageKey]
  );

  const hasUnread = unreadCount > 0;

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["notifications", viewerFid] });
  }, [queryClient, viewerFid]);

  return { hasUnread, unreadCount, markSeen, invalidate, refetchPeek, latestMs };
}
