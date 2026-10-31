/* Configuración pública de Supabase.
   - La "anon key" es PÚBLICA por diseño (la seguridad la da RLS en la base de datos).
   - NUNCA pongas aquí la "service_role key": esa es secreta y daría acceso total. */
window.MZ_SUPABASE = {
  url: 'https://fsgdbrzawkufpgxybpgj.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZzZ2Ricnphd2t1ZnBneHlicGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0MDUxNzcsImV4cCI6MjEwODk4MTE3N30.u9qlRlQl2oX9iNvb7aFiZnDKLHvXnqR7b9H6WP3Ss1I',
};
