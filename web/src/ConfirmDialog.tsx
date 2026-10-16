import { useEffect, useState, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** Hộp xác nhận thao tác nguy hiểm: bottom sheet trên mobile, modal giữa màn hình trên desktop. */
export function ConfirmDialog({ title, children, confirmLabel, onConfirm, onClose }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const confirm = () => {
    setBusy(true);
    setError("");
    onConfirm().catch((e: Error) => {
      setError(e.message);
      setBusy(false);
    });
  };

  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet confirm" role="alertdialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        <strong className="confirm-title">{title}</strong>
        <div className="confirm-body">{children}</div>
        {error && <p className="error">{error}</p>}
        <div className="confirm-actions">
          <button className="btn" onClick={onClose} disabled={busy} autoFocus>
            Huỷ
          </button>
          <button className="btn danger" onClick={confirm} disabled={busy}>
            {busy ? "Đang xoá…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
