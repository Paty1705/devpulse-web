import type { CSSProperties } from 'react';
import type { Mascot as MascotKind } from '@/lib/theme';

// Mascotas dibujadas solo con CSS (sin imágenes) para que tomen los colores
// de acento del usuario (--accent / --accent-2) y pesen casi nada.
// Cada figura se diseñó en un lienzo de 150×170 px y se escala con `size`.

type Part = [left: number, top: number, width: number, height: number, style?: CSSProperties];

const CYAN = '#5EEAD4';
const SCREEN = '#12161F';
const glow = (c: string): CSSProperties => ({ background: c, boxShadow: `0 0 12px ${c}` });
const accentGrad = (deg = 160): CSSProperties => ({ background: `linear-gradient(${deg}deg, var(--accent-2), var(--accent))` });
const relief = (strength = 0.25): CSSProperties => ({
  boxShadow: `inset -3px -4px 8px rgba(0,0,0,${strength}), inset 3px 3px 6px rgba(255,255,255,0.45)`,
});

const CREAM: CSSProperties = { background: 'linear-gradient(160deg, #F7F3EC 0%, #CFC6B5 90%)' };
const WHITE: CSSProperties = { background: 'linear-gradient(160deg, #FFFFFF 0%, #D9DFE8 92%)' };
const STEEL: CSSProperties = { background: 'linear-gradient(160deg, #64708A 0%, #2B3242 85%)' };
const SHADOW = '0 14px 24px rgba(28,34,48,0.26)';

const ROBOT: Part[] = [
  [71, 0, 8, 24, { borderRadius: 4, background: '#475569' }],
  [63, -8, 24, 24, { borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FFFFFF, var(--accent) 70%)', boxShadow: '0 0 18px var(--accent)' }],
  [4, 50, 16, 34, { borderRadius: 8, background: '#3B4457' }],
  [130, 50, 16, 34, { borderRadius: 8, background: '#3B4457' }],
  [14, 20, 122, 96, { borderRadius: 32, ...STEEL, boxShadow: `inset -6px -8px 14px rgba(0,0,0,0.35), inset 6px 6px 10px rgba(255,255,255,0.22), ${SHADOW}` }],
  [30, 38, 90, 58, { borderRadius: 20, background: '#0F1420', boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8)' }],
  [50, 52, 14, 18, { borderRadius: 7, ...glow(CYAN) }],
  [86, 56, 16, 6, { borderRadius: 3, ...glow(CYAN) }],
  [62, 76, 26, 10, { borderBottom: `3px solid ${CYAN}`, borderRadius: '0 0 14px 14px' }],
  [34, 116, 82, 50, { borderRadius: '22px 22px 18px 18px', ...STEEL, boxShadow: 'inset -5px -6px 12px rgba(0,0,0,0.35), inset 5px 4px 8px rgba(255,255,255,0.2)' }],
  [56, 128, 38, 22, { borderRadius: 8, background: '#0F1420' }],
];

const GATO: Part[] = [
  // cola
  [110, 86, 18, 62, { borderRadius: 9, background: 'linear-gradient(90deg, #F1ECE2, #CFC6B5)', transform: 'rotate(18deg)' }],
  [116, 74, 22, 26, { borderRadius: 11, background: 'var(--accent)', transform: 'rotate(18deg)', ...relief() }],
  // cuerpo y patas
  [36, 106, 80, 54, { borderRadius: '30px 30px 24px 24px', ...CREAM, boxShadow: `inset -5px -6px 12px rgba(0,0,0,0.15), inset 4px 4px 8px rgba(255,255,255,0.7), ${SHADOW}` }],
  [92, 122, 26, 26, { borderRadius: '50%', background: 'var(--accent)', ...relief() }],
  [40, 148, 28, 18, { borderRadius: 12, ...CREAM }],
  [72, 148, 28, 18, { borderRadius: 12, ...CREAM }],
  // collar con cascabel
  [44, 102, 64, 10, { borderRadius: 5, background: 'var(--accent)' }],
  [67, 106, 18, 18, { borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, #FDE68A, #B45309 80%)', boxShadow: '0 3px 6px rgba(0,0,0,0.25)' }],
  // orejas
  [20, 4, 38, 42, { ...CREAM, clipPath: 'polygon(30% 0, 100% 100%, 0 100%)' }],
  [28, 16, 22, 26, { background: 'var(--accent)', clipPath: 'polygon(30% 0, 100% 100%, 0 100%)' }],
  [92, 4, 38, 42, { ...CREAM, clipPath: 'polygon(70% 0, 100% 100%, 0 100%)' }],
  [100, 16, 22, 26, { background: 'var(--accent)', clipPath: 'polygon(70% 0, 100% 100%, 0 100%)' }],
  // cabeza, audífono y pantalla
  [14, 24, 122, 88, { borderRadius: 42, ...CREAM, boxShadow: `inset -6px -8px 14px rgba(0,0,0,0.15), inset 6px 6px 10px rgba(255,255,255,0.8), ${SHADOW}` }],
  [128, 52, 16, 32, { borderRadius: 8, background: 'var(--accent)', boxShadow: 'inset -2px -3px 5px rgba(0,0,0,0.25)' }],
  [30, 40, 90, 58, { borderRadius: 22, background: SCREEN, boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8)' }],
  [48, 52, 13, 18, { borderRadius: 7, ...glow(CYAN) }],
  [89, 52, 13, 18, { borderRadius: 7, ...glow(CYAN) }],
  [70, 70, 10, 7, { borderRadius: '50% 50% 60% 60%', background: '#F9A8B8' }],
  [64, 74, 22, 9, { borderBottom: `2.5px solid ${CYAN}`, borderRadius: '0 0 12px 12px' }],
  // bigotes
  [0, 64, 28, 3, { borderRadius: 2, ...glow(CYAN), transform: 'rotate(-8deg)' }],
  [0, 76, 28, 3, { borderRadius: 2, ...glow(CYAN), transform: 'rotate(8deg)' }],
  [104, 80, 28, 3, { borderRadius: 2, ...glow(CYAN), transform: 'rotate(-8deg)' }],
  [104, 90, 28, 3, { borderRadius: 2, ...glow(CYAN), transform: 'rotate(8deg)' }],
];

const PERRO: Part[] = [
  // colita
  [108, 108, 16, 34, { borderRadius: 8, ...accentGrad(), transform: 'rotate(38deg)', ...relief(0.2) }],
  // cuerpo sentado, panza y patitas
  [36, 104, 80, 58, { borderRadius: '34px 34px 26px 26px', ...WHITE, boxShadow: `inset -5px -6px 12px rgba(0,0,0,0.12), inset 4px 4px 8px rgba(255,255,255,0.95), ${SHADOW}` }],
  [58, 118, 36, 30, { borderRadius: 18, background: 'rgba(255,255,255,0.9)' }],
  [40, 148, 30, 18, { borderRadius: 12, ...WHITE }],
  [82, 148, 30, 18, { borderRadius: 12, ...WHITE }],
  [47, 155, 4, 6, { borderRadius: 2, background: 'var(--accent)', opacity: 0.6 }],
  [89, 155, 4, 6, { borderRadius: 2, background: 'var(--accent)', opacity: 0.6 }],
  // collar con placa de hueso
  [44, 100, 64, 10, { borderRadius: 5, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))' }],
  [66, 106, 20, 8, { borderRadius: 4, background: '#F5C451' }],
  [63, 104, 8, 12, { borderRadius: '50%', background: '#F5C451' }],
  [81, 104, 8, 12, { borderRadius: '50%', background: '#F5C451' }],
  // cabeza redonda con brillo
  [16, 12, 118, 98, { borderRadius: 50, ...WHITE, boxShadow: `inset -6px -8px 14px rgba(0,0,0,0.12), inset 6px 6px 10px rgba(255,255,255,0.95), ${SHADOW}` }],
  [50, 18, 34, 9, { borderRadius: 6, background: 'rgba(255,255,255,0.95)' }],
  // orejas caídas
  [2, 24, 34, 62, { borderRadius: '60% 40% 55% 55% / 40% 40% 60% 60%', ...accentGrad(160), transform: 'rotate(16deg)', ...relief() }],
  [114, 24, 34, 62, { borderRadius: '40% 60% 55% 55% / 40% 40% 60% 60%', ...accentGrad(200), transform: 'rotate(-16deg)', ...relief() }],
  // pantalla-cara
  [34, 34, 82, 62, { borderRadius: 28, background: SCREEN, boxShadow: 'inset 0 3px 8px rgba(0,0,0,0.8)' }],
  [47, 46, 18, 21, { borderRadius: '50%', ...glow(CYAN) }],
  [85, 46, 18, 21, { borderRadius: '50%', ...glow(CYAN) }],
  [56, 49, 6, 6, { borderRadius: '50%', background: '#FFFFFF' }],
  [94, 49, 6, 6, { borderRadius: '50%', background: '#FFFFFF' }],
  [39, 72, 13, 7, { borderRadius: '50%', background: '#F9A8B8', opacity: 0.75 }],
  [98, 72, 13, 7, { borderRadius: '50%', background: '#F9A8B8', opacity: 0.75 }],
  [68, 68, 14, 9, { borderRadius: '50% 50% 60% 60%', background: '#E2E8F0' }],
  [62, 75, 13, 7, { borderBottom: `2.5px solid ${CYAN}`, borderRadius: '0 0 8px 8px' }],
  [75, 75, 13, 7, { borderBottom: `2.5px solid ${CYAN}`, borderRadius: '0 0 8px 8px' }],
  [70, 82, 10, 9, { borderRadius: '0 0 6px 6px', background: '#FB7185' }],
];

const FIGURES: Record<MascotKind, Part[]> = { robot: ROBOT, gato: GATO, perro: PERRO };

const BASE_W = 150;
const BASE_H = 170;

type MascotProps = {
  kind: MascotKind;
  /** Alto en px; el ancho se calcula para mantener la proporción. */
  size?: number;
  className?: string;
};

export function Mascot({ kind, size = BASE_H, className }: MascotProps) {
  const scale = size / BASE_H;
  return (
    <div
      aria-hidden="true"
      className={className}
      style={{ width: BASE_W * scale, height: size, position: 'relative', flexShrink: 0 }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, width: BASE_W, height: BASE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {FIGURES[kind].map(([left, top, width, height, style], i) => (
          <div key={i} style={{ position: 'absolute', left, top, width, height, ...style }} />
        ))}
      </div>
    </div>
  );
}
