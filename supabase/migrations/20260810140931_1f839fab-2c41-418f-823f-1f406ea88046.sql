-- ============ helper predicates ============
CREATE OR REPLACE FUNCTION public.is_fleet_staff()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'fleet_manager')
$$;

CREATE OR REPLACE FUNCTION public.is_clinical_requester()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(),'admin')
      OR public.has_role(auth.uid(),'doctor')
      OR public.has_role(auth.uid(),'nurse')
      OR public.has_role(auth.uid(),'receptionist')
      OR public.has_role(auth.uid(),'admissions_officer')
      OR public.has_role(auth.uid(),'fleet_manager')
$$;

-- ============ drivers ============
CREATE TABLE public.mobility_drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  phone text,
  licence_number text,
  licence_expiry date,
  qualifications text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'offline',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_drivers TO authenticated;
GRANT ALL ON public.mobility_drivers TO service_role;
ALTER TABLE public.mobility_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY drv_select ON public.mobility_drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY drv_manage ON public.mobility_drivers FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());
CREATE POLICY drv_self_update ON public.mobility_drivers FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ equipment catalogue ============
CREATE TABLE public.mobility_equipment_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_equipment_types TO authenticated;
GRANT ALL ON public.mobility_equipment_types TO service_role;
ALTER TABLE public.mobility_equipment_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY eq_select ON public.mobility_equipment_types FOR SELECT TO authenticated USING (true);
CREATE POLICY eq_manage ON public.mobility_equipment_types FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

-- ============ vehicles ============
CREATE TABLE public.mobility_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE,
  vehicle_type text NOT NULL,
  category text,
  make text,
  model text,
  capacity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'available',
  base_location text,
  current_location text,
  current_lat numeric,
  current_lng numeric,
  driver_id uuid REFERENCES public.mobility_drivers(id) ON DELETE SET NULL,
  crew text[] NOT NULL DEFAULT '{}',
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_vehicles TO authenticated;
GRANT ALL ON public.mobility_vehicles TO service_role;
ALTER TABLE public.mobility_vehicles ENABLE ROW LEVEL SECURITY;
CREATE POLICY veh_select ON public.mobility_vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY veh_manage ON public.mobility_vehicles FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());
CREATE POLICY veh_driver_update ON public.mobility_vehicles FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT id FROM public.mobility_drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM public.mobility_drivers WHERE user_id = auth.uid()));

CREATE TABLE public.mobility_vehicle_equipment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.mobility_vehicles(id) ON DELETE CASCADE,
  equipment_code text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  last_checked_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vehicle_id, equipment_code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_vehicle_equipment TO authenticated;
GRANT ALL ON public.mobility_vehicle_equipment TO service_role;
ALTER TABLE public.mobility_vehicle_equipment ENABLE ROW LEVEL SECURITY;
CREATE POLICY veq_select ON public.mobility_vehicle_equipment FOR SELECT TO authenticated USING (true);
CREATE POLICY veq_manage ON public.mobility_vehicle_equipment FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

CREATE TABLE public.mobility_vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.mobility_vehicles(id) ON DELETE CASCADE,
  doc_type text NOT NULL,
  reference text,
  issued_on date,
  expires_on date,
  blocks_dispatch boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_vehicle_documents TO authenticated;
GRANT ALL ON public.mobility_vehicle_documents TO service_role;
ALTER TABLE public.mobility_vehicle_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY vdoc_select ON public.mobility_vehicle_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY vdoc_manage ON public.mobility_vehicle_documents FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

CREATE TABLE public.mobility_vehicle_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.mobility_vehicles(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'service',
  performed_on date,
  next_due_on date,
  vendor text,
  cost_cents integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_vehicle_maintenance TO authenticated;
GRANT ALL ON public.mobility_vehicle_maintenance TO service_role;
ALTER TABLE public.mobility_vehicle_maintenance ENABLE ROW LEVEL SECURITY;
CREATE POLICY vmt_select ON public.mobility_vehicle_maintenance FOR SELECT TO authenticated USING (true);
CREATE POLICY vmt_manage ON public.mobility_vehicle_maintenance FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

-- ============ locations ============
CREATE TABLE public.mobility_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL,
  address text NOT NULL,
  lat numeric,
  lng numeric,
  is_facility boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_locations TO authenticated;
GRANT ALL ON public.mobility_locations TO service_role;
ALTER TABLE public.mobility_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY loc_select ON public.mobility_locations FOR SELECT TO authenticated
  USING (is_facility OR owner_id = auth.uid() OR public.is_fleet_staff());
CREATE POLICY loc_own ON public.mobility_locations FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.is_fleet_staff())
  WITH CHECK (owner_id = auth.uid() OR public.is_fleet_staff());

-- ============ pricing ============
CREATE TABLE public.mobility_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL,
  tier text NOT NULL DEFAULT 'standard',
  label text NOT NULL,
  currency text NOT NULL DEFAULT 'KES',
  base_fare_cents integer NOT NULL DEFAULT 0,
  per_km_cents integer NOT NULL DEFAULT 0,
  per_minute_cents integer NOT NULL DEFAULT 0,
  waiting_per_minute_cents integer NOT NULL DEFAULT 0,
  minimum_fare_cents integer NOT NULL DEFAULT 0,
  crew_cents integer NOT NULL DEFAULT 0,
  equipment_cents integer NOT NULL DEFAULT 0,
  accessibility_cents integer NOT NULL DEFAULT 0,
  after_hours_pct integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_type, tier)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_pricing_rules TO authenticated;
GRANT ALL ON public.mobility_pricing_rules TO service_role;
ALTER TABLE public.mobility_pricing_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY prc_select ON public.mobility_pricing_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY prc_manage ON public.mobility_pricing_rules FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

-- ============ requests ============
CREATE SEQUENCE IF NOT EXISTS public.mobility_request_seq START 1000;

CREATE TABLE public.mobility_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code text NOT NULL UNIQUE DEFAULT ('TRQ-' || nextval('public.mobility_request_seq')::text),
  service_type text NOT NULL,
  subject text NOT NULL DEFAULT 'self',
  patient_id uuid REFERENCES public.patients(id) ON DELETE SET NULL,
  requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requester_name text,
  requester_phone text,
  requester_relationship text,
  pickup_label text NOT NULL,
  pickup_address text,
  pickup_lat numeric,
  pickup_lng numeric,
  destination_label text NOT NULL,
  destination_address text,
  destination_lat numeric,
  destination_lng numeric,
  schedule_mode text NOT NULL DEFAULT 'now',
  scheduled_at timestamptz,
  passengers integer NOT NULL DEFAULT 1,
  declared_priority text NOT NULL DEFAULT 'routine',
  clinical_priority text,
  clinical_priority_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  clinical_priority_at timestamptz,
  condition_notes text,
  requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  special_instructions text,
  distance_km numeric NOT NULL DEFAULT 0,
  estimated_fare_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'REQUESTED',
  origin text NOT NULL DEFAULT 'patient_portal',
  encounter_id uuid,
  encounter_type text,
  department text,
  requesting_clinician uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mob_req_status ON public.mobility_requests(status);
CREATE INDEX idx_mob_req_patient ON public.mobility_requests(patient_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_requests TO authenticated;
GRANT ALL ON public.mobility_requests TO service_role;
ALTER TABLE public.mobility_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY req_select ON public.mobility_requests FOR SELECT TO authenticated USING (
  public.is_fleet_staff()
  OR requester_id = auth.uid()
  OR public.is_clinical_requester()
  OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = mobility_requests.patient_id AND p.user_id = auth.uid())
);
CREATE POLICY req_insert ON public.mobility_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid());
CREATE POLICY req_update_staff ON public.mobility_requests FOR UPDATE TO authenticated
  USING (public.is_fleet_staff() OR requester_id = auth.uid() OR public.is_clinical_requester())
  WITH CHECK (public.is_fleet_staff() OR requester_id = auth.uid() OR public.is_clinical_requester());

-- ============ trips ============
CREATE TABLE public.mobility_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mobility_requests(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES public.mobility_vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.mobility_drivers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ASSIGNED',
  assigned_at timestamptz,
  accepted_at timestamptz,
  en_route_at timestamptz,
  arrived_pickup_at timestamptz,
  boarding_at timestamptz,
  in_transit_at timestamptz,
  arrived_destination_at timestamptz,
  handover_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  eta_minutes integer,
  distance_km numeric NOT NULL DEFAULT 0,
  waiting_minutes integer NOT NULL DEFAULT 0,
  fare_cents integer NOT NULL DEFAULT 0,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  payment_method text,
  handover_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mob_trip_status ON public.mobility_trips(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mobility_trips TO authenticated;
GRANT ALL ON public.mobility_trips TO service_role;
ALTER TABLE public.mobility_trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_select ON public.mobility_trips FOR SELECT TO authenticated USING (
  public.is_fleet_staff()
  OR public.is_clinical_requester()
  OR driver_id IN (SELECT id FROM public.mobility_drivers WHERE user_id = auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.mobility_requests r
    LEFT JOIN public.patients p ON p.id = r.patient_id
    WHERE r.id = mobility_trips.request_id
      AND (r.requester_id = auth.uid() OR p.user_id = auth.uid())
  )
);
CREATE POLICY trip_manage ON public.mobility_trips FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());
CREATE POLICY trip_driver_update ON public.mobility_trips FOR UPDATE TO authenticated
  USING (driver_id IN (SELECT id FROM public.mobility_drivers WHERE user_id = auth.uid()))
  WITH CHECK (driver_id IN (SELECT id FROM public.mobility_drivers WHERE user_id = auth.uid()));

CREATE TABLE public.mobility_trip_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid REFERENCES public.mobility_trips(id) ON DELETE CASCADE,
  request_id uuid REFERENCES public.mobility_requests(id) ON DELETE CASCADE,
  status text NOT NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mob_evt_trip ON public.mobility_trip_events(trip_id, created_at);
GRANT SELECT, INSERT ON public.mobility_trip_events TO authenticated;
GRANT ALL ON public.mobility_trip_events TO service_role;
ALTER TABLE public.mobility_trip_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY evt_select ON public.mobility_trip_events FOR SELECT TO authenticated USING (
  public.is_fleet_staff()
  OR public.is_clinical_requester()
  OR EXISTS (
    SELECT 1 FROM public.mobility_requests r
    LEFT JOIN public.patients p ON p.id = r.patient_id
    WHERE r.id = mobility_trip_events.request_id
      AND (r.requester_id = auth.uid() OR p.user_id = auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.mobility_trips t
    JOIN public.mobility_drivers d ON d.id = t.driver_id
    WHERE t.id = mobility_trip_events.trip_id AND d.user_id = auth.uid()
  )
);
CREATE POLICY evt_insert ON public.mobility_trip_events FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() OR actor_id IS NULL);

CREATE TABLE public.mobility_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mobility_requests(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.mobility_trips(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.mobility_vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES public.mobility_drivers(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'manual',
  score numeric,
  reason text,
  dispatched_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.mobility_dispatches TO authenticated;
GRANT ALL ON public.mobility_dispatches TO service_role;
ALTER TABLE public.mobility_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY dsp_select ON public.mobility_dispatches FOR SELECT TO authenticated
  USING (public.is_fleet_staff() OR public.is_clinical_requester());
CREATE POLICY dsp_manage ON public.mobility_dispatches FOR ALL TO authenticated
  USING (public.is_fleet_staff()) WITH CHECK (public.is_fleet_staff());

-- ============ specialised workflows ============
CREATE TABLE public.mobility_mortuary_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mobility_requests(id) ON DELETE CASCADE,
  deceased_name text NOT NULL,
  deceased_age integer,
  deceased_gender text,
  date_of_death date,
  documentation jsonb NOT NULL DEFAULT '{}'::jsonb,
  documentation_status text NOT NULL DEFAULT 'pending',
  released_by text,
  received_by text,
  handover_at timestamptz,
  handover_confirmed boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.mobility_mortuary_transfers TO authenticated;
GRANT ALL ON public.mobility_mortuary_transfers TO service_role;
ALTER TABLE public.mobility_mortuary_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY mort_select ON public.mobility_mortuary_transfers FOR SELECT TO authenticated USING (
  public.is_fleet_staff() OR public.is_clinical_requester()
  OR EXISTS (SELECT 1 FROM public.mobility_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);
CREATE POLICY mort_write ON public.mobility_mortuary_transfers FOR ALL TO authenticated USING (
  public.is_fleet_staff()
  OR EXISTS (SELECT 1 FROM public.mobility_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
) WITH CHECK (
  public.is_fleet_staff()
  OR EXISTS (SELECT 1 FROM public.mobility_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);

CREATE TABLE public.mobility_hospital_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mobility_requests(id) ON DELETE CASCADE,
  from_facility text NOT NULL,
  to_facility text NOT NULL,
  mrn text,
  reason text NOT NULL,
  clinical_summary text,
  patient_condition text,
  equipment_required text[] NOT NULL DEFAULT '{}',
  escort_required boolean NOT NULL DEFAULT false,
  escort_role text,
  referral_documents text,
  accepting_clinician text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.mobility_hospital_transfers TO authenticated;
GRANT ALL ON public.mobility_hospital_transfers TO service_role;
ALTER TABLE public.mobility_hospital_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY htx_select ON public.mobility_hospital_transfers FOR SELECT TO authenticated
  USING (public.is_fleet_staff() OR public.is_clinical_requester());
CREATE POLICY htx_write ON public.mobility_hospital_transfers FOR ALL TO authenticated
  USING (public.is_fleet_staff() OR public.is_clinical_requester())
  WITH CHECK (public.is_fleet_staff() OR public.is_clinical_requester());

-- ============ triggers ============
CREATE TRIGGER trg_mob_veh_updated BEFORE UPDATE ON public.mobility_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mob_req_updated BEFORE UPDATE ON public.mobility_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_mob_trip_updated BEFORE UPDATE ON public.mobility_trips
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.mobility_notify_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.mobility_trip_events(request_id, status, actor_id, note)
  VALUES (NEW.id, 'REQUESTED', NEW.requester_id, 'Transport request created');
  PERFORM public.notify_role('fleet_manager','mobility',
    CASE WHEN NEW.declared_priority = 'emergency' THEN 'EMERGENCY transport request' ELSE 'New transport request' END,
    NEW.request_code || ' · ' || NEW.service_type || ' · ' || NEW.pickup_label || ' → ' || NEW.destination_label,
    '/mobility/dispatch', 'mobility_request', NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_mob_req_notify AFTER INSERT ON public.mobility_requests
  FOR EACH ROW EXECUTE FUNCTION public.mobility_notify_request();

CREATE OR REPLACE FUNCTION public.mobility_trip_status_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req public.mobility_requests%ROWTYPE; v_patient_user uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN RETURN NEW; END IF;

  INSERT INTO public.mobility_trip_events(trip_id, request_id, status, actor_id)
  VALUES (NEW.id, NEW.request_id, NEW.status, auth.uid());

  UPDATE public.mobility_requests SET status = NEW.status WHERE id = NEW.request_id;

  SELECT * INTO v_req FROM public.mobility_requests WHERE id = NEW.request_id;
  SELECT p.user_id INTO v_patient_user FROM public.patients p WHERE p.id = v_req.patient_id;

  IF v_req.requester_id IS NOT NULL THEN
    INSERT INTO public.notifications(recipient_id, type, title, body, link, entity_type, entity_id)
    VALUES (v_req.requester_id, 'mobility', 'Transport update',
      v_req.request_code || ' is now ' || replace(NEW.status,'_',' '), '/mobility/trips', 'mobility_trip', NEW.id);
  END IF;
  IF v_patient_user IS NOT NULL AND v_patient_user <> COALESCE(v_req.requester_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
    INSERT INTO public.notifications(recipient_id, type, title, body, link, entity_type, entity_id)
    VALUES (v_patient_user, 'mobility', 'Transport update',
      v_req.request_code || ' is now ' || replace(NEW.status,'_',' '), '/mobility/trips', 'mobility_trip', NEW.id);
  END IF;

  IF NEW.status IN ('COMPLETED','CANCELLED','NO_SHOW','UNABLE_TO_COMPLETE') AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.mobility_vehicles SET status = 'available' WHERE id = NEW.vehicle_id;
  ELSIF NEW.status IN ('EN_ROUTE_TO_PICKUP','ARRIVED_PICKUP','PATIENT_BOARDING') AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.mobility_vehicles SET status = 'en_route' WHERE id = NEW.vehicle_id;
  ELSIF NEW.status IN ('IN_TRANSIT','ARRIVED_DESTINATION','HANDOVER') AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.mobility_vehicles SET status = 'on_trip' WHERE id = NEW.vehicle_id;
  ELSIF NEW.status IN ('ASSIGNED','DRIVER_ACCEPTED') AND NEW.vehicle_id IS NOT NULL THEN
    UPDATE public.mobility_vehicles SET status = 'assigned' WHERE id = NEW.vehicle_id;
  END IF;

  RETURN NEW;
END $$;
CREATE TRIGGER trg_mob_trip_event AFTER INSERT OR UPDATE OF status ON public.mobility_trips
  FOR EACH ROW EXECUTE FUNCTION public.mobility_trip_status_event();

-- ============ billing bridge ============
CREATE OR REPLACE FUNCTION public.mobility_bill_trip(_trip uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_trip public.mobility_trips%ROWTYPE; v_req public.mobility_requests%ROWTYPE;
        v_inv uuid; v_desc text;
BEGIN
  SELECT * INTO v_trip FROM public.mobility_trips WHERE id = _trip;
  IF v_trip.id IS NULL THEN RAISE EXCEPTION 'Trip not found'; END IF;
  IF v_trip.invoice_id IS NOT NULL THEN RETURN v_trip.invoice_id; END IF;
  SELECT * INTO v_req FROM public.mobility_requests WHERE id = v_trip.request_id;
  IF v_req.patient_id IS NULL THEN RETURN NULL; END IF;

  SELECT id INTO v_inv FROM public.invoices
   WHERE patient_id = v_req.patient_id AND status IN ('draft','issued','partially_paid')
   ORDER BY created_at DESC LIMIT 1;
  IF v_inv IS NULL THEN
    INSERT INTO public.invoices(patient_id, status) VALUES (v_req.patient_id,'draft') RETURNING id INTO v_inv;
  END IF;

  v_desc := 'Transport · ' || v_req.service_type || ' · ' || v_req.pickup_label || ' → ' || v_req.destination_label;
  INSERT INTO public.invoice_items(invoice_id, kind, ref_table, ref_id, description, qty, unit_price_cents, amount_cents)
  VALUES (v_inv, 'transport', 'mobility_trips', _trip, v_desc, 1, v_trip.fare_cents, v_trip.fare_cents);

  UPDATE public.invoices SET total_cents = COALESCE(total_cents,0) + v_trip.fare_cents WHERE id = v_inv;
  UPDATE public.mobility_trips SET invoice_id = v_inv WHERE id = _trip;
  RETURN v_inv;
END $$;
REVOKE ALL ON FUNCTION public.mobility_bill_trip(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mobility_bill_trip(uuid) TO authenticated;

-- ============ seed reference data ============
INSERT INTO public.mobility_equipment_types(code,label,category) VALUES
  ('oxygen','Oxygen supply','clinical'),
  ('stretcher','Stretcher','mobility'),
  ('wheelchair','Wheelchair','mobility'),
  ('monitor','Patient monitor','clinical'),
  ('defibrillator','Defibrillator','clinical'),
  ('suction','Suction unit','clinical'),
  ('ventilator','Portable ventilator','clinical'),
  ('infusion_pump','Infusion pump','clinical'),
  ('first_aid','First aid kit','general'),
  ('incubator','Neonatal incubator','clinical'),
  ('mortuary_tray','Mortuary tray','mortuary'),
  ('cold_chamber','Refrigerated chamber','mortuary'),
  ('child_seat','Child seat','general'),
  ('ramp','Wheelchair ramp','mobility');

INSERT INTO public.mobility_pricing_rules
  (service_type,tier,label,base_fare_cents,per_km_cents,per_minute_cents,waiting_per_minute_cents,minimum_fare_cents,crew_cents,equipment_cents,accessibility_cents,after_hours_pct) VALUES
  ('cab','standard','Healthcare Cab — standard',       20000, 6000,  500,  800,  40000,     0,     0,     0, 20),
  ('assisted','standard','Assisted / Wheelchair Transport', 50000, 8000, 800, 1000, 120000,     0, 20000, 30000, 15),
  ('ambulance','bls','Ambulance — Basic Life Support', 350000,12000, 1000, 1500, 500000, 50000, 30000,     0, 10),
  ('ambulance','als','Ambulance — Advanced Life Support', 750000,18000,1500, 2000,1000000,150000,100000,    0, 10),
  ('hearse','standard','Hearse / Mortuary Transport',  600000,15000,    0, 1000, 800000,     0, 50000,     0,  0),
  ('transfer','standard','Inter-facility Transfer',    500000,14000, 1200, 1500, 700000,100000, 50000,     0, 10);

INSERT INTO public.mobility_locations(label,address,lat,lng,is_facility) VALUES
  ('Litu Hospital — Main Gate','Ngong Road, Nairobi',-1.30190,36.76840,true),
  ('Litu Diagnostics — Laboratory','Ngong Road, Nairobi',-1.30250,36.76900,true),
  ('Kenyatta National Hospital','Hospital Road, Nairobi',-1.30110,36.80730,true),
  ('Nairobi Hospital','Argwings Kodhek Road, Nairobi',-1.29610,36.80280,true),
  ('Aga Khan University Hospital','3rd Parklands Avenue, Nairobi',-1.26260,36.81730,true),
  ('Mater Misericordiae Hospital','Dunga Road, South B, Nairobi',-1.31460,36.83400,true),
  ('MP Shah Hospital','Shivachi Road, Parklands, Nairobi',-1.26150,36.80800,true),
  ('Jomo Kenyatta International Airport','Embakasi, Nairobi',-1.31920,36.92780,true),
  ('Litu Mortuary','Ngong Road, Nairobi',-1.30300,36.76780,true);