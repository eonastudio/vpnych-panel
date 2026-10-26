// Package referral is the referral program: every Telegram account has its own link to the bot
// (/start r_<code>); an account that comes by it before it has a subscription or a payment is
// the link owner's friend. The friend's first paid tariff gives the owner Config.Days on its
// subscription, or, while it has none, the days wait for the first one it buys. The owner
// hears of it through the feed of events (events.ReferralReward), which the bot tells in the
// chat.
package referral

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"strconv"
	"strings"
	"time"

	"mikan/internal/panel/domain"
	"mikan/internal/panel/events"
	"mikan/internal/panel/events/feed"
	"mikan/internal/panel/model"
	"mikan/internal/panel/settings"
	"mikan/internal/panel/store"
	"mikan/internal/panel/store/db"
)

// Key is the setting of the program (Config).
const Key = "referral"

// Limits of Config.Days.
const (
	DefaultDays = 7
	MaxDays     = 365
)

// codeLen: the characters of a referral code.
const codeLen = 8

// ErrBadDays: Config.Days out of 1..MaxDays.
var ErrBadDays = errors.New("bad_days")

// Config is the admin's setup of the program.
type Config struct {
	Enabled bool  `json:"enabled"`
	Days    int64 `json:"days"` // to the referrer for a friend's first paid tariff
}

// Service keeps the referral program.
type Service struct {
	st    *store.Store
	set   *settings.Settings
	users *domain.Users
	now   func() time.Time
	// bot is the bot's address (https://t.me/<name>); "" while the bot is not running.
	bot func(ctx context.Context) string
}

func New(st *store.Store, set *settings.Settings, users *domain.Users, now func() time.Time, bot func(ctx context.Context) string) *Service {
	return &Service{st: st, set: set, users: users, now: now, bot: bot}
}

// Config is the admin's setup; off with DefaultDays when never saved.
func (s *Service) Config(ctx context.Context) Config {
	c, _, _ := settings.Get[Config](ctx, s.set, Key)
	if c.Days < 1 {
		c.Days = DefaultDays
	}
	return c
}

func (s *Service) SetConfig(ctx context.Context, c Config) error {
	if c.Days < 1 || c.Days > MaxDays {
		return ErrBadDays
	}
	return settings.Set(ctx, s.set, Key, c)
}

// On: the accounts have their links and earn by them.
func (s *Service) On(ctx context.Context) bool { return s.Config(ctx).Enabled }

// Code is the account's referral code, made on the first ask.
func (s *Service) Code(ctx context.Context, tgID int64) (string, error) {
	for range 5 {
		code, err := s.st.Q.GetReferralCode(ctx, tgID)
		if err == nil {
			return code, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return "", err
		}
		// A taken code (or the account's own, made at once elsewhere) writes nothing: the
		// next round reads what is there or tries another.
		if _, err := s.st.Q.CreateReferralCode(ctx, db.CreateReferralCodeParams{TgID: tgID, Code: newCode(), CreatedAt: s.now().Unix()}); err != nil {
			return "", err
		}
	}
	return "", errors.New("referral: no free code")
}

const alphabet = "abcdefghjkmnpqrstuvwxyz23456789"

func newCode() string {
	b := make([]byte, codeLen)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = alphabet[int(b[i])%len(alphabet)]
	}
	return string(b)
}

// Link is the account's referral link; "" while the bot is not running.
func (s *Service) Link(ctx context.Context, tgID int64) (string, error) {
	bot := ""
	if s.bot != nil {
		bot = s.bot(ctx)
	}
	if bot == "" {
		return "", nil
	}
	code, err := s.Code(ctx, tgID)
	if err != nil {
		return "", err
	}
	return bot + "?start=" + model.ReferralPrefix + code, nil
}

// Of is the account's program: its link and its friends.
func (s *Service) Of(ctx context.Context, tgID int64) (model.Referral, error) {
	cfg := s.Config(ctx)
	r := model.Referral{Enabled: cfg.Enabled, Days: cfg.Days}
	if !cfg.Enabled {
		return r, nil
	}
	var err error
	if r.Link, err = s.Link(ctx, tgID); err != nil {
		return r, err
	}
	st, err := s.st.Q.ReferralStatsOf(ctx, tgID)
	if err != nil {
		return r, err
	}
	r.Invited, r.Paid, r.Earned, r.Waiting = st.Invited, st.Paid, st.Earned, st.Waiting
	return r, nil
}

// Tag makes friendTg the friend of the code's owner; false when it is not: the program is off,
// the code is unknown or the account's own, or the account is a customer or someone's friend
// already.
func (s *Service) Tag(ctx context.Context, friendTg int64, code string) (bool, error) {
	if !s.On(ctx) {
		return false, nil
	}
	code = strings.ToLower(strings.TrimSpace(code))
	if code == "" || len(code) > 32 {
		return false, nil
	}
	referrer, err := s.st.Q.ReferrerOfCode(ctx, code)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	n, err := s.st.Q.TagReferral(ctx, db.TagReferralParams{TgID: friendTg, Referrer: referrer, Now: s.now().Unix()})
	return n > 0, err
}

// Paid is billing's word of an applied tariff payment, on its transaction: a friend's first
// paid tariff rewards its referrer, and the buyer's own rewards that waited for a subscription
// go to the one just bought (userID).
func (s *Service) Paid(ctx context.Context, q *db.Queries, pay db.Payment, userID int64) error {
	if pay.Amount <= 0 {
		return nil
	}
	cfg := s.Config(ctx)
	if !cfg.Enabled {
		return nil
	}
	now := s.now()
	r, err := q.EarnReferral(ctx, db.EarnReferralParams{TgID: pay.TgID, Days: int32(cfg.Days),
		PaymentID: sql.NullInt64{Int64: pay.ID, Valid: true}, Now: sql.NullInt64{Int64: now.Unix(), Valid: true}})
	switch {
	case errors.Is(err, sql.ErrNoRows):
		// Nobody's friend, or its first tariff was paid before.
	case err != nil:
		return err
	default:
		if err := s.reward(ctx, q, r, now); err != nil {
			return err
		}
	}
	return s.collect(ctx, q, pay.TgID, userID, now)
}

// reward gives r's days to its referrer's subscription, or leaves them waiting for one.
func (s *Service) reward(ctx context.Context, q *db.Queries, r db.Referral, now time.Time) error {
	friends, err := q.ReferralStatsOf(ctx, r.Referrer)
	if err != nil {
		return err
	}
	key := events.ReferralReward + ":" + strconv.FormatInt(r.TgID, 10)
	sub, err := q.ReferrerSubscription(ctx, r.Referrer)
	if errors.Is(err, sql.ErrNoRows) {
		return feed.Emit(ctx, q, now, events.ReferralReward, 0, r.Referrer,
			events.Reward{Days: int64(r.Days), Waiting: true, Friends: friends.Paid}, key)
	}
	if err != nil {
		return err
	}
	if _, err := s.users.ExtendOn(ctx, q, sub, int64(r.Days)); err != nil {
		return err
	}
	if err := q.RewardReferral(ctx, db.RewardReferralParams{TgID: r.TgID, UserID: sql.NullInt64{Int64: sub, Valid: true},
		Now: sql.NullInt64{Int64: now.Unix(), Valid: true}}); err != nil {
		return err
	}
	return feed.Emit(ctx, q, now, events.ReferralReward, sub, r.Referrer, events.Reward{Days: int64(r.Days), Friends: friends.Paid}, key)
}

// collect gives the account's waiting rewards to its subscription userID.
func (s *Service) collect(ctx context.Context, q *db.Queries, tgID, userID int64, now time.Time) error {
	waiting, err := q.WaitingReferrals(ctx, tgID)
	if err != nil || len(waiting) == 0 {
		return err
	}
	var days int64
	for _, r := range waiting {
		days += int64(r.Days)
		if err := q.RewardReferral(ctx, db.RewardReferralParams{TgID: r.TgID, UserID: sql.NullInt64{Int64: userID, Valid: true},
			Now: sql.NullInt64{Int64: now.Unix(), Valid: true}}); err != nil {
			return err
		}
	}
	if _, err := s.users.ExtendOn(ctx, q, userID, min(days, domain.MaxExtendDays)); err != nil {
		return err
	}
	friends, err := q.ReferralStatsOf(ctx, tgID)
	if err != nil {
		return err
	}
	return feed.Emit(ctx, q, now, events.ReferralReward, userID, tgID, events.Reward{Days: days, Friends: friends.Paid, Collected: true},
		events.ReferralReward+":collect:"+strconv.FormatInt(waiting[len(waiting)-1].TgID, 10))
}

// Totals are the program's numbers for the admin.
func (s *Service) Totals(ctx context.Context) (db.ReferralTotalsRow, error) {
	return s.st.Q.ReferralTotals(ctx)
}

// Top are the referrers with the most friends who paid.
func (s *Service) Top(ctx context.Context, n int32) ([]db.TopReferrersRow, error) {
	return s.st.Q.TopReferrers(ctx, n)
}

// Recent are the friends who came last.
func (s *Service) Recent(ctx context.Context, n int32) ([]db.RecentReferralsRow, error) {
	return s.st.Q.RecentReferrals(ctx, n)
}
