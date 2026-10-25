// A promo code, typed on the home card or on the promo screen: days and traffic land at once,
// a discount is kept for the next checkout.
import { useState } from "react";
import { t } from "../../i18n";
import { GiB } from "../../lib/format";
import { initData, postJSON, subRoot, tokenOf } from "../net";
import { useStore } from "./store";

export function usePromo(onApplied?: () => void) {
  const { subURL, setPromoCode, refresh, toast } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  /** Empty when the code took (its bonus is in, or its discount kept), else why it did not. */
  const apply = async (code: string): Promise<string> => {
    const clean = code.trim();
    if (!clean || busy) return t("sub.promoUnavailable");
    setBusy(true);
    setError("");
    try {
      const r = await postJSON<{ type: string; code: string; days: number; bytes: number }>(subRoot + "/tg/promo", { init_data: initData, token: tokenOf(subURL), code: clean });
      const body = r.data;
      if (!r.ok) {
        const why = t(body.code === "promo_try_later" ? "sub.promoTryLater" : "sub.promoUnavailable");
        setError(why);
        return why;
      }
      if (body.type === "days" || body.type === "traffic") {
        toast(body.type === "days" ? t("sub.promoDaysApplied", { n: body.days ?? 0 }) : t("sub.promoTrafficApplied", { n: ((body.bytes ?? 0) / GiB).toFixed(0) }));
        setPromoCode("");
        refresh();
      } else {
        setPromoCode(body.code || clean.toUpperCase());
        toast(t("sub.promoDiscountApplied"));
      }
      onApplied?.();
      return "";
    } catch {
      setError(t("sub.promoUnavailable"));
      return t("sub.promoUnavailable");
    } finally {
      setBusy(false);
    }
  };

  return { apply, busy, error, setError };
}
