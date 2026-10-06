import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  labelledBy: string;
  /** Called on Escape. Omit to make the dialog stay open on Escape. */
  onCancel?: () => void;
  className?: string;
  children: ReactNode;
}

/**
 * Modal built on the native `<dialog>`: `showModal()` gives focus trapping,
 * makes the rest of the page inert and restores focus on close for free.
 * React's `open` prop stays the source of truth.
 */
export function Modal({ open, labelledBy, onCancel, className, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={['modal', className].filter(Boolean).join(' ')}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCancel?.();
      }}
      onClose={(event) => {
        // Chrome may close on Escape without a cancel event (no recent user activation).
        if (!open) return;
        if (onCancel) onCancel();
        else event.currentTarget.showModal();
      }}
    >
      {open && children}
    </dialog>
  );
}
