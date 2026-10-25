// The Mini App's building blocks: buttons, cards, the two-line titles, the bottom sheet.
import { ChevronsLeft, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { tgEvent } from "../net";
import { useStore } from "./store";

export const haptic = () => tgEvent("web_app_trigger_haptic_feedback", { type: "impact", impact_style: "light" });

export function Button({
  variant = "glass",
  loading,
  children,
  className = "",
  onClick,
  disabled,
  type = "button",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "glass" | "ghost"; loading?: boolean }) {
  return (
    <button
      {...rest}
      type={type}
      className={`btn btn-${variant} ${className}`}
      disabled={loading || disabled}
      aria-busy={loading || undefined}
      onClick={(e) => {
        haptic();
        onClick?.(e);
      }}
    >
      {loading ? <LoaderCircle className="spin" aria-hidden /> : children}
    </button>
  );
}

export function Card({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <section className={`card ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

/** A title in two lines, the first one dimmed; a big half-transparent sign behind it. */
export function Title({ top, bottom, bg }: { top: string; bottom: string; bg?: ReactNode }) {
  return (
    <div className="title-wrap">
      {bg ? <div className="title-bg" aria-hidden>{bg}</div> : null}
      <h1 className="title">
        <span>{top}</span>
        <span>{bottom}</span>
      </h1>
    </div>
  );
}

/** The bar on top of an inner screen: « BACK. */
export function TopBar({ label, onBack }: { label: string; onBack?: () => void }) {
  const { back } = useStore();
  return (
    <div className="topbar glass">
      <button
        type="button"
        className="topbar-back"
        onClick={() => {
          haptic();
          (onBack ?? back)();
        }}
      >
        <ChevronsLeft size={24} aria-hidden />
        <span>{label}</span>
      </button>
    </div>
  );
}

export function Radio({ checked }: { checked: boolean }) {
  return (
    <span className={`radio ${checked ? "on" : ""}`} aria-hidden>
      <i />
    </span>
  );
}

export function Avatar({ url, name, size = 60 }: { url?: string; name: string; size?: number }) {
  return url ? (
    <img className="avatar" src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-hidden>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function Sheet({ onClose, label, children }: { onClose: () => void; label: string; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grip" />
        {children}
      </div>
    </div>
  );
}

export function Footnote({ children }: { children: ReactNode }) {
  return <p className="footnote">{children}</p>;
}
