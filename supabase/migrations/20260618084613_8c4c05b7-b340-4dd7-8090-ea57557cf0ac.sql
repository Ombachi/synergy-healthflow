
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
BEGIN
  INSERT INTO public.profiles (id, full_name, onboarded, onboarded_as)
  VALUES (NEW.id, v_name, true, 'patient')
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    onboarded = true;

  -- Default every new auth signup to the patient role; admins reassign later.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'patient')
  ON CONFLICT DO NOTHING;

  -- Create a minimal patient record so they show up in patient lookups.
  INSERT INTO public.patients (user_id, full_name, email, created_by)
  VALUES (NEW.id, v_name, NEW.email, NEW.id)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;
