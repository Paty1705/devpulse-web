'use client';

import type { ReactNode } from 'react';
import { X, Moon, Sun, Monitor, Palette, Maximize, Minimize, Check, Layers, Square, Sparkles, PawPrint } from 'lucide-react';
import { usePreferences } from '@/components/providers/PreferencesProvider';
import { Mascot } from '@/components/mascot/Mascot';
import { ACCENT_PRESETS, MASCOTS, resolveAccents, type AccentPreset } from '@/lib/theme';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

const optionClass = (active: boolean) =>
  `p-3 rounded-[10px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${
    active
      ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]'
      : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'
  }`;

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <span className="text-[var(--text-secondary)]">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Swatch({ a, b, selected }: { a: string; b: string; selected: boolean }) {
  return (
    <span
      className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm"
      style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}
    >
      {selected && <Check size={15} className="text-white drop-shadow" />}
    </span>
  );
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { preferences, updatePreferences } = usePreferences();

  if (!isOpen) return null;

  const isGlass = preferences.surface === 'vidrio';
  const current = resolveAccents(preferences);
  const presetIds = Object.keys(ACCENT_PRESETS) as Exclude<AccentPreset, 'custom'>[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[16px] shadow-[var(--shadow-hover)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
      >
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <h2 id="settings-title" className="text-xl font-bold text-[var(--text-primary)]">Preferencias de Usuario</h2>
          <button
            onClick={onClose}
            aria-label="Cerrar preferencias"
            className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors active:scale-[0.97]"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 overflow-y-auto">
          <Section icon={<Monitor size={16} />} title="Apariencia Global">
            <div className="grid grid-cols-3 gap-3">
              {([
                ['light', 'Claro', <Sun key="s" size={20} />],
                ['dark', 'Oscuro', <Moon key="m" size={20} />],
                ['system', 'Sistema', <Monitor key="c" size={20} />],
              ] as const).map(([id, label, icon]) => (
                <button key={id} onClick={() => updatePreferences({ theme: id })} aria-pressed={preferences.theme === id} className={optionClass(preferences.theme === id)}>
                  {icon}
                  <span className="text-xs font-bold">{label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<Layers size={16} />} title="Superficie">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => updatePreferences({ surface: 'vidrio' })} aria-pressed={isGlass} className={optionClass(isGlass)}>
                <Sparkles size={20} />
                <span className="text-xs font-bold">Vidrio iridiscente</span>
              </button>
              <button onClick={() => updatePreferences({ surface: 'solido' })} aria-pressed={!isGlass} className={optionClass(!isGlass)}>
                <Square size={20} />
                <span className="text-xs font-bold">Sólida</span>
              </button>
            </div>
          </Section>

          <Section icon={<Palette size={16} />} title="Colores de Acento">
            <div className="grid grid-cols-4 gap-3">
              {presetIds.map((id) => {
                const p = ACCENT_PRESETS[id];
                const selected = preferences.accent === id;
                return (
                  <button
                    key={id}
                    onClick={() => updatePreferences({ accent: id })}
                    aria-pressed={selected}
                    className={`p-2.5 rounded-[10px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${selected ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)]' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
                  >
                    <Swatch a={p.a} b={p.b} selected={selected} />
                    <span className="text-xs font-bold text-[var(--text-primary)]">{p.label}</span>
                  </button>
                );
              })}
              <button
                onClick={() => updatePreferences({ accent: 'custom', accentColor: current.a, accent2Color: current.b })}
                aria-pressed={preferences.accent === 'custom'}
                className={`p-2.5 rounded-[10px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'custom' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)]' : 'border-dashed border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <Swatch a={preferences.accentColor} b={preferences.accent2Color} selected={preferences.accent === 'custom'} />
                <span className="text-xs font-bold text-[var(--text-primary)]">Personal</span>
              </button>
            </div>

            {preferences.accent === 'custom' && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                {([
                  ['accentColor', 'Acento principal'],
                  ['accent2Color', 'Acento secundario'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 p-3 rounded-[10px] border border-[var(--border-card)] bg-[var(--bg-page)] cursor-pointer">
                    <input
                      type="color"
                      value={preferences[key]}
                      onChange={(e) => updatePreferences({ [key]: e.target.value })}
                      className="w-9 h-9 rounded-[8px] border-0 bg-transparent cursor-pointer"
                    />
                    <span className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-primary)]">{label}</span>
                      <span className="text-xs font-mono text-[var(--text-secondary)] uppercase">{preferences[key]}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </Section>

          {isGlass && (
            <Section icon={<Sparkles size={16} />} title="Efecto de Vidrio">
              <div className="space-y-4">
                <label className="block">
                  <span className="flex justify-between text-xs font-bold text-[var(--text-primary)] mb-2">
                    <span>Desenfoque</span>
                    <span className="font-mono text-[var(--text-secondary)]">{preferences.glassBlur}px</span>
                  </span>
                  <input
                    type="range" min={0} max={40} step={1}
                    value={preferences.glassBlur}
                    onChange={(e) => updatePreferences({ glassBlur: Number(e.target.value) })}
                    className="w-full accent-[var(--btn-primary-bg)]"
                  />
                  <span className="block text-[11px] text-[var(--text-secondary)] mt-1">Bájalo si la página se siente lenta en tu computadora.</span>
                </label>
                <label className="block">
                  <span className="flex justify-between text-xs font-bold text-[var(--text-primary)] mb-2">
                    <span>Brillo iridiscente</span>
                    <span className="font-mono text-[var(--text-secondary)]">{Math.round(preferences.iridescence * 100)}%</span>
                  </span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={preferences.iridescence}
                    onChange={(e) => updatePreferences({ iridescence: Number(e.target.value) })}
                    className="w-full accent-[var(--btn-primary-bg)]"
                  />
                </label>
              </div>
            </Section>
          )}

          <Section icon={<PawPrint size={16} />} title="Mascota">
            <div className="grid grid-cols-3 gap-3">
              {MASCOTS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => updatePreferences({ mascot: m.id })}
                  aria-pressed={preferences.mascot === m.id}
                  className={optionClass(preferences.mascot === m.id)}
                >
                  <Mascot kind={m.id} size={64} />
                  <span className="text-xs font-bold">{m.label}</span>
                </button>
              ))}
            </div>
          </Section>

          <Section icon={<Maximize size={16} />} title="Densidad de Interfaz">
            <div className="grid grid-cols-2 gap-3">
              {([
                ['comfortable', 'Cómoda', <Maximize key="x" size={20} />],
                ['compact', 'Compacta', <Minimize key="n" size={20} />],
              ] as const).map(([id, label, icon]) => (
                <button
                  key={id}
                  onClick={() => updatePreferences({ density: id })}
                  aria-pressed={preferences.density === id}
                  className={`p-3 rounded-[10px] border flex items-center gap-3 transition-colors active:scale-[0.97] ${preferences.density === id ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
                >
                  {icon}
                  <span className="text-sm font-bold text-[var(--text-primary)]">{label}</span>
                </button>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
