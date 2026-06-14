
-- Phase 3: Inventory deepening
CREATE TABLE public.item_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES public.item_categories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read item_categories" ON public.item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "store write item_categories" ON public.item_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  payment_terms TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read suppliers" ON public.suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write suppliers" ON public.suppliers FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.stock_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'main_store',
  in_charge_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_locations TO authenticated;
GRANT ALL ON public.stock_locations TO service_role;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stock_locations" ON public.stock_locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write stock_locations" ON public.stock_locations FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  batch_no TEXT,
  expiry_date DATE,
  qty_on_hand NUMERIC NOT NULL DEFAULT 0,
  location_id UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  cost_cents INTEGER NOT NULL DEFAULT 0,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_batches TO authenticated;
GRANT ALL ON public.stock_batches TO service_role;
ALTER TABLE public.stock_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stock_batches" ON public.stock_batches FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write stock_batches" ON public.stock_batches FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist'));

CREATE TABLE public.stock_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department TEXT,
  location_id UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_requests TO authenticated;
GRANT ALL ON public.stock_requests TO service_role;
ALTER TABLE public.stock_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read stock_requests" ON public.stock_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write stock_requests" ON public.stock_requests FOR ALL TO authenticated
  USING (requester_id = auth.uid() OR has_role(auth.uid(),'admin'))
  WITH CHECK (requester_id = auth.uid() OR has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_stock_requests_updated BEFORE UPDATE ON public.stock_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.stock_request_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.stock_requests(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty_requested NUMERIC NOT NULL,
  qty_approved NUMERIC,
  qty_issued NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_request_items TO authenticated;
GRANT ALL ON public.stock_request_items TO service_role;
ALTER TABLE public.stock_request_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all stock_request_items" ON public.stock_request_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expected_at DATE,
  notes TEXT,
  total_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read po" ON public.purchase_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write po" ON public.purchase_orders FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_po_updated BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  qty NUMERIC NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  qty_received NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all po_items" ON public.purchase_order_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.goods_received_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_received_notes TO authenticated;
GRANT ALL ON public.goods_received_notes TO service_role;
ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read grn" ON public.goods_received_notes FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write grn" ON public.goods_received_notes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist'))
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist'));

CREATE TABLE public.grn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  batch_no TEXT,
  expiry_date DATE,
  qty NUMERIC NOT NULL,
  unit_cost_cents INTEGER NOT NULL DEFAULT 0,
  location_id UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_items TO authenticated;
GRANT ALL ON public.grn_items TO service_role;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all grn_items" ON public.grn_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.inventory_items(id) ON DELETE RESTRICT,
  batch_id UUID REFERENCES public.stock_batches(id) ON DELETE SET NULL,
  location_from UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  location_to UUID REFERENCES public.stock_locations(id) ON DELETE SET NULL,
  qty NUMERIC NOT NULL,
  kind TEXT NOT NULL,
  ref_table TEXT,
  ref_id UUID,
  notes TEXT,
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read movements" ON public.stock_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "staff write movements" ON public.stock_movements FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'pharmacist'));

CREATE TABLE public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.stock_batches(id) ON DELETE CASCADE,
  qty_delta NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_adjustments TO authenticated;
GRANT ALL ON public.inventory_adjustments TO service_role;
ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read adj" ON public.inventory_adjustments FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write adj" ON public.inventory_adjustments FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TABLE public.writeoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.stock_batches(id) ON DELETE CASCADE,
  qty NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.writeoffs TO authenticated;
GRANT ALL ON public.writeoffs TO service_role;
ALTER TABLE public.writeoffs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read writeoffs" ON public.writeoffs FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin write writeoffs" ON public.writeoffs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Trigger: GRN creates stock_batches + movements + updates inventory_items.quantity
CREATE OR REPLACE FUNCTION public.on_grn_item_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_batch UUID;
BEGIN
  INSERT INTO stock_batches(item_id, batch_no, expiry_date, qty_on_hand, location_id, cost_cents)
  VALUES (NEW.item_id, NEW.batch_no, NEW.expiry_date, NEW.qty, NEW.location_id, NEW.unit_cost_cents)
  RETURNING id INTO v_batch;
  INSERT INTO stock_movements(item_id, batch_id, location_to, qty, kind, ref_table, ref_id, performed_by)
  VALUES (NEW.item_id, v_batch, NEW.location_id, NEW.qty, 'receipt', 'grn_items', NEW.id, auth.uid());
  UPDATE inventory_items SET quantity = quantity + NEW.qty WHERE id = NEW.item_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_grn_item_insert AFTER INSERT ON public.grn_items
  FOR EACH ROW EXECUTE FUNCTION public.on_grn_item_insert();

-- Trigger: pharmacy dispense consumes FEFO stock
CREATE OR REPLACE FUNCTION public.consume_stock_on_dispense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_item UUID; v_remaining NUMERIC; v_batch RECORD; v_take NUMERIC;
BEGIN
  SELECT id INTO v_item FROM inventory_items WHERE name ILIKE (SELECT medication FROM prescriptions WHERE id = NEW.prescription_id) LIMIT 1;
  IF v_item IS NULL THEN RETURN NEW; END IF;
  v_remaining := COALESCE(NEW.quantity, 1);
  FOR v_batch IN SELECT * FROM stock_batches WHERE item_id = v_item AND qty_on_hand > 0 ORDER BY expiry_date NULLS LAST, created_at LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_batch.qty_on_hand);
    UPDATE stock_batches SET qty_on_hand = qty_on_hand - v_take WHERE id = v_batch.id;
    INSERT INTO stock_movements(item_id, batch_id, qty, kind, ref_table, ref_id, performed_by)
    VALUES (v_item, v_batch.id, v_take, 'consumption', 'pharmacy_dispenses', NEW.id, auth.uid());
    v_remaining := v_remaining - v_take;
  END LOOP;
  UPDATE inventory_items SET quantity = GREATEST(0, quantity - COALESCE(NEW.quantity,1)) WHERE id = v_item;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_dispense_consume AFTER INSERT ON public.pharmacy_dispenses
  FOR EACH ROW EXECUTE FUNCTION public.consume_stock_on_dispense();

-- Low stock notification
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.quantity <= NEW.reorder_threshold AND (OLD.quantity > OLD.reorder_threshold OR OLD.quantity IS NULL) THEN
    PERFORM notify_role('admin','low_stock','Low stock alert',
      NEW.name||' is at '||NEW.quantity||' (reorder at '||NEW.reorder_threshold||')',
      '/store','inventory_item', NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_low_stock AFTER UPDATE OF quantity ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.notify_low_stock();
