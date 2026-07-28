
ALTER TABLE public.visits ADD COLUMN IF NOT EXISTS examination JSONB;

CREATE OR REPLACE FUNCTION public.close_queue_on_visit_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.status IN ('completed','closed') AND (OLD.status IS DISTINCT FROM NEW.status)) THEN
    UPDATE public.visit_queue
       SET served_at = COALESCE(served_at, now())
     WHERE visit_id = NEW.id
       AND served_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_close_queue_on_visit_close ON public.visits;
CREATE TRIGGER trg_close_queue_on_visit_close
AFTER UPDATE OF status ON public.visits
FOR EACH ROW
EXECUTE FUNCTION public.close_queue_on_visit_close();

-- Backfill: any queue entries whose visit is already closed
UPDATE public.visit_queue vq
   SET served_at = COALESCE(vq.served_at, now())
  FROM public.visits v
 WHERE vq.visit_id = v.id
   AND vq.served_at IS NULL
   AND v.status IN ('completed','closed');
