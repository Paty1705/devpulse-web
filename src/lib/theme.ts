// Lógica compartida del tema: presets de color, valores por defecto y cómo
// se traducen las preferencias a atributos y variables CSS en <html>.
//
// La usan PreferencesProvider (en cada cambio) y el <script> de layout.tsx
// (antes de hidratar, para que no haya destello). Por eso themeInitScript
// es JS plano generado a partir de los mismos datos.

export type Theme = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type Surface = 'vidrio' | 'solido';
export type Mascot = 'gato' | 'perro' | 'robot';
export type AccentPreset = 'glaciar' | 'neon' | 'magenta' | 'azul' | 'indigo' | 'mint' | 'amber' | 'custom';

export interface Preferences {
  theme: Theme;
  density: Density;
  surface: Surface;
  accent: AccentPreset;
  /** Solo se usan cuando accent === 'custom'. Formato #RRGGBB. */
  accentColor: string;
  accent2Color: string;
  /** Desenfoque del vidrio en px (0 = sin desenfoque, más ligero). */
  glassBlur: number;
  /** Intensidad del borde iridiscente, de 0 a 1. */
  iridescence: number;
  mascot: Mascot;
}

export const ACCENT_PRESETS: Record<Exclude<AccentPreset, 'custom'>, { label: string; a: string; b: string }> = {
  glaciar: { label: 'Glaciar', a: '#4F46E5', b: '#06B6D4' },
  neon: { label: 'Neón', a: '#11DBDC', b: '#D15EEE' },
  magenta: { label: 'Orquídea', a: '#D15EEE', b: '#11DBDC' },
  azul: { label: 'Azul', a: '#2983D0', b: '#515ADA' },
  indigo: { label: 'Índigo', a: '#515ADA', b: '#6942D7' },
  mint: { label: 'Menta', a: '#3E9B94', b: '#88C9C4' },
  amber: { label: 'Ámbar', a: '#F59E0B', b: '#D97706' },
};

export const MASCOTS: { id: Mascot; label: string }[] = [
  { id: 'gato', label: 'Gato' },
  { id: 'perro', label: 'Perro' },
  { id: 'robot', label: 'Robot' },
];

export const defaultPreferences: Preferences = {
  theme: 'system',
  density: 'comfortable',
  surface: 'vidrio',
  accent: 'glaciar',
  accentColor: '#4F46E5',
  accent2Color: '#06B6D4',
  glassBlur: 22,
  iridescence: 0.8,
  mascot: 'gato',
};

export const PREFERENCES_STORAGE_KEY = 'devpulse_preferences';

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Mezcla lo guardado con los valores por defecto y descarta valores inválidos. */
export function normalizePreferences(raw: unknown): Preferences {
  const p = { ...defaultPreferences, ...(raw && typeof raw === 'object' ? raw : {}) } as Preferences;
  if (!['light', 'dark', 'system'].includes(p.theme)) p.theme = defaultPreferences.theme;
  if (!['comfortable', 'compact'].includes(p.density)) p.density = defaultPreferences.density;
  if (!['vidrio', 'solido'].includes(p.surface)) p.surface = defaultPreferences.surface;
  if (p.accent !== 'custom' && !(p.accent in ACCENT_PRESETS)) p.accent = defaultPreferences.accent;
  if (!HEX.test(p.accentColor)) p.accentColor = defaultPreferences.accentColor;
  if (!HEX.test(p.accent2Color)) p.accent2Color = defaultPreferences.accent2Color;
  p.glassBlur = clamp(Number(p.glassBlur), 0, 40, defaultPreferences.glassBlur);
  p.iridescence = clamp(Number(p.iridescence), 0, 1, defaultPreferences.iridescence);
  if (!MASCOTS.some((m) => m.id === p.mascot)) p.mascot = defaultPreferences.mascot;
  return p;
}

function clamp(n: number, min: number, max: number, fallback: number) {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function resolveAccents(p: Preferences): { a: string; b: string } {
  if (p.accent === 'custom') return { a: p.accentColor, b: p.accent2Color };
  return ACCENT_PRESETS[p.accent];
}

/** Texto legible (blanco o casi negro) sobre un color de fondo. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Elige el que dé más contraste contra el color.
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#0B1020' : '#FFFFFF';
}

/** Aplica las preferencias a <html>. Debe mantenerse equivalente a themeInitScript. */
export function applyPreferencesToDOM(p: Preferences) {
  const root = document.documentElement;
  const isDark = p.theme === 'system'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : p.theme === 'dark';
  root.classList.toggle('dark', isDark);
  root.setAttribute('data-accent', p.accent);
  root.setAttribute('data-density', p.density);
  root.setAttribute('data-surface', p.surface);
  root.setAttribute('data-mascot', p.mascot);

  const { a, b } = resolveAccents(p);
  root.style.setProperty('--accent', a);
  root.style.setProperty('--accent-2', b);
  root.style.setProperty('--accent-contrast', contrastText(a));
  root.style.setProperty('--glass-blur', `${p.glassBlur}px`);
  root.style.setProperty('--iridescence', String(p.iridescence));
}

/**
 * Versión en JS plano de normalizePreferences + applyPreferencesToDOM para
 * el <script> que corre antes de hidratar. Lee localStorage; si falla, deja
 * los valores por defecto.
 */
export const themeInitScript = `(function(){try{
var D=${JSON.stringify(defaultPreferences)};
var P=${JSON.stringify(ACCENT_PRESETS)};
var p=D;var s=localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)});
try{if(s){var o=JSON.parse(s);if(o&&typeof o==='object'){p=Object.assign({},D,o);}}}catch(_){}
var r=document.documentElement;
var dark=p.theme==='system'?window.matchMedia('(prefers-color-scheme: dark)').matches:p.theme==='dark';
r.classList.toggle('dark',dark);
var acc=(p.accent==='custom'||P[p.accent])?p.accent:D.accent;
r.setAttribute('data-accent',acc);
r.setAttribute('data-density',p.density==='compact'?'compact':'comfortable');
r.setAttribute('data-surface',p.surface==='solido'?'solido':'vidrio');
r.setAttribute('data-mascot',p.mascot||D.mascot);
var hex=/^#[0-9a-fA-F]{6}$/;
var a=acc==='custom'?(hex.test(p.accentColor)?p.accentColor:D.accentColor):P[acc].a;
var b=acc==='custom'?(hex.test(p.accent2Color)?p.accent2Color:D.accent2Color):P[acc].b;
var n=parseInt(a.slice(1),16);function l(c){c/=255;return c<=0.03928?c/12.92:Math.pow((c+0.055)/1.055,2.4);}
var L=0.2126*l((n>>16)&255)+0.7152*l((n>>8)&255)+0.0722*l(n&255);
r.style.setProperty('--accent',a);r.style.setProperty('--accent-2',b);
r.style.setProperty('--accent-contrast',(L+0.05)/0.05>1.05/(L+0.05)?'#0B1020':'#FFFFFF');
var bl=Number(p.glassBlur);r.style.setProperty('--glass-blur',(isFinite(bl)?Math.min(40,Math.max(0,bl)):D.glassBlur)+'px');
var ir=Number(p.iridescence);r.style.setProperty('--iridescence',String(isFinite(ir)?Math.min(1,Math.max(0,ir)):D.iridescence));
}catch(_){}})();`;
