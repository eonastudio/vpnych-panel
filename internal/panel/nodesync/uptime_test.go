package nodesync

import (
	"context"
	"errors"
	"testing"
	"time"

	"mikan/internal/nodeapi"
	"mikan/internal/panel/store/db"
)

// The checks of a day reach node_uptime about once a minute, and a new day starts a row of
// its own; a day's failed checks are counted with the rest.
func TestUptimeIsCountedByDay(t *testing.T) {
	s, fake, st, _, now := setup(t)
	ctx := context.Background()
	n := &sick{fakeNode: fake}
	s.node = n
	check := func(times int) {
		for range times {
			*now = now.Add(5 * time.Second)
			s.refreshHealth(ctx)
		}
	}
	rows := func() []db.NodeUptime {
		t.Helper()
		r, err := st.Q.ListNodeUptime(ctx, 0)
		if err != nil {
			t.Fatal(err)
		}
		return r
	}
	day := UptimeDay(*now)

	check(5)
	if r := rows(); len(r) != 0 {
		t.Fatalf("written before a minute passed: %+v", r)
	}
	check(8) // 13 checks, 60 s since the first
	if r := rows(); len(r) != 1 || r[0].NodeID != s.id || r[0].Day != day || r[0].Checks != 13 || r[0].Ok != 13 {
		t.Fatalf("after a minute: %+v", r)
	}
	n.err = errors.Join(nodeapi.ErrUnavailable, context.DeadlineExceeded)
	check(12)
	if r := rows(); len(r) != 1 || r[0].Checks != 25 || r[0].Ok != 13 {
		t.Fatalf("after failures: %+v", r)
	}

	n.err = nil
	check(1)                                   // waits in memory
	*now = time.Unix(day+86400+30, 0).UTC() // the next day
	s.refreshHealth(ctx)
	r := rows()
	if len(r) != 1 || r[0].Checks != 26 || r[0].Ok != 14 {
		t.Fatalf("the day's last checks: %+v", r)
	}
	check(12)
	if r = rows(); len(r) != 2 || r[1].Day != day+86400 || r[1].Checks != 13 || r[1].Ok != 13 {
		t.Fatalf("the next day: %+v", r)
	}
}
