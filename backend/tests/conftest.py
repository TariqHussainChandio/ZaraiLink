import os

# `app.core.config.settings` refuses empty Supabase settings at import time, and CI has no backend/.env. Unit tests
# never reach Supabase (they mock the repository layer), so they only need the settings to be present. When a local
# stack is configured (LOCAL_SUPABASE_*), those values are used, exactly as the real-stack tests set them; otherwise
# placeholders, and the real-stack tests skip themselves. Set here, before any test module imports the app.
for _name, _local, _placeholder in (
    ("SUPABASE_URL", "LOCAL_SUPABASE_URL", "http://127.0.0.1:54321"),
    ("SUPABASE_ANON_KEY", "LOCAL_SUPABASE_ANON_KEY", "placeholder"),
    ("SUPABASE_SERVICE_ROLE_KEY", "LOCAL_SUPABASE_SERVICE_ROLE_KEY", "placeholder"),
):
    os.environ.setdefault(_name, os.environ.get(_local) or _placeholder)
