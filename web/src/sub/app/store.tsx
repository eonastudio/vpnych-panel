// The Mini App's state, shared by its screens: the account's subscriptions, the one on
// screen, the shop, the screen stack and the toasts.
import { createContext, useContext } from "react";
import type { PagePublic } from "../page";
import type { ShopData } from "../shop";
import type { Info, TgSub } from "../types";

/** What the checkout sells: plans to renew or to buy anew, traffic, a device or the trial. */
export type ShopKind = "renew" | "new" | "packages" | "device" | "trial";

export type Screen =
  | { name: "home" }
  | { name: "shop"; kind: ShopKind }
  | { name: "wizard" }
  | { name: "docs" }
  | { name: "doc"; id: number }
  | { name: "promo" }
  | { name: "support" }
  | { name: "ticket"; id: number }
  | { name: "referral" }
  | { name: "reissue" };

export type Toast = { id: number; text: string; kind: "ok" | "err" };

export type Store = {
  page: PagePublic;
  /** The subscription on screen; null for an account without one. */
  info: Info | null;
  subURL: string;
  setSubURL: (url: string) => void;
  subs: TgSub[];
  shop: ShopData | null;
  /** The packages and the extra device of the subscription on screen. */
  packages: ShopData | null;
  /** A discount code kept for the next checkout. */
  promoCode: string;
  setPromoCode: (code: string) => void;
  push: (s: Screen) => void;
  back: () => void;
  home: () => void;
  toast: (text: string, kind?: Toast["kind"]) => void;
  /** Reloads the session, the info and the shop. */
  refresh: () => void;
  /** Reloads the info of the subscription on screen. */
  reload: () => Promise<void>;
  session: () => Promise<void>;
};

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error("useStore outside the Mini App");
  return s;
}

/** The info of the subscription on screen, for the screens that show only with one. */
export function useInfo() {
  const s = useStore();
  if (!s.info) throw new Error("no subscription on screen");
  return s.info;
}
