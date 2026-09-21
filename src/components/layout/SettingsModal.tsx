'use client';

import { X, Moon, Sun, Monitor, Palette, Maximize, Minimize, Check } from 'lucide-react';
import { usePreferences } from '@/components/providers/PreferencesProvider';

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { preferences, updatePreferences } = usePreferences();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in-up">
      <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-[12px] shadow-[var(--shadow-hover)] w-full max-w-md overflow-hidden">
        
        <div className="px-6 py-5 flex justify-between items-center bg-[var(--bg-column)] border-b border-[var(--border-column)]">
          <h2 className="text-xl font-bold text-[var(--text-primary)]">Preferencias de Usuario</h2>
          <button onClick={onClose} className="p-2 hover:bg-[var(--bg-card-hover)] rounded-[6px] text-[var(--text-secondary)] transition-colors active:scale-[0.97]">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8">
          
          {/* TEMA */}
          <section>
            <h3 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Monitor size={16} className="text-[var(--text-secondary)]" />
              Apariencia Global
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => updatePreferences({ theme: 'light' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.theme === 'light' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
              >
                <Sun size={20} />
                <span className="text-xs font-bold">Claro</span>
              </button>
              <button 
                onClick={() => updatePreferences({ theme: 'dark' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.theme === 'dark' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
              >
                <Moon size={20} />
                <span className="text-xs font-bold">Oscuro</span>
              </button>
              <button 
                onClick={() => updatePreferences({ theme: 'system' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.theme === 'system' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
              >
                <Monitor size={20} />
                <span className="text-xs font-bold">Sistema</span>
              </button>
            </div>
          </section>

          {/* COLOR DE ACENTO */}
          <section>
            <h3 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Palette size={16} className="text-[var(--text-secondary)]" />
              Color de Acento
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button 
                onClick={() => updatePreferences({ accent: 'neon' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'neon' ? 'border-[#11DBDC] bg-[#11DBDC]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#11DBDC] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'neon' && <Check size={14} className="text-[#090A10]" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Neón</span>
              </button>
              <button 
                onClick={() => updatePreferences({ accent: 'magenta' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'magenta' ? 'border-[#D15EEE] bg-[#D15EEE]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#D15EEE] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'magenta' && <Check size={14} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Orquídea</span>
              </button>
              <button 
                onClick={() => updatePreferences({ accent: 'azul' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'azul' ? 'border-[#2983D0] bg-[#2983D0]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#2983D0] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'azul' && <Check size={14} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Azul</span>
              </button>
              <button 
                onClick={() => updatePreferences({ accent: 'indigo' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'indigo' ? 'border-[#515ADA] bg-[#515ADA]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#515ADA] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'indigo' && <Check size={14} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Índigo</span>
              </button>
              <button 
                onClick={() => updatePreferences({ accent: 'mint' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'mint' ? 'border-[#3E9B94] bg-[#3E9B94]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#3E9B94] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'mint' && <Check size={14} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Menta</span>
              </button>
              <button 
                onClick={() => updatePreferences({ accent: 'amber' })}
                className={`p-3 rounded-[8px] border flex flex-col items-center gap-2 transition-colors active:scale-[0.97] ${preferences.accent === 'amber' ? 'border-[#F59E0B] bg-[#F59E0B]/5' : 'border-[var(--border-card)] hover:bg-[var(--bg-page)]'}`}
              >
                <div className="w-6 h-6 rounded-full bg-[#F59E0B] flex items-center justify-center shadow-sm">
                  {preferences.accent === 'amber' && <Check size={14} className="text-white" />}
                </div>
                <span className="text-xs font-bold text-[var(--text-primary)]">Ámbar</span>
              </button>
            </div>
          </section>

          {/* DENSIDAD */}
          <section>
            <h3 className="font-bold text-sm text-[var(--text-primary)] mb-3 flex items-center gap-2">
              <Maximize size={16} className="text-[var(--text-secondary)]" />
              Densidad de Interfaz
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => updatePreferences({ density: 'comfortable' })}
                className={`p-3 rounded-[8px] border flex items-center gap-3 transition-colors active:scale-[0.97] ${preferences.density === 'comfortable' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
              >
                <Maximize size={20} />
                <span className="text-sm font-bold text-[var(--text-primary)]">Cómoda</span>
              </button>
              <button 
                onClick={() => updatePreferences({ density: 'compact' })}
                className={`p-3 rounded-[8px] border flex items-center gap-3 transition-colors active:scale-[0.97] ${preferences.density === 'compact' ? 'border-[var(--btn-primary-bg)] bg-[var(--bg-card-hover)] text-[var(--btn-primary-bg)]' : 'border-[var(--border-card)] text-[var(--text-secondary)] hover:bg-[var(--bg-page)]'}`}
              >
                <Minimize size={20} />
                <span className="text-sm font-bold text-[var(--text-primary)]">Compacta</span>
              </button>
            </div>
          </section>
          
        </div>
      </div>
    </div>
  );
}
