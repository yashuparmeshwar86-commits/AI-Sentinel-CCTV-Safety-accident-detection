import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const sentinelDataDir = resolve(
  process.cwd(),
  ".data",
  "ai-sentinel",
);
export const sentinelUploadDir = resolve(sentinelDataDir, "uploads");
export const sentinelEvidenceDir = resolve(sentinelDataDir, "evidence");

mkdirSync(sentinelUploadDir, { recursive: true });
mkdirSync(sentinelEvidenceDir, { recursive: true });

const database = new DatabaseSync(resolve(sentinelDataDir, "sentinel.sqlite"));
database.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS cameras (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'offline',
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    camera_name TEXT NOT NULL,
    location TEXT NOT NULL,
    latitude REAL,
    longitude REAL,
    status TEXT NOT NULL DEFAULT 'pending',
    severity TEXT NOT NULL,
    signals_json TEXT NOT NULL,
    evidence_url TEXT NOT NULL,
    notification_status TEXT NOT NULL DEFAULT 'not_sent',
    source_name TEXT NOT NULL,
    detection_count INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS incidents_created_at_idx ON incidents(created_at);
  CREATE INDEX IF NOT EXISTS incidents_camera_idx ON incidents(camera_id);
  CREATE INDEX IF NOT EXISTS incidents_status_idx ON incidents(status);
  CREATE TABLE IF NOT EXISTS notification_logs (
    id TEXT PRIMARY KEY,
    incident_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    message TEXT NOT NULL
  );
`);

export default database;
