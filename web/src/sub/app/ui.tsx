// The Mini App's building blocks: buttons, cards, the two-line titles, the bottom sheet.
import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { t } from "../../i18n";
import { tgEvent } from "../net";
import { IconChevronsLeft, IconDots, IconLoader } from "./icons";
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
      {loading ? <IconLoader aria-hidden /> : children}
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

/** The bar on top of an inner screen: « STEP 1 OF 3 ••• or « BACK •••; the dots open menu, when there is one. */
export function TopBar({ label, onBack, menu }: { label: string; onBack?: () => void; menu?: ReactNode }) {
  const { back } = useStore();
  const [open, setOpen] = useState(false);
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
        <IconChevronsLeft size={24} aria-hidden />
        <span>{label}</span>
      </button>
      <button type="button" className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label={t("sub.app.menu")}>
        <IconDots />
      </button>
      {open && menu ? (
        <div className="topbar-menu" onClick={() => setOpen(false)}>
          {menu}
        </div>
      ) : null}
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
