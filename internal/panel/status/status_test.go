package status

import (
	"bytes"
	"context"
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"

	"mikan/internal/panel/domain"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store/db"
	"mikan/internal/panel/store/storetest"
)

// The page shows the enabled nodes with a public name, each with its state as last told and
// its days, those without checks among them; the overall line follows the states.
func TestReport(t *testing.T) {
	ctx := context.Background()
	st, err := storetest.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	clock := time.Unix(1_800_000_000, 0) // 08:00 UTC
	now := func() time.Time { return clock }
	if err := domain.Seed(ctx, st, clock); err != nil {
		t.Fatal(err)
	}
	s := New(st, settings.New(st.Q), now)

	if c := s.Config(ctx); c.Enabled || c.Days != DefaultDays {
		t.Fatalf("default %+v", c)
	}
	if err := s.SetConfig(ctx, Config{Days: 45}); !errors.Is(err, ErrBadDays) {
		t.Fatalf("45 days: %v", err)
	}
	if err := s.SetConfig(ctx, Config{Days: 30, Title: strings.Repeat("я", MaxTitle+1)}); !errors.Is(err, ErrBadTitle) {
		t.Fatalf("long title: %v", err)
	}
	if err := s.SetConfig(ctx, Config{Enabled: true, Days: 30, Title: "  Наш статус "}); err != nil {
		t.Fatal(err)
	}
	if c := s.Config(ctx); !c.Enabled || c.Days != 30 || c.Title != "Наш статус" {
		t.Fatalf("saved %+v", c)
	}

	node := func(name, public string, enabled int64) int64 {
		t.Helper()
		n, err := st.Q.CreateNode(ctx, db.CreateNodeParams{Name: name, Address: name + ":443", CreatedAt: 1, UpdatedAt: 1})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := st.Q.UpdateNode(ctx, db.UpdateNodeParams{Name: name, Address: n.Address, PublicName: public, Enabled: enabled, UpdatedAt: 1, ID: n.ID}); err != nil {
			t.Fatal(err)
		}
		return n.ID
	}
	de := node("de-1", "Германия", 1)
	nl := node("nl-1", "Нидерланды", 1)
	node("hidden", "", 1)
	node("off", "Выключена", 0)
	fresh := node("fi-1", "Финляндия", 1)

	today := clock.UTC().Truncate(24 * time.Hour).Unix()
	add := func(id, day, checks, ok int64) {
		t.Helper()
		if err := st.Q.AddNodeUptime(ctx, db.AddNodeUptimeParams{NodeID: id, Day: day, Checks: checks, Ok: ok}); err != nil {
			t.Fatal(err)
		}
	}
	add(de, today, 100, 100)
	add(de, today-86400, 100, 90)
	add(de, today-40*86400, 100, 0) // beyond the 30 days shown
	add(nl, today, 200, 150)
	if err := st.Q.SetNodeState(ctx, db.SetNodeStateParams{Key: "health/" + strconv.FormatInt(nl, 10), Value: "down:1799990000"}); err != nil {
		t.Fatal(err)
	}

	r, err := s.Report(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if r.Days != 30 || len(r.Nodes) != 3 {
		t.Fatalf("report %+v", r)
	}
	byName := map[string]PageNode{}
	for _, n := range r.Nodes {
		if len(n.Days) != 30 || n.Days[29].Day != today || n.Days[0].Day != today-29*86400 {
			t.Fatalf("days of %s: %d, last %d", n.Name, len(n.Days), n.Days[len(n.Days)-1].Day)
		}
		byName[n.Name] = n
	}
	if n := byName["Германия"]; n.State != Up || n.Uptime != 0.95 || n.Days[28].OK != 90 {
		t.Fatalf("de %+v", n)
	}
	if n := byName["Нидерланды"]; n.State != Down || n.Since != 1799990000 || n.Uptime != 0.75 {
		t.Fatalf("nl %+v", n)
	}
	if n := byName["Финляндия"]; n.State != Unknown || n.Uptime != -1 {
		t.Fatalf("fi %+v", n)
	}
	if r.Overall() != "partial" {
		t.Fatalf("overall %s", r.Overall())
	}

	// The report is kept a while: a check added now shows only after cacheFor.
	add(fresh, today, 10, 10)
	if r2, _ := s.Report(ctx); r2.Nodes[2].State != Unknown {
		t.Fatal("not cached")
	}
	clock = clock.Add(cacheFor)
	if r2, _ := s.Report(ctx); r2.Nodes[2].State != Up {
		t.Fatalf("stale %+v", r2.Nodes[2])
	}

	var buf bytes.Buffer
	if err := Render(&buf, r, "Наш статус", "ВПНыч", "ru"); err != nil {
		t.Fatal(err)
	}
	page := buf.String()
	for _, want := range []string{`lang="ru"`, "Наш статус", "Часть серверов недоступна", "Германия", "95% аптайм", "не отвечает с", "30 дн. назад", `class="ok"`, `class="bad"`, `class="none"`} {
		if !strings.Contains(page, want) {
			t.Fatalf("the page lacks %q", want)
		}
	}
	buf.Reset()
	if err := Render(&buf, PageReport{Days: 90, Nodes: []PageNode{}}, "", "<b>", "en"); err != nil {
		t.Fatal(err)
	}
	if page := buf.String(); !strings.Contains(page, "Server status") || !strings.Contains(page, "No servers to show yet.") || strings.Contains(page, "<b>") {
		t.Fatalf("empty english page:\n%s", page)
	}
}

func TestLang(t *testing.T) {
	for _, c := range []struct{ accept, panel, want string }{
		{"ru-RU,ru;q=0.9", "en", "ru"},
		{"en-US", "ru", "en"},
		{"", "ru", "ru"},
		{"", "", "en"},
		{"de", "ru", "en"},
	} {
		if got := Lang(c.accept, c.panel); got != c.want {
			t.Errorf("Lang(%q, %q) = %s, want %s", c.accept, c.panel, got, c.want)
		}
	}
}

func TestPercent(t *testing.T) {
	for v, want := range map[float64]string{1: "100%", 0.99996: "99.99%", 0.95: "95%", 0.1234: "12.34%", 0: "0%"} {
		if got := percent(v); got != want {
			t.Errorf("percent(%v) = %s, want %s", v, got, want)
		}
	}
}
