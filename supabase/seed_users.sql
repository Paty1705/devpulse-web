-- SCRIPT PARA CREAR 5 USUARIOS DE PRUEBA EN SUPABASE
-- Ejecuta esto en tu editor SQL de Supabase (SQL Editor)

DO $$
DECLARE
  uid1 UUID := gen_random_uuid();
  uid2 UUID := gen_random_uuid();
  uid3 UUID := gen_random_uuid();
  uid4 UUID := gen_random_uuid();
  uid5 UUID := gen_random_uuid();
BEGIN
  -- 1. Insertamos en auth.users (Autenticación del sistema)
  -- La contraseña para TODOS será: 123456
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  VALUES 
    (uid1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jefa.tecnica@devpulse.com', extensions.crypt('123456', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
    (uid2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'front.senior@devpulse.com', extensions.crypt('123456', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
    (uid3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'back.senior@devpulse.com', extensions.crypt('123456', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
    (uid4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'qa.tester@devpulse.com', extensions.crypt('123456', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', ''),
    (uid5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dev.junior@devpulse.com', extensions.crypt('123456', extensions.gen_salt('bf')), NOW(), '{"provider":"email","providers":["email"]}', '{}', NOW(), NOW(), '', '', '', '');

  -- 2. Insertamos/Actualizamos en public.profiles
  -- Si tienes un trigger que los crea automáticamente, esto simplemente actualizará sus roles para que puedas probar todas las funciones.
  INSERT INTO public.profiles (id, email, role)
  VALUES
    (uid1, 'jefa.tecnica@devpulse.com', 'jefe'),
    (uid2, 'front.senior@devpulse.com', 'developer'),
    (uid3, 'back.senior@devpulse.com', 'developer'),
    (uid4, 'qa.tester@devpulse.com', 'qa'),
    (uid5, 'dev.junior@devpulse.com', 'developer')
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
  
END $$;
