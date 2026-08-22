-- Stage 1a: make database roles the only authorization source.

CREATE TABLE IF NOT EXISTS public.user_roles (
    user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('admin', 'operator', 'hotel')),
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT r.role
    FROM public.user_roles AS r
    WHERE r.user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.current_app_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;

CREATE OR REPLACE FUNCTION app_private.set_user_role_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    NEW.updated_by := auth.uid();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.prevent_last_admin_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.role = 'admin'
       AND (TG_OP = 'DELETE' OR NEW.role IS DISTINCT FROM 'admin')
       AND (SELECT count(*) FROM public.user_roles WHERE role = 'admin') = 1 THEN
        RAISE EXCEPTION 'Cannot remove or demote the last administrator';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Every Auth signup begins as a hotel account. An administrator can later
-- promote the row through the protected user_roles table.
CREATE OR REPLACE FUNCTION app_private.assign_default_app_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'hotel');
    RETURN NEW;
EXCEPTION
    WHEN unique_violation THEN
        RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_roles_set_audit_fields ON public.user_roles;
CREATE TRIGGER user_roles_set_audit_fields
    BEFORE INSERT OR UPDATE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION app_private.set_user_role_audit_fields();

DROP TRIGGER IF EXISTS user_roles_protect_last_admin ON public.user_roles;
CREATE TRIGGER user_roles_protect_last_admin
    BEFORE UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION app_private.prevent_last_admin_removal();

DROP TRIGGER IF EXISTS auth_users_assign_default_app_role ON auth.users;
CREATE TRIGGER auth_users_assign_default_app_role
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION app_private.assign_default_app_role();

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, u.raw_user_meta_data ->> 'role'
FROM auth.users AS u
WHERE u.raw_user_meta_data ->> 'role' IN ('admin', 'operator', 'hotel')
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role,
    updated_at = now();

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
DROP POLICY IF EXISTS user_roles_update ON public.user_roles;
DROP POLICY IF EXISTS user_roles_delete ON public.user_roles;

CREATE POLICY user_roles_select
    ON public.user_roles FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.current_app_role() = 'admin');

CREATE POLICY user_roles_insert
    ON public.user_roles FOR INSERT TO authenticated
    WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY user_roles_update
    ON public.user_roles FOR UPDATE TO authenticated
    USING (public.current_app_role() = 'admin')
    WITH CHECK (public.current_app_role() = 'admin');

CREATE POLICY user_roles_delete
    ON public.user_roles FOR DELETE TO authenticated
    USING (public.current_app_role() = 'admin');
