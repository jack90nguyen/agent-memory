import { useEffect, useState, type FormEvent, type ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  confirmLabel: string;
  /** `danger`: nút đỏ (xoá) · `primary`: nút accent (lưu). */
  tone?: "danger" | "primary";
  /** false → khoá nút xác nhận (vd chưa gõ đúng slug). */
  canConfirm?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
};

/** Hộp xác nhận: bottom sheet trên mobile, modal giữa màn hình trên desktop. Enter trong ô nhập = xác nhận. */
export function ConfirmDialog({ title, children, confirmLabel, tone = "danger", canConfirm = true, onConfirm, onClose }: Props) {
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

  const confirm = (e: FormEvent) => {
    e.preventDefault();
    if (!canConfirm || busy) return;
    setBusy(true);
    setError("");
    onConfirm().catch((e: Error) => {
      setError(e.message);
      setBusy(false);
    });
  };

  return (
    <div className="sheet-backdrop confirm-backdrop" onClick={busy ? undefined : onClose}>
      <form
        className="sheet confirm"
        role="alertdialog"
        aria-modal
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={confirm}
      >
        <div className="sheet-grip" />
        <strong className="confirm-title">{title}</strong>
        <div className="confirm-body">{children}</div>
        {error && <p className="error">{error}</p>}
        <div className="confirm-actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy} autoFocus={tone === "danger"}>
            Huỷ
          </button>
          <button type="submit" className={`btn ${tone}`} disabled={busy || !canConfirm}>
            {busy ? "Đang xử lý…" : confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
