import { Check, Copy, Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, QR } from "../components/ui";
import { t } from "../i18n";
import { initData, openOutside, postJSON, subRoot } from "./net";

type Referral = { Enabled: boolean; Link: string; Days: number; Invited: number; Paid: number; Earned: number; Waiting: number };

/**
 * The referral program in the Mini App, while the admin has it on: the account's link to the
 * bot, to copy, share or show as a QR code, and the friends who came by it. The same as the
 * bot's "Invite a friend".
 */
export function ReferralSection() {
  const [ref, setRef] = useState<Referral | null>(null);
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  useEffect(() => {
    postJSON<Referral>(subRoot + "/tg/referral", { init_data: initData })
      .then((r) => r.ok && setRef(r.data as Referral))
      .catch(() => undefined);
  }, []);
  if (!ref?.Enabled) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.Link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard here: the code instead.
      setShowQR(true);
    }
  };
  const share = () => openOutside(`https://t.me/share/url?url=${encodeURIComponent(ref.Link)}&text=${encodeURIComponent(t("sub.app.refShareText"))}`);
  return (
    <section className="glass sub-card p-4" aria-labelledby="referral-title">
      <div className="mb-2 flex items-center gap-2">
        <Gift size={16} className="text-[var(--ink-600)]" aria-hidden />
        <h2 id="referral-title" className="text-[15px] font-semibold">
          {t("sub.app.refTitle")}
        </h2>
      </div>
      <p className="text-[13px] text-[var(--ink-600)]">{t("sub.app.refHint", { n: ref.Days })}</p>
      {ref.Link ? (
        <>
          <div className="link-field mt-3">
            <span className="mono">{ref.Link}</span>
            <button type="button" className="icon-btn" onClick={() => void copy()} aria-label={t("sub.app.refCopy")}>
              {copied ? <Check size={18} className="text-[var(--leaf-500)]" /> : <Copy size={18} />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={share}>
              {t("sub.app.refShare")}
            </Button>
            <Button size="sm" aria-expanded={showQR} onClick={() => setShowQR((v) => !v)}>
              {t("sub.app.refQR")}
            </Button>
          </div>
          {showQR ? (
            <div className="mt-3 flex justify-center">
              <QR value={ref.Link} size={200} label={t("sub.app.refQR")} />
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-[13px] text-[var(--ink-500)]">{t("sub.app.refNoLink")}</p>
      )}
      <div className="mt-4 border-t border-[var(--hairline)] pt-3">
        <div className="mb-2 text-xs font-semibold">{t("sub.app.refStats")}</div>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {[
            [t("sub.app.refInvited"), String(ref.Invited)],
            [t("sub.app.refPaid"), String(ref.Paid)],
            [t("sub.app.refEarned"), t("sub.app.refDays", { n: ref.Earned })],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[var(--hover)] p-2">
              <dt className="text-xs text-[var(--ink-500)]">{k}</dt>
              <dd className="text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        {ref.Waiting > 0 ? <p className="mt-2 text-xs text-[var(--ink-500)]">{t("sub.app.refWaiting", { n: ref.Waiting })}</p> : null}
        <p className="mt-2 text-xs text-[var(--ink-500)]">{t("sub.app.refNote")}</p>
      </div>
    </section>
  );
}
