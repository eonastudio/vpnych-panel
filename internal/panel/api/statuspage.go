package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/danielgtaylor/huma/v2"

	"mikan/internal/panel/status"
)

// The public status page: the admin turns it on, names it and sees what it shows.

type StatusPageSettingsView struct {
	Enabled bool   `json:"enabled" doc:"Страница открыта по адресу подписок /status"`
	Title   string `json:"title" maxLength:"80" doc:"Заголовок; пусто — «Статус серверов»"`
	Days    int    `json:"days" enum:"30,60,90" doc:"Сколько дней аптайма показывать"`
}

type statusPageOutput struct {
	Body struct {
		Settings StatusPageSettingsView `json:"settings"`
		URL      string                 `json:"url" doc:"Адрес страницы; пусто, пока у панели нет адреса"`
		Report   status.PageReport      `json:"report"`
	}
}

type statusPageSettingsInput struct{ Body StatusPageSettingsView }

func (h *handlers) registerStatusPage() {
	tags := []string{"nodes"}
	op := sessionOps("nodes")
	huma.Register(h.api, huma.Operation{OperationID: "get-status-page", Method: http.MethodGet, Path: "/api/v1/status-page", Summary: "Публичная страница статуса: настройки и что она показывает", Tags: tags}, h.getStatusPage)
	huma.Register(h.api, op("update-status-page", http.MethodPut, "/api/v1/status-page/settings", "Изменить страницу статуса", 0), h.putStatusPage)
}

func (h *handlers) statusPage(ctx context.Context) (*statusPageOutput, error) {
	out := &statusPageOutput{}
	c := h.d.Status.Config(ctx)
	out.Body.Settings = StatusPageSettingsView{Enabled: c.Enabled, Title: c.Title, Days: c.Days}
	if h.d.SubBase != nil {
		if base := h.d.SubBase(ctx); base != "" {
			out.Body.URL = strings.TrimSuffix(base, "/") + "/status"
		}
	}
	r, err := h.d.Status.Report(ctx)
	if err != nil {
		return nil, err
	}
	out.Body.Report = r
	return out, nil
}

func (h *handlers) getStatusPage(ctx context.Context, _ *struct{}) (*statusPageOutput, error) {
	return h.statusPage(ctx)
}

func (h *handlers) putStatusPage(ctx context.Context, in *statusPageSettingsInput) (*statusPageOutput, error) {
	admin := sessionOf(ctx).AdminID
	err := h.d.Status.SetConfig(ctx, status.Config{Enabled: in.Body.Enabled, Title: in.Body.Title, Days: in.Body.Days})
	switch {
	case errors.Is(err, status.ErrBadDays):
		return nil, fieldErr("body.days", "bad_status_days")
	case errors.Is(err, status.ErrBadTitle):
		return nil, fieldErr("body.title", "bad_status_title")
	case err != nil:
		return nil, err
	}
	h.audit(ctx, admin, "status_page.settings", "settings", status.Key, map[string]any{"enabled": in.Body.Enabled, "title": in.Body.Title, "days": in.Body.Days})
	return h.statusPage(ctx)
}
