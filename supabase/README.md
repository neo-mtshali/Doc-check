# Supabase setup

1. Create a development Supabase project.
2. Apply `migrations/202607280001_shared_case_platform.sql` in the SQL editor or with the Supabase CLI.
3. Add the project URL and publishable key to `.env.local` using `.env.example`.
4. Register the first account through the app, then bootstrap it in the SQL editor:

```sql
update public.profiles
set role = 'admin',
    account_status = 'approved',
    approved_at = now(),
    approved_by = user_id
where email = 'YOUR_ADMIN_EMAIL';
```

5. Add the local and production URLs to Supabase Authentication URL configuration.

The service-role key is not used by the browser application. Never add it to a `VITE_` environment variable.
