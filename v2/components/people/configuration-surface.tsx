"use client";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import styles from "./people.module.css";
const subscribe = () => () => {};
export function ConfigurationSurface({
  title,
  description,
  size = "medium",
  dirty = false,
  busy = false,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: string;
  size?: "small" | "medium" | "large";
  dirty?: boolean;
  busy?: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    if (!mounted) return;
    const origin = document.activeElement as HTMLElement | null;
    const surface = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    surface?.showModal();
    return () => {
      surface?.close();
      document.body.style.overflow = overflow;
      origin?.focus();
    };
  }, [mounted]);
  function close() {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  }
  const content = (
    <dialog
      ref={dialog}
      aria-labelledby={heading}
      className={`${styles.page} ${styles.configuration} ${styles[size]}`}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
        close();
      }}
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          close();
      }}
    >
      <header className={styles.editorHeader}>
        <div>
          <h2 id={heading}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          type="button"
          className="tt-button"
          aria-label="Close editor"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {discard ? (
        <div className={styles.editorBody} role="alert">
          <h3>Discard unsaved changes?</h3>
          <p>Your changes have not been saved.</p>
          <div className={styles.actions}>
            <button
              type="button"
              className="tt-button-primary"
              autoFocus
              onClick={() => setDiscard(false)}
            >
              Keep Editing
            </button>
            <button
              type="button"
              className="tt-button-danger"
              onClick={onClose}
            >
              Discard
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.editorBody}>
            <fieldset className={styles.editorContent} disabled={busy}>
              {children}
            </fieldset>
          </div>
          {footer && (
            <footer className={styles.editorFooter}>
              <button
                type="button"
                className="tt-button"
                disabled={busy}
                onClick={close}
              >
                Cancel
              </button>
              {footer}
            </footer>
          )}
        </>
      )}
    </dialog>
  );
  return mounted ? createPortal(content, document.body) : null;
}
