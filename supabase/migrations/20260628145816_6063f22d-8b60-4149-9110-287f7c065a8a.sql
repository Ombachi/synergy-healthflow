
-- ============ 1. INTERNAL REQUESTS ============
DO $$ BEGIN
  CREATE TYPE public.internal_request_category AS ENUM ('equipment','it_support','hr','procurement','maintenance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.internal_request_status AS ENUM ('submitted','in_review','clarification','approved','rejected','fulfilled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.internal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category public.internal_request_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  status public.internal_request_status NOT NULL DEFAULT 'submitted',
  assignee_id UUID REFERENCES auth.users(id),
  decision_notes TEXT,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_requests TO authenticated;
GRANT ALL ON public.internal_requests TO service_role;
ALTER TABLE public.internal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "req_select" ON public.internal_requests FOR SELECT TO authenticated
USING (
  requester_id = auth.uid()
  OR assignee_id = auth.uid()
  OR public.has_role(auth.uid(),'admin')
  OR (category='hr' AND public.is_hr_staff())
  OR (category='procurement' AND public.has_role(auth.uid(),'procurement'))
  OR (category='it_support' AND public.has_role(auth.uid(),'admin'))
  OR (category IN ('equipment','maintenance') AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'procurement')))
);
CREATE POLICY "req_insert" ON public.internal_requests FOR INSERT TO authenticated
WITH CHECK (requester_id = auth.uid());
CREATE POLICY "req_update" ON public.internal_requests FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR assignee_id = auth.uid()
  OR (category='hr' AND public.is_hr_staff())
  OR (category='procurement' AND public.has_role(auth.uid(),'procurement'))
  OR (requester_id = auth.uid() AND status IN ('submitted','clarification'))
);

CREATE TRIGGER trg_ireq_updated BEFORE UPDATE ON public.internal_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- notify approvers on new request
CREATE OR REPLACE FUNCTION public.notify_internal_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_role app_role;
BEGIN
  v_role := CASE NEW.category
    WHEN 'hr' THEN 'hr_officer'::app_role
    WHEN 'procurement' THEN 'procurement'::app_role
    WHEN 'it_support' THEN 'admin'::app_role
    ELSE 'admin'::app_role
  END;
  PERFORM public.notify_role(v_role,'internal_request','New '||NEW.category||' request',NEW.title,'/requests','internal_request',NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ireq_notify AFTER INSERT ON public.internal_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_internal_request();

-- ============ 2. ATTENDANCE: clock in/out ============
-- existing attendance table; add columns if missing
ALTER TABLE public.attendance
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS clock_in TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clock_out TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

DROP POLICY IF EXISTS "att_self" ON public.attendance;
DROP POLICY IF EXISTS "att_hr" ON public.attendance;
CREATE POLICY "att_self" ON public.attendance FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "att_hr" ON public.attendance FOR SELECT TO authenticated
USING (public.is_hr_staff() OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'dept_manager'));

-- ============ 3. LEAVE: add clarification status & comments ============
ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS approver_comment TEXT,
  ADD COLUMN IF NOT EXISTS decided_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- ============ 4. TENDERS / BIDS ============
DO $$ BEGIN
  CREATE TYPE public.tender_status AS ENUM ('draft','open','closed','awarded','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.bid_status AS ENUM ('submitted','shortlisted','rejected','awarded','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.tenders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT UNIQUE NOT NULL DEFAULT ('TND-'||to_char(now(),'YYYYMMDD-HH24MISS')),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  status public.tender_status NOT NULL DEFAULT 'open',
  budget_cents INTEGER,
  opens_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closes_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  awarded_bid_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenders TO authenticated;
GRANT SELECT ON public.tenders TO anon;
GRANT ALL ON public.tenders TO service_role;
ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenders_read_open" ON public.tenders FOR SELECT TO anon, authenticated
USING (status IN ('open','closed','awarded') OR public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "tenders_write" ON public.tenders FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'))
WITH CHECK (public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.tender_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id UUID NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bidder_name TEXT NOT NULL,
  bidder_email TEXT,
  bidder_phone TEXT,
  amount_cents INTEGER NOT NULL,
  delivery_days INTEGER,
  proposal TEXT,
  attachment_url TEXT,
  status public.bid_status NOT NULL DEFAULT 'submitted',
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tender_bids TO authenticated;
GRANT ALL ON public.tender_bids TO service_role;
ALTER TABLE public.tender_bids ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bids_own_select" ON public.tender_bids FOR SELECT TO authenticated
USING (bidder_id = auth.uid() OR public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "bids_insert" ON public.tender_bids FOR INSERT TO authenticated
WITH CHECK (bidder_id = auth.uid());
CREATE POLICY "bids_update_own" ON public.tender_bids FOR UPDATE TO authenticated
USING (
  (bidder_id = auth.uid() AND status = 'submitted')
  OR public.has_role(auth.uid(),'procurement') OR public.has_role(auth.uid(),'admin')
);

CREATE TRIGGER trg_tender_upd BEFORE UPDATE ON public.tenders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bid_upd BEFORE UPDATE ON public.tender_bids FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.notify_new_bid()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.notify_role('procurement','tender_bid','New bid submitted',
    NEW.bidder_name||' bid KES '||(NEW.amount_cents/100),'/tenders','tender_bid',NEW.id);
  RETURN NEW;
END $$;
CREATE TRIGGER trg_bid_notify AFTER INSERT ON public.tender_bids FOR EACH ROW EXECUTE FUNCTION public.notify_new_bid();

-- ============ 5. ANNOUNCEMENTS + NOTIFICATION PREFERENCES ============
CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'all',
  audience_role app_role,
  pinned BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.announcements TO authenticated;
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ann_read" ON public.announcements FOR SELECT TO authenticated
USING (
  audience = 'all'
  OR (audience_role IS NOT NULL AND public.has_role(auth.uid(), audience_role))
  OR public.has_role(auth.uid(),'admin')
);
CREATE POLICY "ann_write" ON public.announcements FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.is_hr_staff())
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.is_hr_staff());

CREATE TRIGGER trg_ann_upd BEFORE UPDATE ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- broadcast to notifications
CREATE OR REPLACE FUNCTION public.broadcast_announcement()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.audience = 'all' THEN
    INSERT INTO public.notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    SELECT p.id,'announcement',NEW.title,LEFT(NEW.body,180),'/announcements','announcement',NEW.id FROM public.profiles p;
  ELSIF NEW.audience_role IS NOT NULL THEN
    INSERT INTO public.notifications(recipient_id,type,title,body,link,entity_type,entity_id)
    SELECT ur.user_id,'announcement',NEW.title,LEFT(NEW.body,180),'/announcements','announcement',NEW.id
    FROM public.user_roles ur WHERE ur.role = NEW.audience_role;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_ann_broadcast AFTER INSERT ON public.announcements FOR EACH ROW EXECUTE FUNCTION public.broadcast_announcement();

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled BOOLEAN NOT NULL DEFAULT true,
  sms_enabled BOOLEAN NOT NULL DEFAULT false,
  email_address TEXT,
  phone_number TEXT,
  mute_categories TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_preferences TO authenticated;
GRANT ALL ON public.notification_preferences TO service_role;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "np_self" ON public.notification_preferences FOR ALL TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_np_upd BEFORE UPDATE ON public.notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
