package subs

import (
	"bytes"
	"encoding/json"
	"net/http"

	"mikan/internal/panel/server"
	"mikan/internal/panel/status"
)

// The public status page at <subscription address>/status, while the admin has it on: the
// public nodes and their uptime by day, as HTML or, with ?format=json, as JSON.

// SetStatus turns on the status page.
func (h *Handler) SetStatus(s *status.Service) { h.status = s }

func (h *Handler) statusPage(w http.ResponseWriter, r *http.Request) {
	c := h.status.Config(r.Context())
	if !c.Enabled {
		server.NotFound(w)
		return
	}
	rep, err := h.status.Report(r.Context())
	if err != nil {
		internalError(w)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=30")
	if r.URL.Query().Get("format") == "json" {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		_ = json.NewEncoder(w).Encode(rep)
		return
	}
	cfg, err := h.cfg(r.Context())
	if err != nil {
		internalError(w)
		return
	}
	var buf bytes.Buffer
	if err := status.Render(&buf, rep, c.Title, cfg.Brand, status.Lang(r.Header.Get("Accept-Language"), cfg.Lang)); err != nil {
		internalError(w)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	if r.Method != http.MethodHead {
		_, _ = w.Write(buf.Bytes())
	}
}
