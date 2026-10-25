// The Mini App's inner screens: connecting a device, the instructions, the promo codes and
// a new subscription link.
import { BookOpen, ChevronRight, Copy, Star } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { getLocale, t } from "../../i18n";
import { Markdown } from "../../lib/markdown";
import { bytes, dateShort, days, GiB, money, period, time } from "../../lib/format";
import { APPS, detect, enc, type Platform } from "../apps";
import { initData, json, outside, postJSON, request, subRoot, tokenOf } from "../net";
import { orderApps, PLATFORMS, type DocView } from "../page";
import { useInfo, useStore } from "./store";
import { Button, Card, Title, TopBar } from "./ui";

const PLATFORM_LABEL: Record<Platform, string> = { ios: "iPhone", android: "Android", windows: "Windows", macos: "Mac", linux: "Linux" };

/** Connecting a device in three steps: its system, the app, then the subscription added. */
export function Wizard() {
  const info = useInfo();
  const { page, subURL, back, home, toast } = useStore();
  const config = page.config;
  const lists = Object.fromEntries(PLATFORMS.map((k) => [k, orderApps(APPS[k], config.apps[k])])) as Record<Platform, (typeof APPS)[Platform]>;
  const shown = PLATFORMS.filter((k) => lists[k].length > 0);
  const want = config.apps.platform === "auto" ? detect() : config.apps.platform;
  const [step, setStep] = useState(1);
  const [platform, setPlatform] = useState<Platform>(shown.includes(want) ? want : (shown[0] ?? want));
  const [app, setApp] = useState(0);
  const apps = lists[platform] ?? [];
  const chosen = apps[app] ?? apps[0];

  const copy = () => {
    navigator.clipboard.writeText(subURL).then(
      () => toast(t("common.linkCopied")),
      () => toast(t("common.copyFailed"), "err"),
    );
  };

  const titles: [string, string][] = [
    [t("sub.app.pickTop"), t("sub.app.pickBottom")],
    [t("sub.app.installTop"), t("sub.app.installBottom")],
    [t("sub.app.doneTop"), t("sub.app.doneBottom")],
  ];
  const [top, bottom] = titles[step - 1]!;

  return (
    <main className="screen">
      <TopBar label={t("sub.app.back")} onBack={step > 1 ? () => setStep(step - 1) : back} />
      <Title top={top} bottom={bottom} />
      <p className="label">{t("sub.app.step", { n: step })}</p>

      {step === 1 ? (
        <>
          <Card className="list-card">
            <div role="radiogroup" aria-label={t("sub.platform")}>
              {shown.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={platform === k}
                  className={`list-row ${platform === k ? "sel" : ""}`}
                  onClick={() => {
                    setPlatform(k);
                    setApp(0);
                  }}
                >
                  <span className={`radio ${platform === k ? "on" : ""}`} aria-hidden>
                    <i />
                  </span>
                  <span className="row-main">
                    <b>{PLATFORM_LABEL[k]}</b>
                  </span>
                </button>
              ))}
            </div>
          </Card>
          <div className="stack" style={{ margin: "0 20px" }}>
            <Button variant="primary" disabled={!shown.length} onClick={() => setStep(2)}>
              {t("sub.app.continue")}
            </Button>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div role="radiogroup" aria-label={t("sub.connect")}>
            {apps.map((a, i) => (
              <Card key={a.name} className={`app-block ${i === app ? "sel" : ""}`}>
                <button type="button" role="radio" aria-checked={i === app} className="app-row" onClick={() => setApp(i)}>
                  <span className="app-logo-wrap" aria-hidden>
                    <span className="app-logo">{a.name[0]}</span>
                    {i === 0 ? (
                      <span className="star">
                        <Star size={14} fill="currentColor" />
                      </span>
                    ) : null}
                  </span>
                  <span className="app-text">
                    <b>{a.name}</b>
                    <small>
                      {i === 0 ? `${t("sub.recommended")} · ` : ""}
                      {t(`sub.notes.${a.note}`)}
                    </small>
                  </span>
                </button>
              </Card>
            ))}
          </div>
          <p className="muted-text" style={{ margin: "0 36px 16px" }}>
            {t("sub.app.addHint")}
          </p>
          <div className="stack" style={{ margin: "0 20px" }}>
            {chosen ? (
              <a
                className="btn btn-primary"
                href={chosen.link(subURL, info.brand, info.happ_link)}
                title={t("sub.tgBrowser")}
                {...outside(subURL + "#open=" + enc(chosen.name))}
                onClickCapture={() => setStep(3)}
              >
                {t("common.add")} · {chosen.name}
              </a>
            ) : null}
            <Button variant="glass" onClick={() => setStep(3)}>
              {t("sub.app.continue")}
            </Button>
          </div>
        </>
      ) : null}

      {step === 3 ? (
        <>
          <Card className="card-pad">
            <p className="muted-text">{t("sub.app.linkHint")}</p>
            <div className="mono-box">{subURL}</div>
            <div className="stack">
              <Button variant="glass" onClick={copy}>
                <Copy size={20} aria-hidden /> {t("common.copyLink")}
              </Button>
            </div>
          </Card>
          <div className="stack" style={{ margin: "0 20px" }}>
            <Button variant="primary" onClick={home}>
              {t("sub.app.done")}
            </Button>
          </div>
        </>
      ) : null}
    </main>
  );
}

export function Docs() {
  const { page, push } = useStore();
  return (
    <main className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.helpTop")} bottom={t("sub.docs")} bg={<BookOpen size={180} />} />
      {page.docs.length ? (
        <Card className="list-card">
          {page.docs.map((d) => (
            <button key={d.id} type="button" className="list-row doc-row" onClick={() => push({ name: "doc", id: d.id })}>
              <span className="row-main">
                <b>
                  {d.emoji ? `${d.emoji} ` : ""}
                  {d.title}
                </b>
                {d.platform && d.platform in PLATFORM_LABEL ? <small>{PLATFORM_LABEL[d.platform as Platform]}</small> : null}
              </span>
              <ChevronRight size={22} className="muted" aria-hidden />
            </button>
          ))}
        </Card>
      ) : (
        <p className="empty">{t("sub.docsEmpty")}</p>
      )}
    </main>
  );
}

export function Doc({ id }: { id: number }) {
  const { subURL, page } = useStore();
  const [doc, setDoc] = useState<DocView | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const base = subURL;
  useEffect(() => {
    const ctl = new AbortController();
    setFailed(false);
    request(`${base}/docs/${id}`, { signal: ctl.signal })
      .then((r) => json<DocView>(r))
      .then(setDoc)
      .catch(() => !ctl.signal.aborted && setFailed(true));
    return () => ctl.abort();
  }, [base, id, attempt]);
  const title = doc?.title ?? page.docs.find((d) => d.id === id)?.title ?? t("sub.docs");
  return (
    <main className="screen">
      <TopBar label={t("sub.app.back")} />
      <Card className="card-pad">
        <h1 className="h-display sm">{title}</h1>
        {failed ? (
          <div role="alert">
            <p className="error-text">{t("sub.docsFailed")}</p>
            <div className="stack">
              <Button variant="glass" onClick={() => setAttempt((n) => n + 1)}>
                {t("common.retry")}
              </Button>
            </div>
          </div>
        ) : doc ? (
          doc.body.trim() ? (
            <Markdown text={doc.body} link={(href) => outside(href)} />
          ) : (
            <p className="muted-text">{t("sub.docsEmpty")}</p>
          )
        ) : (
          <p className="muted-text" role="status">
            {t("common.loading")}
          </p>
        )}
      </Card>
    </main>
  );
}

type PromoUse = { code: string; days: number; bytes: number; discount: number; currency: string; at: number };

export function Promo() {
  const { subURL, promoCode, setPromoCode, refresh, toast } = useStore();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<PromoUse[] | null>(null);

  const loadHistory = () =>
    postJSON<{ items: PromoUse[] }>(subRoot + "/tg/promo-history", { init_data: initData })
      .then((r) => setHistory(r.ok ? (r.data.items ?? []) : []))
      .catch(() => setHistory([]));
  useEffect(() => {
    void loadHistory();
  }, []);

  const apply = async (e: FormEvent) => {
    e.preventDefault();
    const clean = code.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await postJSON<{ type: string; code: string; days: number; bytes: number }>(subRoot + "/tg/promo", { init_data: initData, token: tokenOf(subURL), code: clean });
      const body = r.data;
      if (!r.ok) {
        setError(t(body.code === "promo_try_later" ? "sub.promoTryLater" : "sub.promoUnavailable"));
        return;
      }
      if (body.type === "days") {
        toast(t("sub.promoDaysApplied", { n: body.days ?? 0 }));
        setPromoCode("");
        setCode("");
        refresh();
        void loadHistory();
      } else if (body.type === "traffic") {
        toast(t("sub.promoTrafficApplied", { n: ((body.bytes ?? 0) / GiB).toFixed(0) }));
        setPromoCode("");
        setCode("");
        refresh();
        void loadHistory();
      } else {
        setPromoCode(body.code || clean.toUpperCase());
        setCode("");
        toast(t("sub.promoDiscountApplied"));
      }
    } catch {
      setError(t("sub.promoUnavailable"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.promoTop")} bottom={t("sub.app.promoBottom")} />
      <Card className="card-pad">
        <p className="muted-text">{t("sub.promoHint")}</p>
        {promoCode ? (
          <div className="row-2" style={{ alignItems: "center" }}>
            <p className="ok-text">{t("sub.promoSelected", { code: promoCode })}</p>
            <Button variant="ghost" onClick={() => setPromoCode("")}>
              {t("sub.promoClear")}
            </Button>
          </div>
        ) : null}
        <form onSubmit={(e) => void apply(e)} noValidate>
          <label htmlFor={id} className="label" style={{ margin: "12px 0 8px" }}>
            {t("sub.promoCode")}
          </label>
          <div className="row-2">
            <input
              id={id}
              className="input promo-input"
              value={code}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-invalid={!!error}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button variant="primary" type="submit" loading={busy} disabled={!code.trim()}>
              {t("sub.promoApply")}
            </Button>
          </div>
        </form>
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
      <p className="label">{t("sub.promoHistory")}</p>
      <Card className="card-pad">
        {history === null ? (
          <p className="muted-text" role="status">
            {t("common.loading")}
          </p>
        ) : history.length === 0 ? (
          <p className="empty">{t("sub.promoNoHistory")}</p>
        ) : (
          <ul className="history">
            {history.map((h, i) => (
              <li key={`${h.code}${h.at}${i}`}>
                <div>
                  <b>{h.code}</b>
                  <small>{new Date(h.at * 1000).toLocaleString(getLocale())}</small>
                </div>
                <span className="plus">
                  {[h.days ? `+${days(h.days)}` : "", h.bytes ? `+${bytes(h.bytes)}` : "", h.discount ? `−${money(h.discount, h.currency)}` : ""].filter(Boolean).join(" ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </main>
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
    <main className="screen">
      <TopBar label={t("sub.app.back")} />
      <Title top={t("sub.app.reissueTop")} bottom={t("sub.app.reissueBottom")} />
      <Card className="card-pad">
        <p className="muted-text">{off ? t("sub.reissueOff") : t("sub.reissueText")}</p>
        {!off && (info.reissue_limit ?? 0) > 0 ? <p className="muted-text">{t("sub.reissueLimit", { n: info.reissue_limit ?? 0, period: period(info.reissue_days ?? 1) })}</p> : null}
        {after ? (
          <p className="warn soft" role="status">
            {t("sub.reissueAfter", { date: dateShort(after), time: time(after) })}
          </p>
        ) : null}
        {off || after ? null : confirm ? (
          <div className="stack">
            <p className="warn">{t("sub.reissueWarn")}</p>
            <div className="row-half" style={{ marginTop: 0 }}>
              <Button variant="glass" disabled={busy} onClick={() => setConfirm(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="glass" className="danger-btn" loading={busy} onClick={() => void go()}>
                {t("sub.reissueYes")}
              </Button>
            </div>
          </div>
        ) : (
          <div className="stack">
            <Button variant="primary" onClick={() => setConfirm(true)}>
              {t("sub.reissueButton")}
            </Button>
          </div>
        )}
        {error ? (
          <p className="error-text" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
