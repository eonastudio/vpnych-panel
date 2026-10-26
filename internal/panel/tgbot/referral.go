package tgbot

import (
	"context"
	"fmt"
	"html"
	"net/url"
	"strings"

	"mikan/internal/panel/events"
	"mikan/internal/tgapi"
)

// The referral program: callback data rf is the account's link and its friends. A friend
// comes by /start r_<code> (onMessage); its first paid tariff rewards the link's owner, and
// the feed's events.ReferralReward tells the owner here (rewarded).

// referralButton is the menu's entry while the program is on.
func (b *Bot) referralButton(ctx context.Context, w *words, chat int64) (tgapi.Button, bool) {
	r, err := b.d.Backend.Referral(ctx, chat)
	if err != nil || !r.Enabled {
		return tgapi.Button{}, false
	}
	return tgapi.Button{Text: w.refButton, CallbackData: "rf"}, true
}

// referralScreen draws rf.
func (b *Bot) referralScreen(ctx context.Context, w *words, chat int64, notice string) (string, *tgapi.Keyboard) {
	home := []tgapi.Button{{Text: w.back, CallbackData: "m"}}
	r, err := b.d.Backend.Referral(ctx, chat)
	if err != nil || !r.Enabled {
		return html.EscapeString(w.refOff), &tgapi.Keyboard{InlineKeyboard: [][]tgapi.Button{home}}
	}
	lines := []string{}
	if notice != "" {
		lines = append(lines, html.EscapeString(notice), "")
	}
	lines = append(lines, "<b>"+html.EscapeString(w.refTitle)+"</b>", "", html.EscapeString(fmt.Sprintf(w.refHint, r.Days)), "")
	rows := [][]tgapi.Button{}
	if r.Link == "" {
		lines = append(lines, html.EscapeString(w.refNoLink))
	} else {
		lines = append(lines, "<code>"+html.EscapeString(r.Link)+"</code>")
		share := "https://t.me/share/url?url=" + url.QueryEscape(r.Link) + "&text=" + url.QueryEscape(w.refShareText)
		rows = append(rows, []tgapi.Button{{Text: w.refShare, URL: share}})
	}
	lines = append(lines, "", html.EscapeString(fmt.Sprintf(w.refStats, r.Invited, r.Paid, r.Earned)))
	if r.Waiting > 0 {
		lines = append(lines, html.EscapeString(fmt.Sprintf(w.refWaiting, r.Waiting)))
	}
	return strings.Join(lines, "\n"), &tgapi.Keyboard{InlineKeyboard: append(rows, home)}
}

// rewarded tells the account of days its friends brought.
func (b *Bot) rewarded(ctx context.Context, chat int64, r events.Reward) {
	w := wordsFor(b.config(ctx).Lang)
	var text string
	switch {
	case r.Collected:
		text = fmt.Sprintf(w.refCollected, r.Days)
	case r.Waiting:
		text = fmt.Sprintf(w.refRewardWaiting, r.Days)
	default:
		text = fmt.Sprintf(w.refReward, r.Days, r.Friends)
	}
	text = html.EscapeString(text)
	kb := &tgapi.Keyboard{InlineKeyboard: [][]tgapi.Button{{{Text: w.refButton, CallbackData: "rf"}}}}
	b.d.Outbox.Notice(chat, func(ctx context.Context, c *tgapi.Client) error {
		_, err := c.Send(ctx, chat, text, kb, false)
		return err
	}, nil)
}
