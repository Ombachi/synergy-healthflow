
-- grn_items
DROP POLICY IF EXISTS "auth all grn_items" ON public.grn_items;
CREATE POLICY grn_items_staff ON public.grn_items FOR ALL
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'store_keeper') OR has_role(auth.uid(),'procurement'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'store_keeper') OR has_role(auth.uid(),'procurement'));

-- purchase_order_items
DROP POLICY IF EXISTS "auth all po_items" ON public.purchase_order_items;
CREATE POLICY po_items_staff ON public.purchase_order_items FOR ALL
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'procurement') OR has_role(auth.uid(),'store_keeper'))
WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'procurement') OR has_role(auth.uid(),'store_keeper'));

-- stock_request_items
DROP POLICY IF EXISTS "auth all stock_request_items" ON public.stock_request_items;
CREATE POLICY stock_request_items_staff ON public.stock_request_items FOR ALL
USING (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'store_keeper')
  OR has_role(auth.uid(),'procurement') OR has_role(auth.uid(),'pharmacist')
  OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
)
WITH CHECK (
  has_role(auth.uid(),'admin') OR has_role(auth.uid(),'store_keeper')
  OR has_role(auth.uid(),'procurement') OR has_role(auth.uid(),'pharmacist')
  OR has_role(auth.uid(),'nurse') OR has_role(auth.uid(),'lab_tech')
  OR has_role(auth.uid(),'radiologist')
);

-- Remove bootstrap admin escalation
DROP POLICY IF EXISTS "Bootstrap: first user claims role" ON public.user_roles;
