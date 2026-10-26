// The Telegram Mini App: the subscriber's subscriptions, the shop and the setup, in ВПНыч's
// glass look. The same data and requests as the browser's page (browser.tsx); its own screens.
import "../../styles/fonts-inter.css";
import "../../styles/fonts.css";
import "./app.css";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../../components/error-boundary";
import { initI18n, t, useLocale } from "../../i18n";
import { subDicts } from "../../i18n/sub";
import { hashAnchor, initData, json, okData, postJSON, request, subRoot, onTgEvent, tgEvent, tokenOf } from "../net";
import { applyLook, backdropStyle, barColor, readPage } from "../page";
import { loadShop, type ShopData } from "../shop";
import type { Info, TgSub } from "../types";
import { Clouds } from "./art";
import { Home, NoSub, tgFullName, tgUser } from "./home";
import { Docs, Doc, Promo, Reissue, Wizard } from "./screens";
import { Checkout } from "./shop";
import { Referral } from "./referral";
import { Support, TicketThread } from "./support";
import { StoreContext, type Screen, type Store, type Toast } from "./store";
import { Avatar, Button } from "./ui";

/** Pauses between the reloads after a payment: the panel applies a paid one within seconds. */
const AFTER_PAYMENT_MS = [2_000, 5_000, 10_000];

type Insets = { top?: number; bottom?: number; left?: number; right?: number };

/** Telegram's two safe areas, summed into --tg-top, --tg-bottom, --tg-left and --tg-right on
 *  <html>. They are read inside the zoomed layout, so they are divided by the zoom to stay true
 *  screen pixels: otherwise a phone's fullscreen header buttons would cover the top. */
const insets: { safe?: Insets; content?: Insets } = {};
let zoom = 1;
function applyInsets() {
  const root = document.documentElement.style;
  const sum = (side: keyof Insets) => (insets.safe?.[side] ?? 0) + (insets.content?.[side] ?? 0);
  for (const side of ["top", "bottom", "left", "right"] as const) root.setProperty(`--tg-${side}`, `${sum(side) / zoom}px`);
}

/** The layout is drawn for a 560px column: a narrower phone gets it scaled down. */
function applyZoom() {
  zoom = Math.min(1, window.innerWidth / 560);
  document.documentElement.style.setProperty("--z", String(zoom));
  applyInsets();
}

const page = readPage();
// The template's look and texts on <html>; its pictures are under the page's own path.
const pageRoot = new URL(".", document.baseURI).href.replace(/\/$/, "");
const asset = (path?: string) => (path ? pageRoot + "/" + path : undefined);
applyLook(page, asset);
{
  const look = page.template.look;
  const kind = look.background.kind;
  const image = asset(page.background);
  // The admin's colour, gradient or picture in place of the template's own glow.
  if (kind !== "theme" && !(kind === "image" && !image)) {
    const s = backdropStyle(look, image);
    Object.assign(document.body.style, s, { backgroundAttachment: "fixed" });
  }
}

function MiniApp() {
  useLocale();
  const [info, setInfo] = useState<{ url: string; data: Info } | null>(null);
  const [failedURL, setFailedURL] = useState<string | null>(null);
  const [subURL, setSubURL] = useState("");
  const [tg, setTg] = useState<{ state: "loading" | "none" | "failed" | "ok"; subs: TgSub[] }>({ state: "loading", subs: [] });
  const [shop, setShop] = useState<ShopData | null>(null);
  const [packages, setPackages] = useState<{ token: string; data: ShopData } | null>(null);
  const [promoCode, setPromoCode] = useState("");
  // The bot's "Promo codes" opens the Mini App at #promocodes: right on that screen.
  const [stack, setStack] = useState<Screen[]>(() => (hashAnchor === "promocodes" ? [{ name: "home" }, { name: "promo" }] : [{ name: "home" }]));
  const [toasts, setToasts] = useState<Toast[]>([]);
  const current = info && info.url === subURL ? info.data : null;
  const token = tokenOf(subURL);

  const loadInfo = useCallback(async (url: string, signal?: AbortSignal) => {
    const d = await request(url + "/info", { signal }).then((r) => json<Info>(r));
    setInfo({ url, data: d });
    setFailedURL(null);
    document.title = d.brand;
  }, []);

  const session = useCallback(
    () =>
      postJSON<{ subs: TgSub[] }>(subRoot + "/tg/session", { init_data: initData })
        .then(okData)
        .then((d) => {
          if (d.subs.length === 0) {
            setTg({ state: "none", subs: [] });
            return;
          }
          setTg({ state: "ok", subs: d.subs });
          setSubURL((cur) => (cur && d.subs.some((s) => cur.endsWith("/" + s.token)) ? cur : subRoot + "/" + d.subs[0]!.token));
        })
        .catch(() => setTg((cur) => (cur.state === "ok" && cur.subs.length ? cur : { state: "failed", subs: [] }))),
    [],
  );

  const refresh = () => {
    void session();
    if (subURL) void loadInfo(subURL).catch(() => undefined);
    loadShop(subRoot, initData)
      .then(setShop)
      .catch(() => undefined);
    if (subURL) {
      loadShop(subRoot, initData, token)
        .then((data) => setPackages({ token, data }))
        .catch(() => undefined);
    }
  };
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const backRef = useRef(back);
  backRef.current = back;

  useEffect(() => {
    tgEvent("web_app_ready");
    tgEvent("web_app_expand");
    tgEvent("web_app_request_safe_area");
    tgEvent("web_app_request_content_safe_area");
    void session();
    loadShop(subRoot, initData)
      .then(setShop)
      .catch(() => setShop(null));
  }, [session]);

  useEffect(() => {
    let timers: number[] = [];
    const onEvent = (type: string, data: unknown) => {
      if (type === "safe_area_changed" || type === "content_safe_area_changed") {
        insets[type === "safe_area_changed" ? "safe" : "content"] = data as Insets;
        applyInsets();
        return;
      }
      if (type === "fullscreen_changed") {
        tgEvent("web_app_request_safe_area");
        tgEvent("web_app_request_content_safe_area");
        return;
      }
      if (type === "back_button_pressed") {
        backRef.current();
        return;
      }
      if (type === "invoice_closed" && (data as { status?: string } | null)?.status === "paid") {
        timers.forEach((id) => window.clearTimeout(id));
        timers = AFTER_PAYMENT_MS.map((ms) => window.setTimeout(() => refreshRef.current(), ms));
      }
    };
    const off = onTgEvent(onEvent);
    return () => {
      off();
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // One subscription's info and packages at a time: a switch cancels the previous one's.
  useEffect(() => {
    if (!subURL) return;
    const ctl = new AbortController();
    loadInfo(subURL, ctl.signal).catch(() => {
      if (!ctl.signal.aborted) setFailedURL(subURL);
    });
    const tok = tokenOf(subURL);
    loadShop(subRoot, initData, tok)
      .then((data) => !ctl.signal.aborted && setPackages({ token: tok, data }))
      .catch(() => !ctl.signal.aborted && setPackages(null));
    return () => ctl.abort();
  }, [subURL, loadInfo]);

  // Telegram's back button shows on the inner screens; each opens at its top.
  useEffect(() => {
    tgEvent("web_app_setup_back_button", { is_visible: stack.length > 1 });
    window.scrollTo(0, 0);
  }, [stack]);

  const toastId = useRef(0);
  const store: Store = {
    page,
    info: current,
    subURL,
    setSubURL,
    subs: tg.subs,
    shop,
    packages: packages && packages.token === token ? packages.data : null,
    promoCode,
    setPromoCode,
    push: (s) => setStack((st) => [...st, s]),
    back,
    home: () => setStack([{ name: "home" }]),
    toast: (text, kind = "ok") => {
      const id = ++toastId.current;
      setToasts((list) => [...list, { id, text, kind }]);
      window.setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3200);
    },
    refresh,
    reload: () => (subURL ? loadInfo(subURL).catch(() => undefined) : Promise.resolve()),
    session,
  };

  const screen = stack[stack.length - 1]!;
  let body;
  if (tg.state === "loading" || (tg.state === "ok" && !current && failedURL !== subURL)) body = <Splash />;
  else if (tg.state === "failed") body = <Splash error={t("sub.tgFailed")} onRetry={() => void session()} />;
  else if (tg.state === "ok" && !current)
    body = (
      <Splash
        error={t("sub.loadFailedText")}
        onRetry={() => {
          setFailedURL(null);
          loadInfo(subURL).catch(() => setFailedURL(subURL));
        }}
      />
    );
  else if (screen.name === "shop") body = <Checkout key={screen.kind + token} kind={screen.kind} />;
  else if (screen.name === "promo") body = <Promo />;
  else if (screen.name === "support") body = <Support />;
  else if (screen.name === "referral") body = <Referral />;
  else if (screen.name === "ticket") body = <TicketThread key={screen.id} id={screen.id} />;
  else if (screen.name === "docs") body = <Docs />;
  else if (screen.name === "doc") body = <Doc key={screen.id} id={screen.id} />;
  else if (!current) body = <NoSub />;
  else if (screen.name === "wizard") body = <Wizard />;
  else if (screen.name === "reissue") body = <Reissue key={token} />;
  else body = <Home />;

  return (
    <StoreContext.Provider value={store}>
      {body}
      {toasts.length ? (
        <div className="toasts" role="status">
          {toasts.map((x) => (
            <div key={x.id} className={`toast toast-${x.kind}`}>
              {x.text}
            </div>
          ))}
        </div>
      ) : null}
    </StoreContext.Provider>
  );
}

/** The greeting for the hour of the day. */
function greeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return t("sub.app.greetMorning");
  if (h >= 12 && h < 18) return t("sub.app.greetDay");
  if (h >= 18 && h < 23) return t("sub.app.greetEvening");
  return t("sub.app.greetNight");
}

function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  const greet = greeting().replace(/,\s*$/, "");
  return (
    <div className="splash">
      <Clouds />
      <div className="splash-content" role={error ? "alert" : "status"}>
        <Avatar url={tgUser.photo_url} name={tgFullName || "V"} size={76} />
        <h1>
          {greet}
          {tgFullName ? "," : ""}
          <br />
          {tgFullName || t("sub.app.guest")}
        </h1>
        {error ? (
          <div className="splash-error">
            {error}
            {onRetry ? (
              <Button variant="primary" onClick={onRetry}>
                {t("common.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

applyZoom();
window.addEventListener("resize", applyZoom);
// Telegram paints its header and bottom bar in the Mini App's own colours.
tgEvent("web_app_set_header_color", { color: barColor(page.template.look) });
tgEvent("web_app_set_background_color", { color: page.template.look.bg });
tgEvent("web_app_set_bottom_bar_color", { color: page.template.look.bg });

void initI18n(subDicts).then(() => {
  document.title = t("sub.pageTitle");
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>
        <div className="app">
          <MiniApp />
        </div>
      </ErrorBoundary>
    </StrictMode>,
  );
});
