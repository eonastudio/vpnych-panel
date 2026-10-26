package nodesync

import (
	"context"
	"time"

	"mikan/internal/panel/store/db"
)

// uptime counts the node's health checks of the day for the public status page (node_uptime).
// The counts go to the table about once a minute and when the day turns, so a check costs no
// write; the checks of the last minute before the panel stops are lost, which a day's share
// does not feel. Only observe touches it, under liveness.mu.
type uptime struct {
	day, checks, ok int64
	flushed         time.Time
}

const (
	uptimeFlushEvery = time.Minute
	// UptimeKeep is how far back the days are kept: the status page shows at most 90.
	UptimeKeep = 100 * 24 * time.Hour
)

// UptimeDay is the start of t's UTC day, the day of node_uptime.
func UptimeDay(t time.Time) int64 { return t.UTC().Truncate(24 * time.Hour).Unix() }

func (s *Syncer) countUptime(ctx context.Context, view *HealthView) {
	u := &s.up
	day := UptimeDay(view.CheckedAt)
	if u.checks > 0 && day != u.day {
		s.flushUptime(ctx, view.CheckedAt)
		u.checks, u.ok = 0, 0 // a day that failed to be written is not given to the next
	}
	if u.flushed.IsZero() {
		u.flushed = view.CheckedAt
	}
	u.day = day
	u.checks++
	if view.OK {
		u.ok++
	}
	if view.CheckedAt.Sub(u.flushed) >= uptimeFlushEvery {
		s.flushUptime(ctx, view.CheckedAt)
	}
}

// flushUptime adds the counts to the day's row; on failure they wait for the next try.
func (s *Syncer) flushUptime(ctx context.Context, now time.Time) {
	u := &s.up
	err := s.m.st.Q.AddNodeUptime(ctx, db.AddNodeUptimeParams{NodeID: s.id, Day: u.day, Checks: u.checks, Ok: u.ok})
	if err != nil {
		s.log.Warn("node uptime: the checks are not kept", "err", err)
		return
	}
	u.checks, u.ok, u.flushed = 0, 0, now
}
