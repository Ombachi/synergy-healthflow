import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type {
  Driver, MobilityLocation, MobilityRequest, PricingRule, Trip, TripEvent,
  TripStatus, Vehicle, VehicleDocument, VehicleEquipment,
} from "./types";
import { STATUS_TIMESTAMP } from "./types";

/**
 * Data access for the mobility module. Everything goes through the shared
 * Supabase client so RLS decides what each role can see.
 */

const table = (name: string) => supabase.from(name as never);

export const MOBILITY_KEYS = {
  vehicles: ["mobility", "vehicles"] as const,
  equipment: ["mobility", "equipment"] as const,
  equipmentTypes: ["mobility", "equipment-types"] as const,
  documents: ["mobility", "documents"] as const,
  maintenance: ["mobility", "maintenance"] as const,
  drivers: ["mobility", "drivers"] as const,
  locations: ["mobility", "locations"] as const,
  pricing: ["mobility", "pricing"] as const,
  requests: ["mobility", "requests"] as const,
  trips: ["mobility", "trips"] as const,
  events: ["mobility", "events"] as const,
  myPatient: ["mobility", "my-patient"] as const,
};

function useList<T>(key: readonly unknown[], name: string, order = "created_at", asc = false, refetchInterval?: number) {
  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await table(name).select("*").order(order, { ascending: asc });
      if (error) throw error;
      return (data ?? []) as unknown as T[];
    },
    ...(refetchInterval ? { refetchInterval } : {}),
  });
}

export const useVehicles = () => useList<Vehicle>(MOBILITY_KEYS.vehicles, "mobility_vehicles", "registration", true, 20000);
export const useVehicleEquipment = () => useList<VehicleEquipment>(MOBILITY_KEYS.equipment, "mobility_vehicle_equipment", "equipment_code", true);
export const useVehicleDocuments = () => useList<VehicleDocument>(MOBILITY_KEYS.documents, "mobility_vehicle_documents", "expires_on", true);
export const useDrivers = () => useList<Driver>(MOBILITY_KEYS.drivers, "mobility_drivers", "full_name", true, 20000);
export const useLocations = () => useList<MobilityLocation>(MOBILITY_KEYS.locations, "mobility_locations", "label", true);
export const usePricingRules = () => useList<PricingRule>(MOBILITY_KEYS.pricing, "mobility_pricing_rules", "service_type", true);
export const useRequests = () => useList<MobilityRequest>(MOBILITY_KEYS.requests, "mobility_requests", "created_at", false, 15000);
export const useTrips = () => useList<Trip>(MOBILITY_KEYS.trips, "mobility_trips", "created_at", false, 15000);

export function useEquipmentTypes() {
  return useQuery({
    queryKey: MOBILITY_KEYS.equipmentTypes,
    queryFn: async () => {
      const { data, error } = await table("mobility_equipment_types").select("*").order("label");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; code: string; label: string; category: string; active: boolean }[];
    },
  });
}

export function useMaintenance() {
  return useQuery({
    queryKey: MOBILITY_KEYS.maintenance,
    queryFn: async () => {
      const { data, error } = await table("mobility_vehicle_maintenance").select("*").order("performed_on", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as {
        id: string; vehicle_id: string; kind: string; performed_on: string | null;
        next_due_on: string | null; vendor: string | null; cost_cents: number; notes: string | null;
      }[];
    },
  });
}

export function useTripEvents(tripId?: string | null, requestId?: string | null) {
  return useQuery({
    queryKey: [...MOBILITY_KEYS.events, tripId ?? requestId ?? "none"],
    enabled: !!(tripId || requestId),
    queryFn: async () => {
      let q = table("mobility_trip_events").select("*").order("created_at", { ascending: true });
      q = tripId ? q.eq("trip_id", tripId) : q.eq("request_id", requestId!);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as TripEvent[];
    },
    refetchInterval: 20000,
  });
}

/** The patient record belonging to the signed-in user, if any. */
export function useMyPatient() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [...MOBILITY_KEYS.myPatient, user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("patients" as never)
        .select("id, full_name, medical_record_number, phone")
        .eq("user_id", user!.id)
        .maybeSingle();
      return (data ?? null) as unknown as {
        id: string; full_name: string; medical_record_number: string | null; phone: string | null;
      } | null;
    },
  });
}

/** The driver profile linked to the signed-in user, if any. */
export function useMyDriver() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["mobility", "my-driver", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await table("mobility_drivers").select("*").eq("user_id", user!.id).maybeSingle();
      return (data ?? null) as unknown as Driver | null;
    },
    refetchInterval: 20000,
  });
}

export function useInvalidateMobility() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["mobility"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateRequest() {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await table("mobility_requests")
        .insert(payload as never)
        .select("*")
        .single();
      if (error) throw error;
      return data as unknown as MobilityRequest;
    },
    onSuccess: invalidate,
  });
}

export interface AssignInput {
  request: MobilityRequest;
  vehicleId: string;
  driverId: string | null;
  distanceKm: number;
  etaMinutes: number;
  fareCents: number;
  mode: "auto" | "manual";
  score?: number | null;
  reason?: string | null;
  existingTripId?: string | null;
}

export function useAssignVehicle() {
  const invalidate = useInvalidateMobility();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: AssignInput) => {
      let tripId = input.existingTripId ?? null;

      if (tripId) {
        const { error } = await table("mobility_trips")
          .update({
            vehicle_id: input.vehicleId,
            driver_id: input.driverId,
            status: "ASSIGNED",
            assigned_at: new Date().toISOString(),
            accepted_at: null,
            eta_minutes: input.etaMinutes,
            distance_km: input.distanceKm,
            fare_cents: input.fareCents,
          } as never)
          .eq("id", tripId);
        if (error) throw error;
        await table("mobility_dispatches")
          .update({ superseded_at: new Date().toISOString() } as never)
          .eq("request_id", input.request.id)
          .is("superseded_at", null);
      } else {
        const { data, error } = await table("mobility_trips")
          .insert({
            request_id: input.request.id,
            vehicle_id: input.vehicleId,
            driver_id: input.driverId,
            status: "ASSIGNED",
            assigned_at: new Date().toISOString(),
            eta_minutes: input.etaMinutes,
            distance_km: input.distanceKm,
            fare_cents: input.fareCents,
          } as never)
          .select("id")
          .single();
        if (error) throw error;
        tripId = (data as unknown as { id: string }).id;
      }

      const { error: dErr } = await table("mobility_dispatches").insert({
        request_id: input.request.id,
        trip_id: tripId,
        vehicle_id: input.vehicleId,
        driver_id: input.driverId,
        mode: input.mode,
        score: input.score ?? null,
        reason: input.reason ?? null,
        dispatched_by: user?.id ?? null,
      } as never);
      if (dErr) throw dErr;

      if (input.driverId) {
        await table("mobility_drivers").update({ status: "on_trip" } as never).eq("id", input.driverId);
      }
      return tripId;
    },
    onSuccess: invalidate,
  });
}

export function useAdvanceTrip() {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async ({
      trip, to, extra,
    }: { trip: Trip; to: TripStatus; extra?: Record<string, unknown> }) => {
      const stamp = STATUS_TIMESTAMP[to];
      const patch: Record<string, unknown> = { status: to, ...(extra ?? {}) };
      if (stamp) patch[stamp] = new Date().toISOString();

      const { error } = await table("mobility_trips").update(patch as never).eq("id", trip.id);
      if (error) throw error;

      if (to === "COMPLETED") {
        if (trip.driver_id) {
          await table("mobility_drivers").update({ status: "online" } as never).eq("id", trip.driver_id);
        }
        const { error: billErr } = await supabase.rpc("mobility_bill_trip" as never, { _trip: trip.id } as never);
        if (billErr) throw billErr;
      }
      if (["CANCELLED", "NO_SHOW", "UNABLE_TO_COMPLETE", "REJECTED"].includes(to) && trip.driver_id) {
        await table("mobility_drivers").update({ status: "online" } as never).eq("id", trip.driver_id);
      }
      return to;
    },
    onSuccess: invalidate,
  });
}

export function useCancelRequest() {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async ({ requestId, reason }: { requestId: string; reason: string }) => {
      const { error } = await table("mobility_requests")
        .update({ status: "CANCELLED", cancel_reason: reason } as never)
        .eq("id", requestId);
      if (error) throw error;
      await table("mobility_trip_events").insert({
        request_id: requestId, status: "CANCELLED", note: reason,
      } as never);
    },
    onSuccess: invalidate,
  });
}

export function useUpdateRow(name: string) {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const { error } = await table(name).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useInsertRow(name: string) {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await table(name).insert(payload as never).select("*").single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteRow(name: string) {
  const invalidate = useInvalidateMobility();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await table(name).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
