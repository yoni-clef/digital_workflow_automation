/**
 * Fixed toast notification (success / error).
 * @param {{ message: string | null, variant?: 'success' | 'error', onDismiss: () => void }} props
 */
export default function Toast({ message, variant = 'success', onDismiss }) {
  if (!message) return null;

  const cls =
    variant === 'error'
      ? 'alert alert-error border border-red-500/30'
      : 'alert alert-success border border-green-500/30';

  return (
    <div
      className="fixed bottom-6 right-6 z-[250] max-w-md shadow-lg rounded-lg"
      role="status"
      aria-live="polite"
    >
      <div className={`${cls} flex justify-between items-start gap-3 pr-2`}>
        <span>{message}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm shrink-0"
          onClick={onDismiss}
          aria-label="Dismiss notification"
        >
          ×
        </button>
      </div>
    </div>
  );
}
