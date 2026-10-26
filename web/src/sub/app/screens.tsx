// The Mini App's inner screens: connecting a device, the instructions, the promo codes and
// a new subscription link.
import { useEffect, useState, type FormEvent } from "react";
import { getLocale, t } from "../../i18n";
import { Markdown } from "../../lib/markdown";
import { bytes, dateShort, days, money, period, time } from "../../lib/format";
import { QR } from "../../components/ui";
import { APPS, detect, enc, type Platform } from "../apps";
import { initData, json, outside, postJSON, request, subRoot, tokenOf } from "../net";
import { orderApps, PLATFORMS, type DocView } from "../page";
import { IconChevronDown, IconCopy, IconExternal, IconHeadphones, IconHelp, IconLoader, IconRefresh, IconTicket } from "./icons";
import { usePromo } from "./promo";
import { useSupport } from "./support";
import { useInfo, useStore } from "./store";
import { Button, Card, Footnote, haptic, Radio, Title, TopBar } from "./ui";

const PLATFORM_LABEL: Record<Platform, string> = { ios: "iPhone", android: "Android", windows: "Windows", macos: "Mac", linux: "Linux" };

/** The logo tile: the brand's own colors where the stylesheet has them. */
function AppLogo({ name }: { name: string }) {
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const known = ["happ", "incy", "v2raytun"].includes(id);
  return <span className={`app-logo ${known ? `app-${id}` : "app-other"}`}>{id === "happ" ? "H" : id === "incy" ? "INCY" : name.slice(0, 2)}</span>;
}

/** Connecting a device in three steps: its system, the app, then the subscription added. */
export function Wizard() {
  const info = useInfo();
  const { page, subURL, back, home, toast } = useStore();
  const lists = Object.fromEntries(PLATFORMS.map((k) => [k, orderApps(APPS[k], page.apps[k])])) as Record<Platform, (typeof APPS)[Platform]>;
  const shown = PLATFORMS.filter((k) => lists[k].length > 0);
  const want = page.apps.platform === "auto" ? detect() : page.apps.platform;
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform>(shown.includes(want) ? want : (shown[0] ?? want));
  const [app, setApp] = useState(0);
  const apps = lists[platform] ?? [];
  const chosen = apps[app] ?? apps[0];

  const copy = () => {
    navigator.clipboard.writeText(subURL).then(
      () => {
        haptic();
        toast(t("common.linkCopied"));
      },
      () => toast(t("common.copyFailed"), "err"),
    );
  };

  return (
    <div className="screen">
      <TopBar label={t("sub.app.step", { n: step })} onBack={step > 1 ? () => setStep(step - 1) : back} />

      {step === 1 ? (
        <>
          <Title top={t("sub.app.pickTop")} bottom={t("sub.app.pickBottom")} bg={<span className="big-num">1</span>} />
          <Card className="list-card">
            {shown.map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={platform === k}
                className={`list-row ${platform === k ? "sel" : ""}`}
                onClick={() => {
                  haptic();
                  setPlatform(k);
                  setApp(0);
                }}
              >
                <span className="upper">{PLATFORM_LABEL[k]}</span>
                <Radio checked={platform === k} />
              </button>
            ))}
            <div className="card-pad">
              <Button variant="primary" disabled={!shown.length} onClick={() => setStep(2)}>
                {t("sub.app.continue")}
              </Button>
            </div>
          </Card>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <Title top={t("sub.app.installTop")} bottom={t("sub.app.installBottom")} bg={<span className="big-num">2</span>} />
          <Card className="list-card">
            {apps.map((a, i) => (
              <div key={a.name} className={`app-block ${i === app ? "sel" : ""}`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={i === app}
                  className="app-row"
                  onClick={() => {
                    haptic();
                    setApp(i);
                  }}
                >
                  <span className="app-logo-wrap" aria-hidden>
                    <AppLogo name={a.name} />
                    {i === 0 ? <span className="star">★</span> : null}
                  </span>
                  <span className="app-text">
                    <b>{a.name}</b>
                    <small>{t(`sub.notes.${a.note}`)}</small>
                  </span>
                  <Radio checked={i === app} />
                </button>
              </div>
            ))}
            <div className="card-pad">
              <Button variant="primary" disabled={!chosen} onClick={() => setStep(3)}>
                {chosen ? t("sub.app.continueWith", { name: chosen.name }) : t("sub.app.continue")}
              </Button>
            </div>
          </Card>
          <Footnote>
            {t("sub.app.wizardNote1")}
            <br />
            {t("sub.app.wizardNote2")}
          </Footnote>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Title top={t("sub.app.doneTop")} bottom={t("sub.app.doneBottom")} bg={<span className="big-num">3</span>} />
          <Card className="list-card">
            <div className="card-pad">
              <label className="label">{t("sub.app.linkFor", { name: chosen?.name ?? "VPN" })}</label>
              <div className="mono-box">{subURL}</div>
              <div className="row-2">
                {chosen ? (
                  <a className="btn btn-primary" href={chosen.link(subURL, info.brand, info.happ_link)} title={t("sub.tgBrowser")} {...outside(subURL + "#open=" + enc(chosen.name))}>
                    <IconExternal />
                    {t("sub.app.openIn", { name: chosen.name })}
                  </a>
                ) : (
                  <Button variant="primary" onClick={copy}>
                    <IconCopy />
                    {t("common.copyLink")}
                  </Button>
                )}
                <Button className="square" aria-label={t("common.copyLink")} onClick={copy}>
                  <IconCopy />
                </Button>
              </div>
            </div>
            <div className="divider" />
            {/* Another phone or a computer scans the same subscription in its app. */}
            <div className="card-pad wizard-qr">
              <label className="label">{t("sub.qrOther")}</label>
              <QR value={subURL} size={280} label={t("sub.app.qrScan")} />
              <p className="muted-text">{t("sub.app.qrScan")}</p>
            </div>
            <div className="divider" />
            <div className="card-pad">
              <Button variant="primary" onClick={home}>
                {t("sub.app.done")}
              </Button>
            </div>
          </Card>
          <Footnote>
            {t("sub.app.wizardManual", { apps: apps.map((a) => a.name).join(t("sub.app.or")) })}
            <br />
            {t("sub.app.wizardVpn")}
          </Footnote>
        </>
      ) : null}
    </div>
  );
}

/** The instructions as the help screen lists them: each one opens on its own screen. */
export function Docs() {
  const { page, push } = useStore();
  const support = useSupport();
  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.helpTop")} bottom={t("sub.app.helpBottom")} bg={<IconHelp size={280} strokeWidth={2.2} />} />
      <Card className="list-card">
        <div className="card-pad pb0">
          <label className="label">{t("sub.docs")}</label>
        </div>
        {page.docs.length ? (
          page.docs.map((d) => (
            <div key={d.id} className="faq">
              <button
                type="button"
                onClick={() => {
                  haptic();
                  push({ name: "doc", id: d.id });
                }}
              >
                <span>
                  {d.emoji ? `${d.emoji} ` : ""}
                  {d.title}
                  {d.platform && d.platform in PLATFORM_LABEL ? <span className="muted"> · {PLATFORM_LABEL[d.platform as Platform]}</span> : null}
                </span>
                <IconChevronDown size={20} style={{ transform: "rotate(-90deg)" }} />
              </button>
            </div>
          ))
        ) : (
          <div className="empty">{t("sub.docsEmpty")}</div>
        )}
        {support ? (
          <div className="card-pad">
            <Button variant="primary" onClick={support}>
              <IconHeadphones />
              {t("sub.app.writeSupport")}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

export function Doc({ id }: { id: number }) {
  const { subURL, page } = useStore();
  const [doc, setDoc] = useState<DocView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    request(`${subURL}/docs/${id}`, { signal: ctl.signal })
      .then((r) => json<DocView>(r))
      .then(setDoc)
      .catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, [subURL, id, attempt]);
  const item = page.docs.find((d) => d.id === id);
  const title = doc?.title ?? item?.title ?? t("sub.docs");
  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Card className="list-card">
        <div className="card-pad pb0">
          <label className="label">{t("sub.docs")}</label>
        </div>
        <div className="faq open">
          <button type="button" tabIndex={-1}>
            <span>
              {item?.emoji ? `${item.emoji} ` : ""}
              {title}
            </span>
            <IconChevronDown size={20} />
          </button>
          {failed ? (
            <div className="card-pad" role="alert" style={{ paddingTop: 0 }}>
              <p className="error-text" style={{ marginTop: 0 }}>
                {t("sub.docsFailed")}
              </p>
              <Button onClick={() => setAttempt((n) => n + 1)}>
                <IconRefresh />
                {t("common.retry")}
              </Button>
            </div>
          ) : doc ? (
            doc.body.trim() ? (
              <div className="md doc-body">
                <Markdown text={doc.body} link={(href) => outside(href)} />
              </div>
            ) : (
              <p>{t("sub.docsEmpty")}</p>
            )
          ) : (
            <div className="empty" role="status" aria-label={t("common.loading")}>
              <IconLoader />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

type PromoUse = { code: string; days: number; bytes: number; discount: number; currency: string; at: number };

/** Promo codes as the history screen lays them out: the field, then what was used. */
export function Promo() {
  const { promoCode, setPromoCode } = useStore();
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<PromoUse[] | null>(null);

  const loadHistory = () =>
    postJSON<{ items: PromoUse[] }>(subRoot + "/tg/promo-history", { init_data: initData })
      .then((r) => setHistory(r.ok ? (r.data.items ?? []) : []))
      .catch(() => setHistory([]));
  useEffect(() => {
    void loadHistory();
  }, []);

  const { apply, busy, error } = usePromo(() => {
    setCode("");
    void loadHistory();
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim() && !busy) void apply(code);
  };

  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.promoTop")} bottom={t("sub.app.promoBottom")} />
      <Card className="card-pad">
        <form onSubmit={submit} noValidate>
          <label className="label" htmlFor="promo-code">
            {t("sub.promoCode")}
          </label>
          <input
            id="promo-code"
            className="input"
            value={code}
            placeholder={t("sub.app.promoPlaceholder")}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={!!error}
            onChange={(e) => setCode(e.target.value)}
          />
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
          <Button variant={code.trim() ? "primary" : "glass"} type="submit" className="mt" loading={busy} disabled={!code.trim()}>
            {t("sub.app.activate")}
          </Button>
        </form>
        {promoCode ? (
          <div className="promo-chosen">
            <IconTicket size={24} aria-hidden />
            <span>{t("sub.promoSelected", { code: promoCode })}</span>
            <button type="button" onClick={() => setPromoCode("")}>
              {t("sub.promoClear")}
            </button>
          </div>
        ) : null}
      </Card>
      <Card className="card-pad">
          <label className="label">{t("sub.promoHistory")}</label>
          {history === null ? (
            <div className="empty">
              <IconLoader />
            </div>
          ) : history.length === 0 ? (
            <div className="empty">{t("sub.promoNoHistory")}</div>
          ) : (
            <ul className="history">
              {history.map((h, i) => (
                <li key={`${h.code}${h.at}${i}`}>
                  <div>
                    <b>{h.code}</b>
                    <small>{new Date(h.at * 1000).toLocaleString(getLocale(), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small>
                  </div>
                  <span className="plus">
                    {[h.days ? `+${days(h.days)}` : "", h.bytes ? `+${bytes(h.bytes)}` : "", h.discount ? `−${money(h.discount, h.currency)}` : ""].filter(Boolean).join(" ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  );
}

/** A new subscription link: the old one stops working on every device. */
export function Reissue() {
  const info = useInfo();
  const { subURL, setSubURL, session, toast } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [after, setAfter] = useState(info.reissue_after && new Date(info.reissue_after).getTime() > Date.now() ? info.reissue_after : "");
  const off = !!info.reissue_off;

  const go = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await postJSON<{ token: string; code: string; reissue_after: string }>(subRoot + "/tg/reissue", { init_data: initData, token: tokenOf(subURL) });
      if (r.ok && r.data.token) {
        setSubURL(subRoot + "/" + r.data.token);
        await session();
        haptic();
        toast(t("sub.reissueTitle"));
        setConfirm(false);
        return;
      }
      if (r.status === 429 && r.data.reissue_after) setAfter(r.data.reissue_after);
      else setError(t(r.data.code === "reissue_off" ? "sub.reissueOff" : "sub.reissueFailed"));
      setConfirm(false);
    } catch {
      setError(t("sub.reissueFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.reissueTop")} bottom={t("sub.app.reissueBottom")} bg={<IconRefresh size={280} strokeWidth={2.2} />} />
      <Card className="list-card">
        <div className="card-pad">
          <label className="label">{t("sub.link")}</label>
          <div className="mono-box">{subURL}</div>
          <p className="muted-text">{off ? t("sub.reissueOff") : t("sub.reissueText")}</p>
          {!off && (info.reissue_limit ?? 0) > 0 ? <p className="muted-text">{t("sub.reissueLimit", { n: info.reissue_limit ?? 0, period: period(info.reissue_days ?? 1) })}</p> : null}
          {after ? (
            <p className="warn" role="status" style={{ margin: "16px 0 0" }}>
              {t("sub.reissueAfter", { date: dateShort(after), time: time(after) })}
            </p>
          ) : null}
          {off || after ? null : confirm ? (
            <>
              <p className="warn" style={{ margin: "16px 0 0" }}>
                {t("sub.reissueWarn")}
              </p>
              <div className="row-half">
                <Button disabled={busy} onClick={() => setConfirm(false)}>
                  {t("common.cancel")}
                </Button>
                <Button className="danger-btn" loading={busy} onClick={() => void go()}>
                  {t("sub.reissueYes")}
                </Button>
              </div>
            </>
          ) : (
            <Button variant="primary" className="mt" onClick={() => setConfirm(true)}>
              <IconRefresh />
              {t("sub.reissueButton")}
            </Button>
          )}
          {error ? (
            <p className="error-text" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
