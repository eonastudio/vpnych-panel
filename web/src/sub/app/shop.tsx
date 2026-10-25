// The Mini App's checkout, in two steps: a plan (or traffic, a device, the trial) with its
// term, then how to pay; after paying, the wait for the payment to land.
import { useState } from "react";
import { t } from "../../i18n";
import { money, rubles } from "../../lib/format";
import { safeHref } from "../../lib/url";
import { initData, openOutside, subRoot, tgEvent, tokenOf } from "../net";
import { groupText, listPrice, useCheckout, type Offer, type Provider, type ShopData } from "../shop";
import { IconCard, IconExternal, IconGift, IconHeadphones, IconLoader, IconStar, IconSwap } from "./icons";
import { useStore, type ShopKind } from "./store";
import { Button, Card, Footnote, haptic, Radio, TopBar } from "./ui";

type Plan = { data: ShopData; offers: Offer[]; field: "tariff_id" | "package_id" | "trial" | "device"; token: string; pick: string };

/** What a kind of checkout sells, from the shop it comes from; null when nothing is on sale. */
function planOf(kind: ShopKind, shop: ShopData | null, packages: ShopData | null, token: string): Plan | null {
  if (kind === "renew" && shop?.offers.length) return { data: shop, offers: shop.offers, field: "tariff_id", token, pick: t("sub.shopPick") };
  if (kind === "new" && shop?.offers.length) return { data: shop, offers: shop.offers, field: "tariff_id", token: "", pick: t("sub.shopPick") };
  if (kind === "packages" && packages?.packages?.length) return { data: packages, offers: packages.packages, field: "package_id", token, pick: t("sub.packagesPick") };
  if (kind === "device" && packages?.device) return { data: packages, offers: [packages.device], field: "device", token, pick: t("sub.devicePick") };
  if (kind === "trial" && shop?.trial) return { data: shop, offers: [shop.trial], field: "trial", token: "", pick: t("sub.trialPick") };
  return null;
}

/** A price as the big number shows it: rubles when there are, else Stars. */
function bigPrice(p: { rub?: number; stars?: number } | undefined): string {
  if (p?.rub) return rubles(p.rub);
  if (p?.stars) return `⭐ ${p.stars}`;
  return "—";
}

function MethodLogo({ id }: { id: Provider }) {
  if (id === "stars")
    return (
      <span className="pm-logo pm-stars" aria-hidden>
        <IconStar size={30} fill="currentColor" />
      </span>
    );
  if (id.includes("crypto"))
    return (
      <span className="pm-logo pm-crypto" aria-hidden>
        <IconSwap size={30} />
      </span>
    );
  return (
    <span className="pm-logo pm-card" aria-hidden>
      <IconCard size={30} />
    </span>
  );
}

export function Checkout({ kind }: { kind: ShopKind }) {
  const { shop, packages, subURL, back } = useStore();
  const plan = planOf(kind, shop, packages, tokenOf(subURL));
  if (!plan) {
    return (
      <div className="screen">
        <TopBar label={t("sub.app.back")} />
        <Card className="card-pad">
          <p className="muted-text" style={{ margin: 0 }}>
            {t("sub.shopFail")}
          </p>
          <Button className="mt" onClick={back}>
            {t("sub.app.back")}
          </Button>
        </Card>
      </div>
    );
  }
  return <CheckoutPlan plan={plan} />;
}

function CheckoutPlan({ plan }: { plan: Plan }) {
  const { promoCode, refresh, info, home } = useStore();
  const [step, setStep] = useState(1);
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
  const [method, setMethod] = useState<Provider | "support" | null>(null);
  const support = safeHref(info?.support_url, { tg: true });
  const chosen = method && (method === "support" || methods.some((m) => m.id === method)) ? method : (methods[0]?.id ?? (support ? "support" : null));
  const price = bigPrice(term ?? offer);
  const total = promoPreview ? money(promoPreview.final_amount, promoPreview.currency) : price;

  if (opened && !error) {
    return (
      <div className="screen">
        <TopBar label={t("sub.app.payment")} onBack={() => setOpened(false)} />
        <div className="amount-big">{total}</div>
        <Card className="waiting">
          <IconLoader size={40} />
          <p role="status">{t("sub.app.waitingPay")}</p>
          <small>{t("sub.shopDone")}</small>
          <Button variant="primary" onClick={refresh}>
            {t("sub.shopRefresh")}
          </Button>
          <Button onClick={home}>{t("sub.app.done")}</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar label={t("sub.app.step2", { n: step })} onBack={step === 2 ? () => setStep(1) : undefined} />

      {step === 1 ? (
        <>
          {offer ? (
            <div className="amount-big">{price}</div>
          ) : (
            <div className="buy-title">
              <h1 className="h-display">{t("sub.app.buyTitle")}</h1>
              <small>{t("sub.app.buyPick")}</small>
            </div>
          )}
          <Card className="list-card">
            {plan.offers.length > 1 ? (
              <div className="card-pad pb0">
                <label className="label">{plan.pick}</label>
              </div>
            ) : null}
            {plan.offers.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={picked === o.id}
                className={`list-row ${picked === o.id ? "sel" : ""}`}
                onClick={() => {
                  haptic();
                  setPicked(o.id);
                }}
              >
                <span className="app-text">
                  <b>{o.name}</b>
                  {o.description || o.groups?.length ? (
                    <small className="normal">{[o.description, ...(o.groups ?? []).map((g) => `${g.name}: ${groupText(g)}`)].filter(Boolean).join("\n")}</small>
                  ) : null}
                  {o.gifts?.map((what, i) => (
                    <small key={i} className="normal accent">
                      <IconGift size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                      {t("sub.shopGift", { what })}
                    </small>
                  ))}
                </span>
                <span className="price">{listPrice(o)}</span>
                <Radio checked={picked === o.id} />
              </button>
            ))}
            <div className="card-pad">
              {terms ? (
                <>
                  <label className="label">{t("sub.shopPickTerm")}</label>
                  <div className="presets">
                    {terms.map((x) => (
                      <button
                        key={x.days}
                        type="button"
                        className={`preset ${term?.days === x.days ? "sel" : ""}`}
                        onClick={() => {
                          haptic();
                          setTermDays(x.days);
                        }}
                      >
                        {x.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              <Button variant={offer ? "primary" : "glass"} disabled={!offer} className={terms ? "mt" : ""} onClick={() => setStep(2)}>
                {t("sub.app.continue")}
              </Button>
            </div>
          </Card>
          {offer?.note ? <Footnote>{offer.note}</Footnote> : promoCode ? <Footnote>{t("sub.promoSelected", { code: promoCode })}</Footnote> : null}
        </>
      ) : (
        <>
          <div className="amount-big">{total}</div>
          <Card className="list-card">
            <div className="card-pad pb0">
              <label className="label">{t("sub.app.payWith")}</label>
            </div>
            {methods.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`list-row pm-row ${chosen === m.id ? "sel" : ""}`}
                disabled={!!busy}
                onClick={() => {
                  haptic();
                  setMethod(m.id);
                }}
              >
                <MethodLogo id={m.id} />
                <span className="app-text">
                  <b>{m.label}</b>
                  <small className="normal">{m.price}</small>
                </span>
                <Radio checked={chosen === m.id} />
              </button>
            ))}
            {support ? (
              // Paying by hand: the support takes the money and gives the days.
              <button
                type="button"
                className={`list-row pm-row ${chosen === "support" ? "sel" : ""}`}
                disabled={!!busy}
                onClick={() => {
                  haptic();
                  setMethod("support");
                }}
              >
                <span className="pm-logo pm-support" aria-hidden>
                  <IconHeadphones size={30} />
                </span>
                <span className="app-text">
                  <b>{t("sub.app.manualPay")}</b>
                  <small className="normal">{t("sub.app.manualPayText")}</small>
                </span>
                <Radio checked={chosen === "support"} />
              </button>
            ) : null}
            <div className="card-pad">
              {error ? (
                <p className="error-text" role="alert" style={{ marginTop: 0 }}>
                  {error}
                </p>
              ) : null}
              {ready && !busy && !error ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    // Straight from the tap: no await between it and the bridge call.
                    openOutside(ready.url);
                    setOpened(true);
                  }}
                >
                  <IconExternal />
                  {goName ? t("sub.shopGoVia", { name: goName }) : t("sub.shopGo")}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={!chosen}
                  loading={!!busy}
                  onClick={() => {
                    if (chosen === "support") openOutside(support!);
                    else if (chosen) void pay(chosen);
                  }}
                >
                  {chosen === "support" ? t("sub.app.write") : t("sub.app.pay")}
                </Button>
              )}
            </div>
          </Card>
          {promoPreview ? (
            <Footnote>{t("sub.promoCheckoutDiscount", { discount: money(promoPreview.discount, promoPreview.currency), total: money(promoPreview.final_amount, promoPreview.currency) })}</Footnote>
          ) : ready ? (
            <Footnote>{t("sub.shopGoHint")}</Footnote>
          ) : null}
        </>
      )}
    </div>
  );
}
