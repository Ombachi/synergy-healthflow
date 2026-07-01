
CREATE OR REPLACE FUNCTION public.verify_prescription(rx_id UUID)
RETURNS TABLE(exists_flag BOOLEAN, signed BOOLEAN, signer_name TEXT, signer_role TEXT, signed_at TIMESTAMPTZ, hash_prefix TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT
    EXISTS(SELECT 1 FROM prescriptions WHERE id = rx_id) AS exists_flag,
    (s.id IS NOT NULL) AS signed,
    s.signer_name,
    s.signer_role,
    s.signed_at,
    LEFT(COALESCE(s.signature_hash,''), 24) AS hash_prefix
  FROM (SELECT 1) x
  LEFT JOIN signatures s ON s.entity_type='prescription' AND s.entity_id = rx_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.verify_prescription(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.verify_prescription(UUID) TO anon, authenticated;
