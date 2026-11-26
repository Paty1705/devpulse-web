import { initials } from '@/lib/meetings';

type AvatarProps = {
  email?: string | null;
  /** Resalta con los acentos (p. ej. el usuario actual). */
  highlight?: boolean;
  size?: number;
  className?: string;
};

export function Avatar({ email, highlight = false, size = 36, className = '' }: AvatarProps) {
  return (
    <span
      title={email ?? 'Sin asignar'}
      className={`tile-3d shrink-0 flex items-center justify-center font-bold ${highlight ? 'accent-fill' : 'gray-fill'} ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size / 3),
        fontSize: Math.max(11, Math.round(size / 3)),
      }}
    >
      {initials(email)}
    </span>
  );
}

export function AvatarStack({ emails, currentEmail, max = 5, size = 34 }: { emails: string[]; currentEmail?: string | null; max?: number; size?: number }) {
  const shown = emails.slice(0, max);
  const rest = emails.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((e, i) => (
        <Avatar key={e} email={e} highlight={e === currentEmail} size={size} className={i > 0 ? '-ml-2 ring-2 ring-[var(--page-base,transparent)]' : ''} />
      ))}
      {rest > 0 && (
        <span
          className="-ml-2 chip-glass flex items-center justify-center font-mono font-bold text-[var(--text-primary)]"
          style={{ width: size, height: size, borderRadius: Math.round(size / 3), fontSize: Math.round(size / 3) }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
