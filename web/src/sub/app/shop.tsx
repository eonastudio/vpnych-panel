// The Mini App's checkout: a plan (or traffic, a device, the trial), its term, and how to pay.
import { Bitcoin, Check, CreditCard, Gift, LifeBuoy, RefreshCw, Star, X } from "lucide-react";
import { t } from "../../i18n";
import { money, rubles } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { initData, openOutside, subRoot, tgEvent, tokenOf } from "../net";
import { groupText, listPrice, useCheckout, type Offer, type Provider, type ShopData } from "../shop";
import { useStore, type ShopKind } from "./store";
import { Button, Card, Radio, Title, TopBar } from "./ui";

type Plan = { data: ShopData; offers: Offer[]; field: "tariff_id" | "package_id" | "trial" | "device"; token: string; top: string; bottom: string; pick: string };

/** What a kind of checkout sells, from the shop it comes from; null when nothing is on sale. */
function planOf(kind: ShopKind, shop: ShopData | null, packages: ShopData | null, token: string): Plan | null {
  if (kind === "renew" && shop?.offers.length) return { data: shop, offers: shop.offers, field: "tariff_id", token, top: t("sub.app.renewTop"), bottom: t("sub.app.renewBottom"), pick: t("sub.shopPick") };
  if (kind === "new" && shop?.offers.length) return { data: shop, offers: shop.offers, field: "tariff_id", token: "", top: t("sub.app.newTop"), bottom: t("sub.app.newBottom"), pick: t("sub.shopPick") };
  if (kind === "packages" && packages?.packages?.length)
    return { data: packages, offers: packages.packages, field: "package_id", token, top: t("sub.app.packagesTop"), bottom: t("sub.app.packagesBottom"), pick: t("sub.packagesPick") };
  if (kind === "device" && packages?.device) return { data: packages, offers: [packages.device], field: "device", token, top: t("sub.app.deviceTop"), bottom: t("sub.app.deviceBottom"), pick: t("sub.devicePick") };
  if (kind === "trial" && shop?.trial) return { data: shop, offers: [shop.trial], field: "trial", token: "", top: t("sub.app.trialTop"), bottom: t("sub.app.trialBottom"), pick: t("sub.trialPick") };
  return null;
}

function MethodLogo({ id }: { id: Provider }) {
  if (id === "stars")
    return (
      <span className="pm-logo pm-stars" aria-hidden>
        <Star size={22} fill="currentColor" />
      </span>
    );
  if (id.includes("crypto"))
    return (
      <span className="pm-logo pm-crypto" aria-hidden>
        <Bitcoin size={22} />
      </span>
    );
  return (
    <span className="pm-logo pm-card" aria-hidden>
      <CreditCard size={22} />
    </span>
  );
}

export function Checkout({ kind }: { kind: ShopKind }) {
  const { shop, packages, subURL, back } = useStore();
  const token = tokenOf(subURL);
  const plan = planOf(kind, shop, packages, token);
  if (!plan) {
    return (
      <main className="screen">
        <TopBar label={t("sub.app.back")} />
        <Card className="card-pad">
          <p className="muted-text">{t("sub.shopFail")}</p>
          <div className="stack">
            <Button variant="glass" onClick={back}>
              {t("sub.app.back")}
            </Button>
          </div>
        </Card>
      </main>
    );
  }
  return <CheckoutPlan plan={plan} />;
}

function CheckoutPlan({ plan }: { plan: Plan }) {
  const { promoCode, refresh, info, home } = useStore();
  const { picked, setPicked, terms, term, setTermDays, offer, busy, error, promoPreview, opened, setOpened, ready, pay, methods, goName } = useCheckout({
    data: plan.data,
    offers: plan.offers,
    field: plan.field,
    subRoot,
    initData,
    token: plan.token,
    promoCode,
    openInvoice: (slug) => tgEvent("web_app_open_invoice", { slug }),
  });
  const support = safeHref(info?.support_url, { tg: true });

  return (
    <main className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={plan.top} bottom={plan.bottom} />

      <p className="label">
        {plan.pick}
        {promoCode ? ` · ${t("sub.promoSelected", { code: promoCode })}` : ""}
      </p>
      <Card className="list-card">
        <div role="radiogroup" aria-label={plan.pick}>
          {plan.offers.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={picked === o.id} className={`list-row ${picked === o.id ? "sel" : ""}`} onClick={() => setPicked(o.id)}>
              <Radio checked={picked === o.id} />
              <span className="row-main">
                <b>{o.name}</b>
                {o.description ? <small>{o.description}</small> : null}
                {o.groups?.length || o.gifts?.length ? (
                  <span className="perks">
                    {o.groups?.map((g) => (
                      <span key={g.name} className={g.mode === "closed" ? "no" : "yes"}>
                        {g.mode === "closed" ? <X size={14} aria-hidden /> : <Check size={14} aria-hidden />}
                        {g.name}: {groupText(g)}
                      </span>
                    ))}
                    {o.gifts?.map((what, i) => (
                      <span key={i} className="yes">
                        <Gift size={14} aria-hidden />
                        {t("sub.shopGift", { what })}
                      </span>
                    ))}
                  </span>
                ) : null}
                {o.note ? <span className="note">{o.note}</span> : null}
              </span>
              <span className="row-price">{listPrice(o)}</span>
            </button>
          ))}
        </div>
      </Card>

      {terms ? (
        <>
          <p className="label">{t("sub.shopPickTerm")}</p>
          <div className="presets" role="radiogroup" aria-label={t("sub.shopPickTerm")}>
            {terms.map((x) => (
              <button key={x.days} type="button" role="radio" aria-checked={term?.days === x.days} className="preset" onClick={() => setTermDays(x.days)}>
                {x.label}
                <small>{x.rub ? rubles(x.rub) : `⭐ ${x.stars}`}</small>
              </button>
            ))}
          </div>
        </>
      ) : null}

      {offer ? (
        <>
          <p className="label">{t("sub.app.payWith")}</p>
          {promoPreview ? (
            <p className="ok-text" style={{ margin: "0 36px 12px" }}>
              {t("sub.promoCheckoutDiscount", { discount: money(promoPreview.discount, promoPreview.currency), total: money(promoPreview.final_amount, promoPreview.currency) })}
            </p>
          ) : null}
          <Card className="list-card">
            {methods.map((m) => (
              <button key={m.id} type="button" className="list-row pm-row" disabled={!!busy} aria-busy={busy === m.id || undefined} onClick={() => void pay(m.id)}>
                <MethodLogo id={m.id} />
                <span className="row-main">
                  <b>{m.label}</b>
                </span>
                <span className="row-price">{busy === m.id ? <RefreshCw size={18} className="spin" aria-hidden /> : m.price}</span>
              </button>
            ))}
            {support ? (
              // Paying by hand: the support takes the money and gives the days.
              <button type="button" className="list-row pm-row" disabled={!!busy} onClick={() => openOutside(support)}>
                <span className="pm-logo pm-card" aria-hidden>
                  <LifeBuoy size={22} />
                </span>
                <span className="row-main">
                  <b>{t("sub.support")}</b>
                  <small>{t("sub.app.supportText")}</small>
                </span>
                <span className="row-price">›</span>
              </button>
            ) : null}
          </Card>
          {!methods.length && !support ? <p className="muted-text" style={{ margin: "0 36px" }}>{t("sub.shopFail")}</p> : null}
        </>
      ) : null}

      {ready && !busy && !error ? (
        <div className="stack" style={{ margin: "0 20px" }}>
          <Button
            variant="primary"
            onClick={() => {
              // Straight from the tap: no await between it and the bridge call.
              openOutside(ready.url);
              setOpened(true);
            }}
          >
            {goName ? t("sub.shopGoVia", { name: goName }) : t("sub.shopGo")}
          </Button>
          {opened ? null : <p className="muted-text">{t("sub.shopGoHint")}</p>}
        </div>
      ) : null}

      {error ? (
        <p className="error-text" role="alert" style={{ margin: "12px 36px" }}>
          {error}
        </p>
      ) : null}

      {opened && !error ? (
        <Card className="card-pad waiting">
          <p role="status">
            <Check size={18} aria-hidden style={{ display: "inline", verticalAlign: -3, marginRight: 6 }} />
            {t("sub.shopDone")}
          </p>
          <div className="row-half">
            <Button variant="glass" onClick={refresh}>
              {t("sub.shopRefresh")}
            </Button>
            <Button variant="primary" onClick={home}>
              {t("sub.app.done")}
            </Button>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
