CREATE TABLE public.facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  facility_type text NOT NULL DEFAULT 'hospital' CHECK (facility_type IN ('hospital','clinic','satellite')),
  tier text NOT NULL DEFAULT 'enterprise' CHECK (tier IN ('starter','pro','enterprise')),
  address text, phone text, email text,
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.facilities TO authenticated;
GRANT ALL ON public.facilities TO service_role;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  role public.app_role,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, facility_id)
);
GRANT SELECT ON public.user_facilities TO authenticated;
GRANT ALL ON public.user_facilities TO service_role;
ALTER TABLE public.user_facilities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.facility_modules (
  facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,
  module text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (facility_id, module)
);
GRANT SELECT ON public.facility_modules TO authenticated;
GRANT ALL ON public.facility_modules TO service_role;
ALTER TABLE public.facility_modules ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_facility_access(_facility uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR EXISTS (SELECT 1 FROM public.user_facilities WHERE user_id = auth.uid() AND facility_id = _facility)
$$;

CREATE OR REPLACE FUNCTION public.main_facility_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.facilities WHERE code = 'MAIN'
$$;

CREATE POLICY "facilities read" ON public.facilities FOR SELECT TO authenticated
  USING (public.is_staff_member() AND (is_active OR public.has_role(auth.uid(),'admin')));
CREATE POLICY "facilities admin write" ON public.facilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.facilities TO authenticated;

CREATE POLICY "user_facilities own or admin" ON public.user_facilities FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_facilities admin write" ON public.user_facilities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.user_facilities TO authenticated;

CREATE POLICY "facility_modules read" ON public.facility_modules FOR SELECT TO authenticated
  USING (public.is_staff_member());
CREATE POLICY "facility_modules admin write" ON public.facility_modules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
GRANT INSERT, UPDATE, DELETE ON public.facility_modules TO authenticated;

INSERT INTO public.facilities (name, code, facility_type, tier, address, phone, email)
VALUES ('Litu Diagnostics — Central','MAIN','hospital','enterprise','Nairobi, Kenya','+254781872670','info@litudiagnostics.com');

INSERT INTO public.facility_modules (facility_id, module, enabled)
SELECT f.id, m, true FROM public.facilities f,
  unnest(ARRAY['outpatient','pharmacy','laboratory','radiology','billing','inpatient_haims','theatre','mobility','sports','hr','inventory','immunization','chronic_care']) m
WHERE f.code='MAIN';

INSERT INTO public.user_facilities (user_id, facility_id, is_primary)
SELECT DISTINCT ur.user_id, public.main_facility_id(), true FROM public.user_roles ur
WHERE ur.role NOT IN ('patient','athlete');

ALTER TABLE public.patients ADD COLUMN facility_id uuid REFERENCES public.facilities(id) DEFAULT public.main_facility_id();
ALTER TABLE public.visits ADD COLUMN facility_id uuid REFERENCES public.facilities(id) DEFAULT public.main_facility_id();
UPDATE public.patients SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
UPDATE public.visits SET facility_id = public.main_facility_id() WHERE facility_id IS NULL;
CREATE INDEX idx_visits_facility_opened ON public.visits(facility_id, opened_at);

-- Patient record access audit (search results are masked until opened)
CREATE TABLE public.patient_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  patient_id uuid NOT NULL,
  facility_id uuid,
  context text,
  accessed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.patient_access_log TO authenticated;
GRANT ALL ON public.patient_access_log TO service_role;
ALTER TABLE public.patient_access_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "access log insert own" ON public.patient_access_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_staff_member());
CREATE POLICY "access log admin read" ON public.patient_access_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- Trip telematics
ALTER TABLE public.mobility_trips
  ADD COLUMN estimated_distance_km numeric,
  ADD COLUMN estimated_duration_minutes integer,
  ADD COLUMN actual_distance_km numeric,
  ADD COLUMN actual_duration_minutes integer,
  ADD COLUMN route_polyline text,
  ADD COLUMN estimated_fare_cents integer;

CREATE TABLE public.mobility_trip_points (
  id bigserial PRIMARY KEY,
  trip_id uuid NOT NULL REFERENCES public.mobility_trips(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m real,
  speed_mps real,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trip_points_trip ON public.mobility_trip_points(trip_id, recorded_at);
GRANT SELECT, INSERT ON public.mobility_trip_points TO authenticated;
GRANT USAGE ON SEQUENCE public.mobility_trip_points_id_seq TO authenticated;
GRANT ALL ON public.mobility_trip_points TO service_role;
ALTER TABLE public.mobility_trip_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip points staff read" ON public.mobility_trip_points FOR SELECT TO authenticated
  USING (public.is_fleet_staff() OR public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.mobility_trips t JOIN public.mobility_drivers d ON d.id = t.driver_id
    WHERE t.id = trip_id AND d.user_id = auth.uid()));
CREATE POLICY "trip points driver insert" ON public.mobility_trip_points FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.mobility_trips t JOIN public.mobility_drivers d ON d.id = t.driver_id
    WHERE t.id = trip_id AND d.user_id = auth.uid()));