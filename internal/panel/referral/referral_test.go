package referral

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"mikan/internal/panel/domain"
	"mikan/internal/panel/events"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store/db"
	"mikan/internal/panel/store/storetest"
)

type noChanges struct{}

func (noChanges) PoliciesChanged() {}
func (noChanges) SlotsChanged()    {}

// The program's life: refused while off, a friend tagged by the link once and never a customer
// or the owner itself; the friend's first paid tariff extends the owner's subscription once,
// and an owner without one gets the days on the first it buys.
func TestReferral(t *testing.T) {
	ctx := context.Background()
	st, err := storetest.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	clock := time.Unix(1_800_000_000, 0)
	now := func() time.Time { return clock }
	if err := domain.Seed(ctx, st, clock); err != nil {
		t.Fatal(err)
	}
	ts, err := st.Q.ListTariffs(ctx)
	if err != nil || len(ts) == 0 {
		t.Fatalf("tariffs %v", err)
	}
	users := domain.NewUsers(st, domain.NewPool(st, now), noChanges{}, now)
	s := New(st, settings.New(st.Q), users, now, func(context.Context) string { return "https://t.me/vpnbot" })

	// sub makes a subscription of tg.
	sub := func(tg int64) db.User {
		t.Helper()
		u, err := users.Create(ctx, domain.CreateInput{Name: "x", TariffID: ts[0].ID})
		if err != nil {
			t.Fatal(err)
		}
		if err := st.Q.LinkTg(ctx, db.LinkTgParams{UserID: u.ID, TgID: tg, CreatedAt: clock.Unix()}); err != nil {
			t.Fatal(err)
		}
		u, _ = st.Q.GetUser(ctx, u.ID)
		return u
	}
	// pay is tg's paid tariff, given to its subscription u.
	pay := func(tg int64, u db.User) {
		t.Helper()
		p, err := st.Q.CreatePayment(ctx, db.CreatePaymentParams{Provider: "stars", Payload: "p" + time.Now().String(), TgID: tg, Kind: "new", TariffID: sql.NullInt64{Int64: ts[0].ID, Valid: true}, TariffName: ts[0].Name, Amount: 10000, Currency: "RUB", CreatedAt: clock.Unix()})
		if err != nil {
			t.Fatal(err)
		}
		if err := st.Tx(ctx, func(q *db.Queries) error { return s.Paid(ctx, q, p, u.ID) }); err != nil {
			t.Fatal(err)
		}
	}
	expiry := func(id int64) int64 {
		u, err := st.Q.GetUser(ctx, id)
		if err != nil {
			t.Fatal(err)
		}
		return u.ExpiresAt.Int64
	}
	const owner, friend, customer = 100, 200, 300

	if r, err := s.Of(ctx, owner); err != nil || r.Enabled || r.Link != "" {
		t.Fatalf("off: %+v %v", r, err)
	}
	if err := s.SetConfig(ctx, Config{Enabled: true, Days: MaxDays + 1}); !errors.Is(err, ErrBadDays) {
		t.Fatalf("too many days: %v", err)
	}
	if err := s.SetConfig(ctx, Config{Enabled: true, Days: 7}); err != nil {
		t.Fatal(err)
	}
	ownerSub := sub(owner)
	r, err := s.Of(ctx, owner)
	if err != nil || !r.Enabled || r.Days != 7 || !strings.HasPrefix(r.Link, "https://t.me/vpnbot?start=r_") {
		t.Fatalf("owner's program %+v %v", r, err)
	}
	code := strings.TrimPrefix(r.Link, "https://t.me/vpnbot?start=r_")
	if again, _ := s.Link(ctx, owner); again != r.Link {
		t.Fatalf("the link changed: %q %q", again, r.Link)
	}

	if ok, _ := s.Tag(ctx, owner, code); ok {
		t.Fatal("the owner is its own friend")
	}
	sub(customer)
	if ok, _ := s.Tag(ctx, customer, code); ok {
		t.Fatal("a customer became a friend")
	}
	if ok, err := s.Tag(ctx, friend, "nope"); ok || err != nil {
		t.Fatalf("unknown code: %v %v", ok, err)
	}
	if ok, err := s.Tag(ctx, friend, strings.ToUpper(code)); !ok || err != nil {
		t.Fatalf("tag: %v %v", ok, err)
	}

	before := expiry(ownerSub.ID)
	friendSub := sub(friend)
	pay(friend, friendSub)
	if got := expiry(ownerSub.ID); got != before+7*86400 {
		t.Fatalf("owner's expiry %d, want %d", got, before+7*86400)
	}
	pay(friend, friendSub)
	if got := expiry(ownerSub.ID); got != before+7*86400 {
		t.Fatal("a second payment rewarded again")
	}
	r, _ = s.Of(ctx, owner)
	if r.Invited != 1 || r.Paid != 1 || r.Earned != 7 || r.Waiting != 0 {
		t.Fatalf("owner's numbers %+v", r)
	}
	evs, err := st.Q.ListAddonEvents(ctx, db.ListAddonEventsParams{Types: []string{events.ReferralReward}, Lim: 10})
	if err != nil || len(evs) != 1 || evs[0].TgID.Int64 != owner {
		t.Fatalf("reward events %+v %v", evs, err)
	}

	// An owner without a subscription: the days wait for the first one it buys.
	const lone, friend2 = 400, 500
	lr, _ := s.Of(ctx, lone)
	if ok, _ := s.Tag(ctx, friend2, strings.TrimPrefix(lr.Link, "https://t.me/vpnbot?start=r_")); !ok {
		t.Fatal("tag of the second friend")
	}
	pay(friend2, sub(friend2))
	if lr, _ = s.Of(ctx, lone); lr.Waiting != 7 || lr.Earned != 0 {
		t.Fatalf("waiting %+v", lr)
	}
	loneSub := sub(lone)
	start := expiry(loneSub.ID)
	pay(lone, loneSub)
	if got := expiry(loneSub.ID); got != start+7*86400 {
		t.Fatalf("collected expiry %d, want %d", got, start+7*86400)
	}
	if lr, _ = s.Of(ctx, lone); lr.Waiting != 0 || lr.Earned != 7 {
		t.Fatalf("after collecting %+v", lr)
	}
	tot, err := s.Totals(ctx)
	if err != nil || tot.Invited != 2 || tot.Paid != 2 || tot.Earned != 14 || tot.Referrers != 2 {
		t.Fatalf("totals %+v %v", tot, err)
	}
	if top, err := s.Top(ctx, 10); err != nil || len(top) != 2 {
		t.Fatalf("top %+v %v", top, err)
	}
	if recent, err := s.Recent(ctx, 10); err != nil || len(recent) != 2 {
		t.Fatalf("recent %+v %v", recent, err)
	}
}
