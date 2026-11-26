import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/client/Utils", async (orig) => ({
  ...(await orig<typeof import("../../src/client/Utils")>()),
  translateText: (key: string, params?: Record<string, string | number>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
}));

const catalogue = vi.hoisted(() => ({
  cached: null as unknown,
  fetched: null as unknown,
}));
vi.mock("../../src/client/Cosmetics", async (orig) => ({
  ...(await orig<typeof import("../../src/client/Cosmetics")>()),
  getCachedCosmetics: () => catalogue.cached,
  fetchCosmetics: async () => catalogue.fetched,
}));

// The session as Auth.userAuth sees it. Like the real one (Auth.ts), a
// token expired or within 3 minutes of expiry is refreshed only when asked
// to (shouldRefresh, the default); userAuth(false) answers false for it.
// `real` hands the call to the real userAuth, with fetch stubbed, so a
// refresh's answer goes through Auth.ts's own handling.
const auth = vi.hoisted(() => ({
  session: true,
  expired: false,
  throws: false,
  real: false,
}));
vi.mock("../../src/client/Auth", async (orig) => {
  const real = await orig<typeof import("../../src/client/Auth")>();
  return {
    ...real,
    // The mocked session is never settled "signed out" ahead of time, so
    // those tests go through userAuth() as before.
    knownSignedOut: () => (auth.real ? real.knownSignedOut() : false),
    userAuth: async (shouldRefresh = true) => {
      if (auth.real) return real.userAuth(shouldRefresh);
      if (auth.throws) throw new Error("auth broke");
      if (!auth.session) return false;
      if (auth.expired) {
        if (!shouldRefresh) return false;
        auth.expired = false; // refreshed from the refresh cookie
      }
      return { jwt: "j", claims: {} };
    },
  };
});

import { setApiEnabledForTests } from "../../src/client/ApiBase";
import {
  clearLocalSession,
  knownSignedOut,
  userAuth,
} from "../../src/client/Auth";
import { ClientEnv } from "../../src/client/ClientEnv";
import { defaultPlayerCardView } from "../../src/client/components/card/PlayerCardModel";
import { COSMETICS_CHANGED } from "../../src/client/Experiments";
import { WinModal } from "../../src/client/hud/layers/WinModal";

// openfront-light disables the closed-source API by default; the session
// suite below covers the upstream behaviour, so it turns it back on.
setApiEnabledForTests(true);

if (!customElements.get("win-modal")) {
  customElements.define("win-modal", WinModal);
}

// WinModal with no game attached: enough to render the modal's frame and
// check where the card section sits and that nothing else moved.
async function renderModal(state: Record<string, unknown>) {
  const modal = document.createElement("win-modal") as unknown as WinModal &
    Record<string, unknown>;
  Object.assign(modal, {
    isVisible: true,
    _title: "You died",
    // The store-skins turn, so no random Steam or Discord promo.
    rand: 0.9,
    ...state,
  });
  document.body.appendChild(modal as unknown as Node);
  await modal.updateComplete;
  const section = modal.querySelector("end-card-section") as unknown as {
    updateComplete: Promise<unknown>;
  } | null;
  await section?.updateComplete;
  return modal as unknown as HTMLElement;
}

describe("WinModal card section", () => {
  // Past the first three games, so the tutorial doesn't take the promo box.
  beforeEach(() => {
    localStorage.setItem("gamesPlayed", "10");
  });
  afterEach(() => {
    document.body.innerHTML = "";
    localStorage.removeItem("gamesPlayed");
  });

  it("eliminated by a human shows label and killer card above XP panel", async () => {
    const modal = await renderModal({
      endCardMode: "eliminatedBy",
      endCardView: defaultPlayerCardView("Volt", "UN"),
    });
    const order = [
      ...modal.querySelectorAll("h2, [data-end-card], game-xp-panel"),
    ].map((el) =>
      el.tagName === "H2"
        ? "h2"
        : el.hasAttribute("data-end-card")
          ? "card"
          : "xp",
    );
    expect(order).toEqual(["h2", "card", "xp"]);
  });

  it("fetches the catalogue when it isn't cached, then shows the items", async () => {
    catalogue.cached = null;
    catalogue.fetched = {
      patterns: {},
      flags: {},
      cardBackgrounds: {
        bg_pacific: {
          product: null,
          rarity: "epic",
          name: "bg_pacific",
          url: "/bg.webp",
        },
      },
    };
    const modal = (await renderModal({})) as unknown as {
      game: unknown;
      setEndCard(choose: () => unknown): void;
      endCardView: { background: { name: string } | null } | null;
      updateComplete: Promise<unknown>;
    };
    modal.game = {
      myPlayer: () => null,
      gameID: () => "g1",
      config: () => ({ gameConfig: () => ({}) }),
      resumedFromSave: () => false,
      playerByClientID: () => ({
        name: () => "Volt",
        clanTag: () => null,
        territoryColor: () => ({ toHex: () => "#123456" }),
      }),
      playerCardOf: () => ({
        card: { background: "bg_pacific", trackers: [] },
        flag: undefined,
      }),
    };
    modal.setEndCard(() => ({ kind: "winner", clientID: "KILLER01" }));
    expect(modal.endCardView?.background).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    await modal.updateComplete;
    expect(modal.endCardView?.background?.name).toBe("bg_pacific");
    catalogue.fetched = null;
  });

  it("rebuilds the eliminated-by loadout at the new catalog's prices", async () => {
    const withBackground = (priceHard: number) => ({
      patterns: {},
      flags: {},
      cardBackgrounds: {
        bg_pacific: {
          product: null,
          rarity: "epic",
          name: "bg_pacific",
          url: "/bg.webp",
          priceHard,
        },
      },
    });
    catalogue.cached = withBackground(240);
    const modal = (await renderModal({})) as unknown as {
      game: unknown;
      setEndCard(choose: () => unknown): void;
      loadout: { item: { priceHard?: number } }[];
    };
    modal.game = {
      myPlayer: () => null,
      gameID: () => "g1",
      config: () => ({ gameConfig: () => ({}) }),
      resumedFromSave: () => false,
      playerByClientID: () => ({
        name: () => "Volt",
        clanTag: () => null,
        territoryColor: () => ({ toHex: () => "#123456" }),
      }),
      playerCardOf: () => ({
        card: { background: "bg_pacific", trackers: [] },
        flag: undefined,
      }),
    };
    modal.setEndCard(() => ({ kind: "eliminatedBy", clientID: "KILLER01" }));
    await vi.waitFor(() => expect(modal.loadout[0]?.item.priceHard).toBe(240));
    // A cohort catalog, or a price_changed refusal's reload, lands.
    document.dispatchEvent(
      new CustomEvent(COSMETICS_CHANGED, { detail: withBackground(300) }),
    );
    await vi.waitFor(() => expect(modal.loadout[0]?.item.priceHard).toBe(300));
    catalogue.cached = null;
  });

  it("a plain catalog that lands after the cohort one doesn't replace it", async () => {
    const withBackground = (priceHard: number) => ({
      patterns: {},
      flags: {},
      cardBackgrounds: {
        bg_pacific: {
          product: null,
          rarity: "epic",
          name: "bg_pacific",
          url: "/bg.webp",
          priceHard,
        },
      },
    });
    // Joined by direct link: nothing cached, and the plain catalog (R1) is
    // still out when the card is chosen.
    catalogue.cached = null;
    let landR1!: (c: unknown) => void;
    catalogue.fetched = new Promise((resolve) => (landR1 = resolve));
    const modal = (await renderModal({})) as unknown as {
      game: unknown;
      setEndCard(choose: () => unknown): void;
      loadout: { item: { priceHard?: number } }[];
    };
    modal.game = {
      myPlayer: () => null,
      gameID: () => "g1",
      config: () => ({ gameConfig: () => ({}) }),
      resumedFromSave: () => false,
      playerByClientID: () => ({
        name: () => "Volt",
        clanTag: () => null,
        territoryColor: () => ({ toHex: () => "#123456" }),
      }),
      playerCardOf: () => ({
        card: { background: "bg_pacific", trackers: [] },
        flag: undefined,
      }),
    };
    modal.setEndCard(() => ({ kind: "eliminatedBy", clientID: "KILLER01" }));
    // The group lands: the cohort catalog (R2) is cached and announced.
    const cohort = withBackground(300);
    catalogue.cached = cohort;
    document.dispatchEvent(
      new CustomEvent(COSMETICS_CHANGED, { detail: cohort }),
    );
    // Then R1 lands late, with the plain price.
    landR1(withBackground(240));
    await new Promise((r) => setTimeout(r, 0));
    await vi.waitFor(() => expect(modal.loadout[0]?.item.priceHard).toBe(300));
    // And stays there once everything has settled.
    await new Promise((r) => setTimeout(r, 0));
    expect(modal.loadout[0]?.item.priceHard).toBe(300);
    catalogue.cached = null;
    catalogue.fetched = null;
  });

  it("a failure choosing the card leaves today's screen", async () => {
    const modal = (await renderModal({
      endCardMode: "eliminatedBy",
      endCardView: defaultPlayerCardView("Volt", "UN"),
    })) as unknown as {
      game: unknown;
      setEndCard(choose: () => unknown): void;
      endCardMode: string;
    };
    // A game without the card lookups (an older view, a test double).
    modal.game = {
      myPlayer: () => null,
      gameID: () => "g1",
      config: () => ({ gameConfig: () => ({}) }),
      resumedFromSave: () => false,
    };
    expect(() =>
      modal.setEndCard(() => {
        throw new TypeError("playerCardOf is not a function");
      }),
    ).not.toThrow();
    expect(modal.endCardMode).toBe("none");
  });

  it("no card shows today's screen", async () => {
    const modal = await renderModal({ endCardMode: "none" });
    expect(modal.querySelector("[data-end-card]")).toBeNull();
  });

  it("promo slot, buttons and ffa panel unchanged", async () => {
    const actions = (modal: HTMLElement) =>
      [...modal.querySelectorAll("[data-win-action]")].map((a) =>
        a.getAttribute("data-win-action"),
      );
    const without = await renderModal({ endCardMode: "none", rand: 0.9 });
    const before = {
      actions: actions(without),
      promo: without.querySelector("[data-win-cosmetic-promo]") !== null,
    };
    expect(before.actions.length).toBeGreaterThan(0);
    document.body.innerHTML = "";
    const withCard = await renderModal({
      endCardMode: "winner",
      endCardView: defaultPlayerCardView("Volt", "UN"),
      rand: 0.9,
    });
    expect({
      actions: actions(withCard),
      promo: withCard.querySelector("[data-win-cosmetic-promo]") !== null,
    }).toEqual(before);
  });
});

// One "Get the look" block in the promo slot: the killer's look first, then
// looks saved from the player panel this game, newest first, filtered against
// what the viewer owns now. It takes the slot from Steam, Discord, tutorial
// and skins; without a look the promo is as today.
// openfront-light: the "Get the look" block (and buying from it) is one of
// the end-of-game promos removed from WinModal.innerHtml(), so its upstream
// suites are dropped.

describe("WinModal: signed in is the session, not the profile read", () => {
  type Modal = HTMLElement & {
    applyUserMe(me: unknown): Promise<void>;
    signedIn: boolean;
    viewerFlares: readonly string[] | null;
  };
  afterEach(() => {
    auth.session = true;
    auth.expired = false;
    auth.throws = false;
    auth.real = false;
    clearLocalSession();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  // The real userAuth, no token in memory (none yet, or expired and
  // dropped), and /auth/refresh answering `status`.
  const refreshAnswers = (status: number) => {
    auth.real = true;
    // The local API base, as AuthRefreshFailure.test.ts sets it.
    vi.spyOn(ClientEnv, "jwtAudience").mockReturnValue("localhost");
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status,
        ok: status >= 200 && status < 300,
        json: async () => ({}),
      })),
    );
  };

  it("the refresh gets a 503: couldn't check, so still signed in (real Buy buttons)", async () => {
    // A transient refresh failure keeps the refresh cookie: the session may
    // be fine. "Sign in to buy" would send the player out of their game to
    // sign in to an account they're signed in to.
    refreshAnswers(503);
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(true);
    expect(modal.viewerFlares).toEqual([]);
  });

  it("the refresh gets a 401: the session is dead, signed out", async () => {
    refreshAnswers(401);
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(false);
  });

  it("a guest already known signed out: no refresh, no logout", async () => {
    // Boot's refresh got its 401 (and logout): "signed out" is settled.
    refreshAnswers(401);
    await userAuth();
    await vi.waitFor(() => expect(knownSignedOut()).toBe(true));
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockClear();
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a failed profile read with a session: still signed in, no flares", async () => {
    auth.session = true;
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(true);
    expect(modal.viewerFlares).toEqual([]);
  });

  it("a cached failed read and a token near expiry after a long game: still signed in", async () => {
    // /users/@me failed at boot (false cached, so no request now), and the
    // 15-minute token has expired over a 20-minute game; the refresh cookie
    // is still good.
    auth.session = true;
    auth.expired = true;
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(true);
  });

  it("reading the viewer never rejects, even if its fallback throws", async () => {
    // getUserMe fails (it catches the throw and answers false), then the
    // session check in the fallback throws too: nothing may escape the
    // fire-and-forget call in show().
    auth.throws = true;
    const modal = (await renderModal({ endCardMode: "none" })) as Modal & {
      loadViewerFlares(): Promise<void>;
    };
    await expect(modal.loadViewerFlares()).resolves.toBeUndefined();
  });

  it("no session: signed out", async () => {
    auth.session = false;
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe(false);
    expect(modal.signedIn).toBe(false);
  });

  it("a profile: signed in, with its flares", async () => {
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    await modal.applyUserMe({ player: { flares: ["taunt:salute"] } });
    expect(modal.signedIn).toBe(true);
    expect(modal.viewerFlares).toEqual(["taunt:salute"]);
  });

  it("an older answer landing late doesn't overwrite a newer one", async () => {
    auth.session = false;
    const modal = (await renderModal({ endCardMode: "none" })) as Modal;
    // The failed read waits on its session check...
    const first = modal.applyUserMe(false);
    // ...while a fresh profile arrives and decides.
    await modal.applyUserMe({ player: { flares: [] } });
    await first;
    expect(modal.signedIn).toBe(true);
  });
});
