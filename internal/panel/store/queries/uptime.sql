-- name: AddNodeUptime :exec
INSERT INTO node_uptime (node_id, day, checks, ok) VALUES ($1, $2, $3, $4)
ON CONFLICT (node_id, day) DO UPDATE SET checks = node_uptime.checks + excluded.checks, ok = node_uptime.ok + excluded.ok;

-- name: ListNodeUptime :many
SELECT node_id, day, checks, ok FROM node_uptime WHERE day >= $1 ORDER BY node_id, day;

-- name: PruneNodeUptime :exec
DELETE FROM node_uptime WHERE day < $1;
