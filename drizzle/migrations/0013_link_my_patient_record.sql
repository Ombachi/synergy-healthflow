CREATE OR REPLACE FUNCTION public.link_my_patient_record()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid(); _email text; _id uuid; _n int;
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  SELECT id INTO _id FROM public.patients WHERE user_id = _uid AND deleted_at IS NULL LIMIT 1;
  IF _id IS NOT NULL THEN RETURN _id; END IF;
  SELECT lower(email) INTO _email FROM auth.users WHERE id = _uid AND email_confirmed_at IS NOT NULL;
  IF _email IS NULL OR _email = '' THEN RETURN NULL; END IF;
  SELECT count(*), min(id::text)::uuid INTO _n, _id FROM public.patients
   WHERE user_id IS NULL AND deleted_at IS NULL AND lower(trim(email)) = _email;
  IF _n <> 1 THEN RETURN NULL; END IF;
  UPDATE public.patients SET user_id = _uid, updated_at = now() WHERE id = _id AND user_id IS NULL;
  RETURN _id;
END $$;
REVOKE EXECUTE ON FUNCTION public.link_my_patient_record() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.link_my_patient_record() TO authenticated;