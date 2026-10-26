package tickets

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"mikan/internal/panel/events"
	"mikan/internal/panel/model"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store/db"
	"mikan/internal/panel/store/storetest"
)

// A ticket's life: refused while off, opened by the account, answered by the admin (who tells
// the account through the feed), closed and opened again; only its account sees it.
func TestTickets(t *testing.T) {
	ctx := context.Background()
	st, err := storetest.Open(ctx, t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer st.Close()
	clock := time.Unix(1_800_000_000, 0)
	s := New(st, settings.New(st.Q), func() time.Time { return clock }, events.NewHub())
	told := 0
	s.SetNotifier(func(context.Context, db.Ticket, db.TicketMessage) { told++ })
	const tg, other = 1001, 1002

	if _, err := s.Post(ctx, tg, 0, SourceBot, "hello", ""); !errors.Is(err, ErrOff) {
		t.Fatalf("post while off: %v", err)
	}
	if err := s.SetConfig(ctx, Config{Enabled: true}); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Post(ctx, tg, 0, SourceBot, "   ", ""); !errors.Is(err, ErrEmpty) {
		t.Fatalf("empty post: %v", err)
	}
	tk, err := s.Post(ctx, tg, 0, SourceMiniApp, "No internet\nsince morning", "")
	if err != nil {
		t.Fatal(err)
	}
	if tk.Subject != "No internet" || tk.Status != model.TicketOpen || told != 1 {
		t.Fatalf("new ticket %+v, told %d", tk, told)
	}
	for i := 1; i < MaxOpen; i++ {
		if _, err := s.Post(ctx, tg, 0, SourceBot, "more "+strings.Repeat("x", i), ""); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.Post(ctx, tg, 0, SourceBot, "one too many", ""); !errors.Is(err, ErrMany) {
		t.Fatalf("past MaxOpen: %v", err)
	}
	if _, _, err := s.Thread(ctx, other, tk.ID); !errors.Is(err, ErrGone) {
		t.Fatalf("someone else's ticket: %v", err)
	}
	if _, err := s.Post(ctx, other, tk.ID, SourceBot, "mine?", ""); !errors.Is(err, ErrGone) {
		t.Fatalf("post to someone else's ticket: %v", err)
	}

	if _, err := s.Reply(ctx, tk.ID, 0, "Restart the app"); err != nil {
		t.Fatal(err)
	}
	evs, err := st.Q.ListAddonEvents(ctx, db.ListAddonEventsParams{Types: []string{events.TicketReply}, Lim: 10})
	if err != nil || len(evs) != 1 || !evs[0].TgID.Valid || evs[0].TgID.Int64 != tg {
		t.Fatalf("reply event %+v %v", evs, err)
	}
	if s.Unread(ctx, tg) != 1 {
		t.Fatalf("unread answers %d", s.Unread(ctx, tg))
	}
	got, msgs, err := s.Thread(ctx, tg, tk.ID)
	if err != nil || got.Status != model.TicketAnswered || len(msgs) != 2 || !msgs[1].FromAdmin {
		t.Fatalf("thread %+v %+v %v", got, msgs, err)
	}
	if s.Unread(ctx, tg) != 0 {
		t.Fatal("the answer stays unread after the thread")
	}

	closed, err := s.SetStatus(ctx, tk.ID, true)
	if err != nil || closed.Status != model.TicketClosed {
		t.Fatalf("close %+v %v", closed, err)
	}
	if evs, _ := st.Q.ListAddonEvents(ctx, db.ListAddonEventsParams{Types: []string{events.TicketClosed}, Lim: 10}); len(evs) != 1 {
		t.Fatalf("closed events %d", len(evs))
	}
	again, err := s.SetStatus(ctx, tk.ID, false)
	if err != nil || again.Status != model.TicketAnswered {
		t.Fatalf("reopen after the admin spoke last: %+v %v", again, err)
	}
	if err := s.Close(ctx, tg, tk.ID); err != nil {
		t.Fatal(err)
	}
	clock = clock.Add(time.Minute)
	if tk, err = s.Post(ctx, tg, tk.ID, SourceBot, "still broken", ""); err != nil || tk.Status != model.TicketOpen {
		t.Fatalf("a message opens a closed ticket: %+v %v", tk, err)
	}

	counts, err := s.Counts(ctx)
	if err != nil || counts[model.TicketOpen].All != MaxOpen {
		t.Fatalf("counts %+v %v", counts, err)
	}
	list, err := s.List(ctx, model.TicketOpen, 0, 0, 50)
	if err != nil || len(list) != MaxOpen || list[0].ID != tk.ID {
		t.Fatalf("list %d %v", len(list), err)
	}
	if err := s.Delete(ctx, tk.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(ctx, tk.ID); !errors.Is(err, ErrGone) {
		t.Fatalf("delete twice: %v", err)
	}
}
