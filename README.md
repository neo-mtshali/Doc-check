# Doc-check

## Shared case database

The app runs in its original browser-only mode when Supabase environment variables are absent. To test authenticated shared cases locally:

1. Create a development Supabase project.
2. Apply the migration documented in [`supabase/README.md`](supabase/README.md).
3. Copy `.env.example` to `.env.local` and add the development project URL and publishable key.
4. Run `npm run dev`.

Do not add a Supabase service-role key to this project or to any `VITE_` environment variable.

Approved external tracers see and edit only their cases. Approved internal users have a read-only all-case dashboard. Administrators approve accounts, manage case ownership, restore archived cases, inspect activity, and edit all case and Presenter data.
