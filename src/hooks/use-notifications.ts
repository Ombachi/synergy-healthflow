import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface Notification {
  id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  const qc = useQueryClient();
  const { user } = useAuth();

  const list = useQuery({
    queryKey: ["notifications"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data as unknown as Notification[]) ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: ["notifications"] });
          qc.invalidateQueries({ queryKey: ["work-counts"] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  const unreadCount = (list.data ?? []).filter((n) => !n.read_at).length;

  async function markRead(id: string) {
    await supabase.from("notifications" as never).update({ read_at: new Date().toISOString() } as never).eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }
  async function markAllRead() {
    await supabase.from("notifications" as never).update({ read_at: new Date().toISOString() } as never).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  }

  return { notifications: list.data ?? [], unreadCount, markRead, markAllRead, isLoading: list.isLoading };
}

/** Live unread-work counts for portal sidebar badges. */
export function useWorkCounts() {
  const { roles } = useAuth();
  return useQuery({
    queryKey: ["work-counts", roles.join(",")],
    queryFn: async () => {
      const counts: Record<string, number> = {};
      const tasks: Promise<void>[] = [];
      if (roles.includes("lab_tech") || roles.includes("admin")) {
        tasks.push(
          supabase.from("lab_orders" as never).select("*", { count: "exact", head: true }).neq("status", "resulted")
            .then(({ count }) => { counts.lab = count ?? 0; }),
        );
      }
      if (roles.includes("radiologist") || roles.includes("admin")) {
        tasks.push(
          supabase.from("imaging_orders" as never).select("*", { count: "exact", head: true }).neq("status", "completed")
            .then(({ count }) => { counts.radiology = count ?? 0; }),
        );
      }
      if (roles.includes("pharmacist") || roles.includes("admin")) {
        tasks.push(
          supabase.from("prescriptions" as never).select("*", { count: "exact", head: true })
            .then(({ count }) => { counts.pharmacy = count ?? 0; }),
        );
      }
      await Promise.all(tasks);
      return counts;
    },
    enabled: roles.length > 0,
    refetchInterval: 30000,
  });
}
