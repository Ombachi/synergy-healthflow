-- Auto-bill lab order from specific test's catalog price (fallback to flat)
CREATE OR REPLACE FUNCTION public.bill_lab_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name TEXT;
  v_price_cents INTEGER;
BEGIN
  SELECT name, COALESCE((price * 100)::int, 0) INTO v_name, v_price_cents
  FROM lab_tests_catalog WHERE id = NEW.test_id;
  PERFORM add_invoice_line(
    NEW.visit_id, 'lab', 'lab_orders', NEW.id,
    'Lab: ' || COALESCE(v_name, 'order'),
    1,
    COALESCE(NULLIF(v_price_cents, 0), NULLIF(catalog_price('lab'), 0), 500)
  );
  RETURN NEW;
END $$;

-- Update low-stock notification to also alert store_keeper
CREATE OR REPLACE FUNCTION public.notify_low_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.quantity <= NEW.reorder_threshold AND (OLD.quantity > OLD.reorder_threshold OR OLD.quantity IS NULL) THEN
    PERFORM notify_role('store_keeper','low_stock','Low stock alert',
      NEW.name||' is at '||NEW.quantity||' (reorder at '||NEW.reorder_threshold||')',
      '/store','inventory_item', NEW.id);
    PERFORM notify_role('admin','low_stock','Low stock alert',
      NEW.name||' is at '||NEW.quantity||' (reorder at '||NEW.reorder_threshold||')',
      '/store','inventory_item', NEW.id);
  END IF;
  RETURN NEW;
END $$;

-- Grant store_keeper full access to inventory & store-related tables via RLS
CREATE POLICY "store_keeper full inventory_items" ON public.inventory_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full stock_batches" ON public.stock_batches FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full stock_movements" ON public.stock_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full stock_requests" ON public.stock_requests FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full stock_request_items" ON public.stock_request_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full goods_received_notes" ON public.goods_received_notes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full grn_items" ON public.grn_items FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full inventory_adjustments" ON public.inventory_adjustments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));
CREATE POLICY "store_keeper full stock_locations" ON public.stock_locations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'store_keeper')) WITH CHECK (public.has_role(auth.uid(), 'store_keeper'));