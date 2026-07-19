
-- =========================================================
-- Generic versioning infrastructure
-- =========================================================

-- Helper: create a version snapshot table + trigger for a given source table
-- We inline per-table because Postgres can't parametrize DDL cleanly.

-- ---------- lab_results ----------
CREATE TABLE IF NOT EXISTS public.lab_result_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_lrv_record ON public.lab_result_versions(record_id, version_no DESC);
GRANT SELECT, INSERT ON public.lab_result_versions TO authenticated;
GRANT ALL ON public.lab_result_versions TO service_role;
ALTER TABLE public.lab_result_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical staff can view lab result versions" ON public.lab_result_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'lab_tech')
    OR public.has_role(auth.uid(),'nurse')
  );
CREATE POLICY "system inserts lab result versions" ON public.lab_result_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- lab_result_values ----------
CREATE TABLE IF NOT EXISTS public.lab_result_value_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_lrvv_record ON public.lab_result_value_versions(record_id, version_no DESC);
GRANT SELECT, INSERT ON public.lab_result_value_versions TO authenticated;
GRANT ALL ON public.lab_result_value_versions TO service_role;
ALTER TABLE public.lab_result_value_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical staff can view lab result value versions" ON public.lab_result_value_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'lab_tech')
    OR public.has_role(auth.uid(),'nurse')
  );
CREATE POLICY "system inserts lab result value versions" ON public.lab_result_value_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- imaging_orders ----------
CREATE TABLE IF NOT EXISTS public.imaging_order_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_iov_record ON public.imaging_order_versions(record_id, version_no DESC);
GRANT SELECT, INSERT ON public.imaging_order_versions TO authenticated;
GRANT ALL ON public.imaging_order_versions TO service_role;
ALTER TABLE public.imaging_order_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical staff can view imaging order versions" ON public.imaging_order_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'radiologist')
    OR public.has_role(auth.uid(),'nurse')
  );
CREATE POLICY "system inserts imaging order versions" ON public.imaging_order_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- prescriptions ----------
CREATE TABLE IF NOT EXISTS public.prescription_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_rxv_record ON public.prescription_versions(record_id, version_no DESC);
GRANT SELECT, INSERT ON public.prescription_versions TO authenticated;
GRANT ALL ON public.prescription_versions TO service_role;
ALTER TABLE public.prescription_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical staff can view prescription versions" ON public.prescription_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'nurse')
  );
CREATE POLICY "system inserts prescription versions" ON public.prescription_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- ---------- pharmacy_dispenses ----------
CREATE TABLE IF NOT EXISTS public.pharmacy_dispense_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  record_id UUID NOT NULL,
  version_no INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (record_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_pdv_record ON public.pharmacy_dispense_versions(record_id, version_no DESC);
GRANT SELECT, INSERT ON public.pharmacy_dispense_versions TO authenticated;
GRANT ALL ON public.pharmacy_dispense_versions TO service_role;
ALTER TABLE public.pharmacy_dispense_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clinical staff can view pharmacy dispense versions" ON public.pharmacy_dispense_versions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'pharmacist')
    OR public.has_role(auth.uid(),'doctor')
    OR public.has_role(auth.uid(),'nurse')
  );
CREATE POLICY "system inserts pharmacy dispense versions" ON public.pharmacy_dispense_versions
  FOR INSERT TO authenticated WITH CHECK (true);

-- =========================================================
-- Version snapshot trigger function (generic)
-- Uses TG_ARGV[0] = versions table name
-- =========================================================
CREATE OR REPLACE FUNCTION public.snapshot_previous_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tbl TEXT := TG_ARGV[0];
  v_next INTEGER;
BEGIN
  EXECUTE format('SELECT COALESCE(MAX(version_no),0) + 1 FROM public.%I WHERE record_id = $1', v_tbl)
    INTO v_next USING OLD.id;
  EXECUTE format(
    'INSERT INTO public.%I (record_id, version_no, snapshot, changed_by) VALUES ($1, $2, $3, $4)',
    v_tbl
  ) USING OLD.id, v_next, to_jsonb(OLD), auth.uid();
  RETURN NEW;
END $$;

-- Immutability guard: prevent updates/deletes on version tables (append-only)
CREATE OR REPLACE FUNCTION public.block_version_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Version history is append-only and cannot be modified';
END $$;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'lab_result_versions','lab_result_value_versions','imaging_order_versions',
    'prescription_versions','pharmacy_dispense_versions'
  ]) LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS block_upd_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER block_upd_%I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_version_mutation()', t, t);
  END LOOP;
END $$;

-- Attach snapshot triggers to source tables
DROP TRIGGER IF EXISTS trg_lab_results_version ON public.lab_results;
CREATE TRIGGER trg_lab_results_version
  BEFORE UPDATE ON public.lab_results
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_previous_version('lab_result_versions');

DROP TRIGGER IF EXISTS trg_lab_result_values_version ON public.lab_result_values;
CREATE TRIGGER trg_lab_result_values_version
  BEFORE UPDATE ON public.lab_result_values
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_previous_version('lab_result_value_versions');

DROP TRIGGER IF EXISTS trg_imaging_orders_version ON public.imaging_orders;
CREATE TRIGGER trg_imaging_orders_version
  BEFORE UPDATE ON public.imaging_orders
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_previous_version('imaging_order_versions');

DROP TRIGGER IF EXISTS trg_prescriptions_version ON public.prescriptions;
CREATE TRIGGER trg_prescriptions_version
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_previous_version('prescription_versions');

DROP TRIGGER IF EXISTS trg_pharmacy_dispenses_version ON public.pharmacy_dispenses;
CREATE TRIGGER trg_pharmacy_dispenses_version
  BEFORE UPDATE ON public.pharmacy_dispenses
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_previous_version('pharmacy_dispense_versions');

-- =========================================================
-- Additional lab templates (batch)
-- Only inserts parameters for tests that exist in the catalog
-- and don't already have parameters defined.
-- =========================================================

-- Helper block: seed one parameter if the (test_id, parameter_name) pair is absent
DO $seed$
DECLARE
  v RECORD;
  v_test_id UUID;
  rows JSONB := $j$[
    {"code":"LFT","params":[
      {"n":"Total Bilirubin","u":"µmol/L","lo":3,"hi":21,"cl":null,"ch":100},
      {"n":"Direct Bilirubin","u":"µmol/L","lo":0,"hi":7,"cl":null,"ch":null},
      {"n":"ALT","u":"U/L","lo":7,"hi":56,"cl":null,"ch":500},
      {"n":"AST","u":"U/L","lo":10,"hi":40,"cl":null,"ch":500},
      {"n":"ALP","u":"U/L","lo":44,"hi":147,"cl":null,"ch":null},
      {"n":"GGT","u":"U/L","lo":9,"hi":48,"cl":null,"ch":null},
      {"n":"Total Protein","u":"g/L","lo":60,"hi":83,"cl":null,"ch":null},
      {"n":"Albumin","u":"g/L","lo":35,"hi":50,"cl":20,"ch":null}
    ]},
    {"code":"UEC","params":[
      {"n":"Sodium","u":"mmol/L","lo":135,"hi":145,"cl":120,"ch":160},
      {"n":"Potassium","u":"mmol/L","lo":3.5,"hi":5.1,"cl":2.5,"ch":6.5},
      {"n":"Chloride","u":"mmol/L","lo":98,"hi":107,"cl":null,"ch":null},
      {"n":"Bicarbonate","u":"mmol/L","lo":22,"hi":29,"cl":10,"ch":null},
      {"n":"Urea","u":"mmol/L","lo":2.5,"hi":7.1,"cl":null,"ch":30},
      {"n":"Creatinine","u":"µmol/L","lo":59,"hi":104,"cl":null,"ch":600},
      {"n":"eGFR","u":"mL/min/1.73m²","lo":90,"hi":null,"cl":15,"ch":null}
    ]},
    {"code":"COAG","params":[
      {"n":"PT","u":"sec","lo":11,"hi":13.5,"cl":null,"ch":30},
      {"n":"INR","u":"","lo":0.8,"hi":1.2,"cl":null,"ch":5},
      {"n":"aPTT","u":"sec","lo":25,"hi":35,"cl":null,"ch":100},
      {"n":"Fibrinogen","u":"g/L","lo":2,"hi":4,"cl":1,"ch":null}
    ]},
    {"code":"CARDIAC","params":[
      {"n":"Troponin I","u":"ng/mL","lo":0,"hi":0.04,"cl":null,"ch":0.5},
      {"n":"CK-MB","u":"ng/mL","lo":0,"hi":5,"cl":null,"ch":25},
      {"n":"CK Total","u":"U/L","lo":30,"hi":200,"cl":null,"ch":null},
      {"n":"BNP","u":"pg/mL","lo":0,"hi":100,"cl":null,"ch":400}
    ]},
    {"code":"URINE","params":[
      {"n":"Colour","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"text"},
      {"n":"Appearance","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"text"},
      {"n":"pH","u":"","lo":4.5,"hi":8,"cl":null,"ch":null},
      {"n":"Specific Gravity","u":"","lo":1.005,"hi":1.03,"cl":null,"ch":null},
      {"n":"Protein","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,trace,1+,2+,3+,4+"},
      {"n":"Glucose","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,trace,1+,2+,3+,4+"},
      {"n":"Ketones","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,trace,small,moderate,large"},
      {"n":"Blood","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,trace,1+,2+,3+"},
      {"n":"Leukocytes","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,trace,1+,2+,3+"},
      {"n":"Nitrites","u":"","lo":null,"hi":null,"cl":null,"ch":null,"t":"select","opts":"negative,positive"}
    ]},
    {"code":"STOOL","params":[
      {"n":"Colour","u":"","t":"text"},
      {"n":"Consistency","u":"","t":"select","opts":"formed,soft,loose,watery"},
      {"n":"Ova & Parasites","u":"","t":"select","opts":"none seen,seen"},
      {"n":"Occult Blood","u":"","t":"select","opts":"negative,positive"},
      {"n":"Pus Cells","u":"/hpf","lo":0,"hi":5}
    ]},
    {"code":"MPS","params":[
      {"n":"Malaria Parasite","u":"","t":"select","opts":"not seen,seen"},
      {"n":"Species","u":"","t":"select","opts":"P. falciparum,P. vivax,P. ovale,P. malariae,mixed,n/a"},
      {"n":"Parasitaemia","u":"/µL","lo":null,"hi":null}
    ]},
    {"code":"HIV","params":[
      {"n":"Determine","u":"","t":"select","opts":"non-reactive,reactive"},
      {"n":"First Response","u":"","t":"select","opts":"non-reactive,reactive"},
      {"n":"Final Interpretation","u":"","t":"select","opts":"negative,positive,indeterminate"}
    ]},
    {"code":"HBSAG","params":[
      {"n":"HBsAg","u":"","t":"select","opts":"non-reactive,reactive"}
    ]},
    {"code":"HCV","params":[
      {"n":"Anti-HCV","u":"","t":"select","opts":"non-reactive,reactive"}
    ]},
    {"code":"VDRL","params":[
      {"n":"VDRL","u":"","t":"select","opts":"non-reactive,reactive"},
      {"n":"Titre","u":"","t":"text"}
    ]},
    {"code":"BHCG","params":[
      {"n":"Beta hCG","u":"mIU/mL","lo":0,"hi":5}
    ]},
    {"code":"UPT","params":[
      {"n":"Urine Pregnancy","u":"","t":"select","opts":"negative,positive"}
    ]},
    {"code":"ESR","params":[
      {"n":"ESR","u":"mm/hr","lo":0,"hi":20,"cl":null,"ch":100}
    ]},
    {"code":"CRP","params":[
      {"n":"CRP","u":"mg/L","lo":0,"hi":10,"cl":null,"ch":100}
    ]},
    {"code":"CULT","params":[
      {"n":"Organism Isolated","u":"","t":"text"},
      {"n":"Colony Count","u":"CFU/mL","t":"text"},
      {"n":"Sensitivity","u":"","t":"text"}
    ]}
  ]$j$::jsonb;
  item JSONB;
  p JSONB;
  ord INTEGER;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(rows) LOOP
    SELECT id INTO v_test_id FROM public.lab_tests_catalog
      WHERE code = (item->>'code') LIMIT 1;
    IF v_test_id IS NULL THEN CONTINUE; END IF;
    ord := 0;
    FOR p IN SELECT * FROM jsonb_array_elements(item->'params') LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.lab_result_templates
         WHERE test_id = v_test_id AND parameter_name = (p->>'n')
      ) THEN
        INSERT INTO public.lab_result_templates
          (test_id, parameter_name, units, reference_low, reference_high, critical_low, critical_high,
           input_type, select_options, display_order)
        VALUES (
          v_test_id,
          p->>'n',
          NULLIF(p->>'u',''),
          NULLIF(p->>'lo','')::numeric,
          NULLIF(p->>'hi','')::numeric,
          NULLIF(p->>'cl','')::numeric,
          NULLIF(p->>'ch','')::numeric,
          COALESCE(p->>'t','numeric'),
          NULLIF(p->>'opts',''),
          ord
        );
      END IF;
      ord := ord + 1;
    END LOOP;
  END LOOP;
END $seed$;
