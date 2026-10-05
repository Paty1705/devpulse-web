# DevPulse Web

DevPulse Web es una plataforma integral de gestión de proyectos, auditoría técnica y seguimiento Kanban, diseñada con una arquitectura Neo-Cyber y Glassmorphism para equipos de desarrollo modernos.

## Características Principales

*   **Autenticación Híbrida**: Soporte para OAuth (Google, GitHub) y Email/Password gestionado por Supabase Auth.
*   **Gestión Basada en Roles**: Vistas dinámicas y permisos basados en roles de usuario (`jefe`, `developer`, `qa`).
*   **Gobernanza de Proyectos**: Panel de Jefatura para crear proyectos, asignar repositorios, definir modalidades y formar equipos.
*   **Generador de Tareas IA**: Herramienta integrada para parsear requisitos en bruto y estructurar tareas técnicas automáticamente.
*   **Tablero Kanban Técnico**: Gestión de backlog, estados (Por Hacer, En Progreso, Code Review, Terminado) y prioridades.
*   **Personalización Extrema**: Motor de temas dinámicos (Light/Dark/System) y 6 colores de acento neón, guardados globalmente en la base de datos de cada perfil.
*   **Sistema de Notificaciones en Tiempo Real**: Alertas instantáneas y *dropdown* animado usando WebSockets (Supabase Realtime) y Postgres Triggers.

## Tecnologías Utilizadas

*   **Frontend**: Next.js 16 (App Router), React 19, Tailwind CSS 4, Lucide React (Íconos).
*   **Backend & Base de Datos**: Supabase (PostgreSQL, Auth, Realtime, Triggers, RLS).
*   **Arquitectura CSS**: Variables CSS semánticas inyectadas en tiempo real para temas y colores de acento.

## Configuración y Despliegue

1.  **Clonar y configurar**: Instalar dependencias con `npm install`.
2.  **Variables de Entorno**: Copia `.env.local.example` a `.env.local` y completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (y `GEMINI_API_KEY` si quieres usar el Asistente IA, y `GITHUB_TOKEN` si quieres que la app cree ramas automáticamente y siga el estado de los Pull Requests).
3.  **Base de Datos**: Ejecuta los scripts SQL en `supabase/` (en orden: `setup_notifications.sql`, `fix_notifications.sql`, `alter_tasks.sql`, `supabase_preferences.sql`, `create_audits.sql`, `apply_audit_result.sql`, `create_personal_events.sql`, `seed_users.sql`) en el SQL Editor de tu proyecto Supabase.
4.  **Iniciar Servidor**: `npm run dev`.

## Nota — Fase de pruebas

Este repositorio es una recreación fiel del proyecto en su estado actual de **fase de pruebas**: incluye datos y flujos mock (como el login con usuarios semilla) y algunos módulos (Kanban conectado a Supabase en tiempo real, sistema de Auditorías) todavía no están completamente implementados/conectados — ver `AGENTS.md`/notas del equipo para el estado exacto de cada pieza.
