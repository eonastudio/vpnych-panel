// Package status is the public status page: the nodes with a public name, whether each
// answers the panel now and the share of its health checks it answered on each of the last
// days (node_uptime, counted by nodesync). The admin turns it on and names it; the page is
// served at <subscription address>/status (subs), as HTML or, with ?format=json, as JSON.
package status

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"mikan/internal/panel/nodesync"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store"
)

// Key is the setting of the page (Config).
const Key = "status_page"

// The days the page may show; DefaultDays when unset.
var DayChoices = []int{30, 60, 90}

const (
	DefaultDays = 90
	MaxTitle    = 80
)

var (
	ErrBadDays  = errors.New("bad_status_days")
	ErrBadTitle = errors.New("bad_status_title")
)

// Config is the admin's: the page is off until Enabled; Title "" is the brand.
type Config struct {
	Enabled bool   `json:"enabled"`
	Title   string `json:"title"`
	Days    int    `json:"days"`
}

// The node's state now.
const (
	Up      = "up"
	Down    = "down"
	Unknown = "unknown" // no check of it is known yet
)

// PageDay is one day of a node: Checks made, OK answered. Checks 0: nothing is known of the day.
type PageDay struct {
	Day    int64 `json:"day" doc:"Начало дня (UTC), unix-секунды"`
	Checks int64 `json:"checks"`
	OK     int64 `json:"ok"`
}

// PageNode is a public node on the page.
type PageNode struct {
	ID     int64     `json:"-"`
	Name   string    `json:"name"`
	State  string    `json:"state" enum:"up,down,unknown"`
	Since  int64     `json:"since,omitempty" doc:"С какого момента нода не отвечает, unix-секунды"`
	Uptime float64   `json:"uptime" doc:"Доля ответов за показанные дни, 0..1; -1 — проверок не было"`
	Days   []PageDay `json:"days"`
}

// PageReport is the page's content.
type PageReport struct {
	Days    int        `json:"days"`
	Nodes   []PageNode `json:"nodes"`
	Updated int64      `json:"updated" doc:"Когда собрано, unix-секунды"`
}

// Overall: Up when every node answers, Down when none does, "partial" between; Unknown
// without nodes or checks.
func (r PageReport) Overall() string {
	up, down := 0, 0
	for _, n := range r.Nodes {
		switch n.State {
		case Up:
			up++
		case Down:
			down++
		}
	}
	switch {
	case up == 0 && down == 0:
		return Unknown
	case down == 0:
		return Up
	case up == 0:
		return Down
	}
	return "partial"
}

// cacheFor: a public page is asked by anyone, as often as they like; the database is asked
// at most this often.
const cacheFor = 30 * time.Second

type Service struct {
	st  *store.Store
	set *settings.Settings
	now func() time.Time

	mu     sync.Mutex
	cached PageReport
	at     time.Time
}

func New(st *store.Store, set *settings.Settings, now func() time.Time) *Service {
	return &Service{st: st, set: set, now: now}
}

func (s *Service) Config(ctx context.Context) Config {
	c, _, _ := settings.Get[Config](ctx, s.set, Key)
	if !validDays(c.Days) {
		c.Days = DefaultDays
	}
	return c
}

func validDays(d int) bool {
	for _, c := range DayChoices {
		if d == c {
			return true
		}
	}
	return false
}

func (s *Service) SetConfig(ctx context.Context, c Config) error {
	if !validDays(c.Days) {
		return ErrBadDays
	}
	c.Title = strings.TrimSpace(c.Title)
	if utf8.RuneCountInString(c.Title) > MaxTitle {
		return ErrBadTitle
	}
	if err := settings.Set(ctx, s.set, Key, c); err != nil {
		return err
	}
	s.mu.Lock()
	s.at = time.Time{}
	s.mu.Unlock()
	return nil
}

// Report is the page's content, at most cacheFor old.
func (s *Service) Report(ctx context.Context) (PageReport, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if !s.at.IsZero() && now.Sub(s.at) < cacheFor && !now.Before(s.at) {
		return s.cached, nil
	}
	r, err := s.build(ctx, now)
	if err != nil {
		return PageReport{}, err
	}
	s.cached, s.at = r, now
	return r, nil
}

func (s *Service) build(ctx context.Context, now time.Time) (PageReport, error) {
	days := s.Config(ctx).Days
	today := nodesync.UptimeDay(now)
	first := today - int64(days-1)*86400
	nodes, err := s.st.Q.ListNodes(ctx)
	if err != nil {
		return PageReport{}, err
	}
	rows, err := s.st.Q.ListNodeUptime(ctx, first)
	if err != nil {
		return PageReport{}, err
	}
	byNode := map[int64]map[int64]PageDay{}
	for _, r := range rows {
		if byNode[r.NodeID] == nil {
			byNode[r.NodeID] = map[int64]PageDay{}
		}
		byNode[r.NodeID][r.Day] = PageDay{Day: r.Day, Checks: r.Checks, OK: r.Ok}
	}
	out := PageReport{Days: days, Nodes: []PageNode{}, Updated: now.Unix()}
	for _, n := range nodes {
		name := strings.TrimSpace(n.PublicName)
		if n.Enabled == 0 || name == "" {
			continue
		}
		node := PageNode{ID: n.ID, Name: name, State: Unknown, Uptime: -1, Days: make([]PageDay, 0, days)}
		var checks, ok int64
		for d := first; d <= today; d += 86400 {
			day, seen := byNode[n.ID][d]
			if !seen {
				day = PageDay{Day: d}
			}
			checks += day.Checks
			ok += day.OK
			node.Days = append(node.Days, day)
		}
		if checks > 0 {
			node.Uptime = float64(ok) / float64(checks)
			node.State = Up
		}
		// What the node's liveness told last (nodesync/liveness.go): "up" or "down:<since>".
		told, err := s.st.Q.GetNodeState(ctx, "health/"+strconv.FormatInt(n.ID, 10))
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return PageReport{}, err
		}
		if rest, down := strings.CutPrefix(told, "down:"); down {
			node.State = Down
			node.Since, _ = strconv.ParseInt(rest, 10, 64)
		} else if told == "up" {
			node.State = Up
		}
		out.Nodes = append(out.Nodes, node)
	}
	return out, nil
}
