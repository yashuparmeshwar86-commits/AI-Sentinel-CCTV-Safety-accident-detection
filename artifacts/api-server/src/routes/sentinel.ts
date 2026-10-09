import { Router, type IRouter } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import {
  AnalyzeVideoBody,
  AnalyzeVideoResponse,
  CreateCameraBody,
  CreateCameraResponse,
  DeleteCameraParams,
  GetEvidenceParams,
  GetSentinelSummaryResponse,
  ListCamerasResponse,
  ListIncidentsQueryParams,
  ListIncidentsResponse,
  SimulateNotificationBody,
  SimulateNotificationParams,
  SimulateNotificationResponse,
  UpdateCameraBody,
  UpdateCameraParams,
  UpdateCameraResponse,
  UpdateIncidentBody,
  UpdateIncidentParams,
  UpdateIncidentResponse,
} from "@workspace/api-zod";
import database, {
  sentinelEvidenceDir,
  sentinelUploadDir,
} from "../lib/sentinel-db";

const router: IRouter = Router();
const supportedExtensions = new Set([".mp4", ".avi", ".mov"]);
const upload = multer({
  storage: multer.diskStorage({
    destination: sentinelUploadDir,
    filename(_req, file, callback) {
      callback(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: 250 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, callback) {
    const extension = extname(file.originalname).toLowerCase();
    if (!supportedExtensions.has(extension)) {
      callback(new Error("Upload an MP4, AVI, or MOV video file."));
      return;
    }
    callback(null, true);
  },
});

type SqlRow = Record<string, string | number | null | bigint>;

function text(row: SqlRow, key: string): string {
  const value = row[key];
  return typeof value === "string" ? value : "";
}

function numberOrNull(row: SqlRow, key: string): number | null {
  const value = row[key];
  return typeof value === "number" ? value : null;
}

function cameraFromRow(row: SqlRow) {
  return {
    id: text(row, "id"),
    name: text(row, "name"),
    location: text(row, "location"),
    latitude: numberOrNull(row, "latitude"),
    longitude: numberOrNull(row, "longitude"),
    status: text(row, "status"),
    createdAt: text(row, "created_at"),
  };
}

function incidentFromRow(row: SqlRow) {
  let signals: string[] = [];
  try {
    const parsed: unknown = JSON.parse(text(row, "signals_json"));
    if (Array.isArray(parsed)) {
      signals = parsed.filter((item): item is string => typeof item === "string");
    }
  } catch {
    signals = [];
  }
  return {
    id: text(row, "id"),
    createdAt: text(row, "created_at"),
    cameraId: text(row, "camera_id"),
    cameraName: text(row, "camera_name"),
    location: text(row, "location"),
    latitude: numberOrNull(row, "latitude"),
    longitude: numberOrNull(row, "longitude"),
    status: text(row, "status"),
    severity: text(row, "severity"),
    signals,
    evidenceUrl: text(row, "evidence_url"),
    notificationStatus: text(row, "notification_status"),
    sourceName: text(row, "source_name"),
    detectionCount: typeof row.detection_count === "number" ? row.detection_count : 0,
  };
}

function getCamera(id: string) {
  const row = database
    .prepare("SELECT * FROM cameras WHERE id = ?")
    .get(id) as SqlRow | undefined;
  return row ? cameraFromRow(row) : undefined;
}

function getIncident(id: string) {
  const row = database
    .prepare("SELECT * FROM incidents WHERE id = ?")
    .get(id) as SqlRow | undefined;
  return row ? incidentFromRow(row) : undefined;
}

function nullableCoordinate(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function numericFormValue(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

async function readModelHealth(): Promise<{ modelAvailable: boolean; modelMessage: string }> {
  try {
    const response = await fetch("http://127.0.0.1:8765/health", {
      signal: AbortSignal.timeout(700),
    });
    if (!response.ok) throw new Error(`health endpoint returned ${response.status}`);
    const health = (await response.json()) as {
      modelAvailable?: boolean;
      modelMessage?: string;
    };
    return {
      modelAvailable: health.modelAvailable === true,
      modelMessage: health.modelMessage || "The analysis worker did not provide a model status.",
    };
  } catch {
    return {
      modelAvailable: false,
      modelMessage:
        "The Python video-analysis worker is not ready. OpenCV/YOLO analysis will report unavailable until its dependencies are installed and the API restarts.",
    };
  }
}

router.get("/sentinel/summary", async (_req, res): Promise<void> => {
  const counts = database
    .prepare(`
      SELECT
        (SELECT COUNT(*) FROM incidents) AS total,
        (SELECT COUNT(*) FROM incidents WHERE status = 'pending') AS pending,
        (SELECT COUNT(*) FROM incidents WHERE status = 'verified') AS verified,
        (SELECT COUNT(*) FROM cameras WHERE status = 'online') AS online_cameras,
        (SELECT COUNT(*) FROM cameras) AS total_cameras
    `)
    .get() as SqlRow;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 6);
  const startDate = start.toISOString().slice(0, 10);
  const groupedRows = database
    .prepare(`
      SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
      FROM incidents
      WHERE substr(created_at, 1, 10) >= ?
      GROUP BY day
    `)
    .all(startDate) as SqlRow[];
  const grouped = new Map(
    groupedRows.map((row) => [text(row, "day"), Number(row.count ?? 0)]),
  );
  const daily = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, count: grouped.get(key) ?? 0 };
  });
  const model = await readModelHealth();
  res.json(
    GetSentinelSummaryResponse.parse({
      totalIncidents: Number(counts.total ?? 0),
      pendingIncidents: Number(counts.pending ?? 0),
      verifiedIncidents: Number(counts.verified ?? 0),
      onlineCameras: Number(counts.online_cameras ?? 0),
      totalCameras: Number(counts.total_cameras ?? 0),
      daily,
      ...model,
    }),
  );
});

router.get("/sentinel/cameras", (_req, res): void => {
  const rows = database
    .prepare("SELECT * FROM cameras ORDER BY created_at DESC")
    .all() as SqlRow[];
  res.json(ListCamerasResponse.parse(rows.map(cameraFromRow)));
});

router.post("/sentinel/cameras", (req, res): void => {
  const parsed = CreateCameraBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const id = `CAM-${randomUUID().slice(0, 8).toUpperCase()}`;
  const createdAt = new Date().toISOString();
  const camera = {
    id,
    ...parsed.data,
    latitude: nullableCoordinate(parsed.data.latitude),
    longitude: nullableCoordinate(parsed.data.longitude),
    status: parsed.data.status ?? "offline",
    createdAt,
  };
  database
    .prepare(`
      INSERT INTO cameras (id, name, location, latitude, longitude, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      camera.id,
      camera.name,
      camera.location,
      camera.latitude,
      camera.longitude,
      camera.status,
      camera.createdAt,
    );
  res.status(201).json(CreateCameraResponse.parse(camera));
});

router.patch("/sentinel/cameras/:cameraId", (req, res): void => {
  const params = UpdateCameraParams.safeParse(req.params);
  const parsed = UpdateCameraBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
    return;
  }
  const current = getCamera(params.data.cameraId);
  if (!current) {
    res.status(404).json({ error: "Camera not found" });
    return;
  }
  const updated = {
    ...current,
    ...parsed.data,
    latitude:
      parsed.data.latitude === undefined
        ? current.latitude
        : nullableCoordinate(parsed.data.latitude),
    longitude:
      parsed.data.longitude === undefined
        ? current.longitude
        : nullableCoordinate(parsed.data.longitude),
  };
  database
    .prepare(`
      UPDATE cameras
      SET name = ?, location = ?, latitude = ?, longitude = ?, status = ?
      WHERE id = ?
    `)
    .run(
      updated.name,
      updated.location,
      updated.latitude,
      updated.longitude,
      updated.status,
      params.data.cameraId,
    );
  res.json(UpdateCameraResponse.parse(updated));
});

router.delete("/sentinel/cameras/:cameraId", (req, res): void => {
  const params = DeleteCameraParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const result = database
    .prepare("DELETE FROM cameras WHERE id = ?")
    .run(params.data.cameraId);
  if (result.changes === 0) {
    res.status(404).json({ error: "Camera not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/sentinel/incidents", (req, res): void => {
  const parsed = ListIncidentsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const clauses: string[] = [];
  const values: string[] = [];
  if (parsed.data.status) {
    clauses.push("status = ?");
    values.push(parsed.data.status);
  }
  if (parsed.data.severity) {
    clauses.push("severity = ?");
    values.push(parsed.data.severity);
  }
  if (parsed.data.cameraId) {
    clauses.push("camera_id = ?");
    values.push(parsed.data.cameraId);
  }
  if (parsed.data.from) {
    clauses.push("substr(created_at, 1, 10) >= ?");
    values.push(parsed.data.from);
  }
  if (parsed.data.to) {
    clauses.push("substr(created_at, 1, 10) <= ?");
    values.push(parsed.data.to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = database
    .prepare(`SELECT * FROM incidents ${where} ORDER BY created_at DESC`)
    .all(...values) as SqlRow[];
  res.json(ListIncidentsResponse.parse(rows.map(incidentFromRow)));
});

router.patch("/sentinel/incidents/:incidentId", (req, res): void => {
  const params = UpdateIncidentParams.safeParse(req.params);
  const parsed = UpdateIncidentBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
    return;
  }
  const current = getIncident(params.data.incidentId);
  if (!current) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }
  database
    .prepare("UPDATE incidents SET status = ? WHERE id = ?")
    .run(parsed.data.status, params.data.incidentId);
  const updated = getIncident(params.data.incidentId);
  res.json(UpdateIncidentResponse.parse(updated));
});

router.post("/sentinel/incidents/:incidentId/notify", (req, res): void => {
  const params = SimulateNotificationParams.safeParse(req.params);
  const parsed = SimulateNotificationBody.safeParse(req.body);
  if (!params.success || !parsed.success) {
    res.status(400).json({ error: params.error?.message ?? parsed.error?.message });
    return;
  }
  const incident = getIncident(params.data.incidentId);
  if (!incident) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }
  if (incident.status !== "verified") {
    res.status(409).json({ error: "A human operator must verify this incident before recording a notification simulation." });
    return;
  }
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const message =
    "SIMULATION ONLY — no SMS, email, ambulance dispatch, or emergency-service notification was sent.";
  database
    .prepare(`
      INSERT INTO notification_logs (id, incident_id, recipient, status, created_at, message)
      VALUES (?, ?, ?, 'simulated', ?, ?)
    `)
    .run(id, params.data.incidentId, parsed.data.recipient, createdAt, message);
  database
    .prepare("UPDATE incidents SET notification_status = 'simulated' WHERE id = ?")
    .run(params.data.incidentId);
  res.json(
    SimulateNotificationResponse.parse({
      incidentId: params.data.incidentId,
      recipient: parsed.data.recipient,
      status: "simulated",
      createdAt,
      message,
    }),
  );
});

router.post("/sentinel/analyze", upload.single("video"), async (req, res): Promise<void> => {
  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "A video file is required." });
    return;
  }
  const cleanupOnFailure = async () => {
    try {
      await import("node:fs/promises").then(({ unlink }) => unlink(file.path));
    } catch {
      // The upload may already have been removed.
    }
  };
  const extension = extname(file.originalname).toLowerCase();
  const magic = await readFile(file.path).then((buffer) => buffer.subarray(0, 16));
  const validMp4OrMov =
    (extension === ".mp4" || extension === ".mov") &&
    magic.length >= 8 &&
    magic.subarray(4, 8).toString("ascii") === "ftyp";
  const validAvi =
    extension === ".avi" &&
    magic.length >= 12 &&
    magic.subarray(0, 4).toString("ascii") === "RIFF" &&
    magic.subarray(8, 12).toString("ascii") === "AVI ";
  if (!validMp4OrMov && !validAvi) {
    await cleanupOnFailure();
    res.status(400).json({ error: "The file signature does not match a supported MP4, AVI, or MOV video." });
    return;
  }

  const metadata = AnalyzeVideoBody.safeParse({
    video: new Blob([]),
    cameraId: req.body.cameraId,
    location: req.body.location || undefined,
    latitude: numericFormValue(req.body.latitude),
    longitude: numericFormValue(req.body.longitude),
    confidenceThreshold:
      numericFormValue(req.body.confidenceThreshold) ?? 0.35,
    suspiciousThreshold:
      numericFormValue(req.body.suspiciousThreshold) ?? 3,
  });
  if (!metadata.success) {
    await cleanupOnFailure();
    res.status(400).json({ error: metadata.error.message });
    return;
  }
  if ((metadata.data.latitude == null) !== (metadata.data.longitude == null)) {
    await cleanupOnFailure();
    res.status(400).json({ error: "Provide both latitude and longitude, or leave both blank." });
    return;
  }
  const camera = getCamera(metadata.data.cameraId);
  if (!camera) {
    await cleanupOnFailure();
    res.status(400).json({ error: "Choose a configured camera before analyzing a video." });
    return;
  }

  let workerResult: {
    modelStatus?: "available" | "unavailable" | "error";
    modelMessage?: string;
    detections?: Array<{
      className: string;
      confidence: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      frame: number;
    }>;
    frames?: string[];
    possibleIncidents?: Array<{
      frame: number;
      evidenceFile: string;
      signals: string[];
      severity: "low" | "medium" | "high";
    }>;
  } | null = null;
  let modelStatus: "available" | "unavailable" | "error" = "unavailable";
  let modelMessage =
    "The Python analysis worker is unavailable. The uploaded video is stored, but no predictions were generated.";
  try {
    const response = await fetch("http://127.0.0.1:8765/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        videoPath: resolve(file.path),
        confidenceThreshold: metadata.data.confidenceThreshold,
        suspiciousThreshold: metadata.data.suspiciousThreshold,
      }),
      signal: AbortSignal.timeout(15 * 60 * 1000),
    });
    if (response.status === 400) {
      const error = (await response.json()) as { detail?: string };
      await cleanupOnFailure();
      res.status(400).json({ error: error.detail || "The video could not be processed." });
      return;
    }
    workerResult = (await response.json()) as NonNullable<typeof workerResult>;
    modelStatus = workerResult.modelStatus ?? "error";
    modelMessage =
      workerResult.modelMessage || "The worker did not return a model status.";
  } catch (error) {
    req.log.warn({ error }, "Video-analysis worker was not available");
    modelStatus = "unavailable";
    modelMessage =
      "The Python worker could not run OpenCV/YOLO. The video upload was saved, but no predictions were generated. Check the Python worker dependencies and logs.";
  }

  const detections = workerResult?.detections ?? [];
  const processedFrames = (workerResult?.frames ?? []).map(
    (name) => `/api/sentinel/evidence/${encodeURIComponent(name)}`,
  );
  const incidentResults = [];
  if (modelStatus === "available") {
    const location =
      metadata.data.location?.trim() || camera.location;
    const latitude =
      metadata.data.latitude ?? camera.latitude;
    const longitude =
      metadata.data.longitude ?? camera.longitude;
    for (const possible of workerResult?.possibleIncidents ?? []) {
      if (
        !/^[a-zA-Z0-9_-]{1,100}\.jpg$/.test(possible.evidenceFile) ||
        !existsSync(resolve(sentinelEvidenceDir, possible.evidenceFile))
      ) {
        req.log.warn({ file: possible.evidenceFile }, "Worker returned missing or unsafe evidence filename");
        continue;
      }
      const id = `INC-${randomUUID().slice(0, 8).toUpperCase()}`;
      const createdAt = new Date().toISOString();
      const evidenceUrl = `/api/sentinel/evidence/${encodeURIComponent(possible.evidenceFile)}`;
      const incident = {
        id,
        createdAt,
        cameraId: camera.id,
        cameraName: camera.name,
        location,
        latitude,
        longitude,
        status: "pending" as const,
        severity: possible.severity,
        signals: possible.signals,
        evidenceUrl,
        notificationStatus: "not_sent" as const,
        sourceName: basename(file.originalname).slice(0, 255),
        detectionCount: detections.filter((item) => item.frame === possible.frame).length,
      };
      database
        .prepare(`
          INSERT INTO incidents (
            id, created_at, camera_id, camera_name, location, latitude, longitude,
            status, severity, signals_json, evidence_url, notification_status,
            source_name, detection_count
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          incident.id,
          incident.createdAt,
          incident.cameraId,
          incident.cameraName,
          incident.location,
          incident.latitude,
          incident.longitude,
          incident.status,
          incident.severity,
          JSON.stringify(incident.signals),
          incident.evidenceUrl,
          incident.notificationStatus,
          incident.sourceName,
          incident.detectionCount,
        );
      incidentResults.push(incident);
    }
  }

  const result = {
    modelStatus,
    modelMessage,
    detections,
    processedFrames,
    incidents: incidentResults,
    videoUrl: `/api/sentinel/videos/${encodeURIComponent(file.filename)}`,
  };
  res.json(AnalyzeVideoResponse.parse(result));
});

router.get("/sentinel/evidence/:filename", async (req, res): Promise<void> => {
  const params = GetEvidenceParams.safeParse(req.params);
  if (
    !params.success ||
    !/^[a-zA-Z0-9_-]{1,100}\.jpg$/.test(params.data.filename)
  ) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }
  const path = resolve(sentinelEvidenceDir, params.data.filename);
  if (!path.startsWith(`${sentinelEvidenceDir}/`)) {
    res.status(404).json({ error: "Evidence not found" });
    return;
  }
  try {
    const image = await readFile(path);
    res.type("image/jpeg").send(image);
  } catch {
    res.status(404).json({ error: "Evidence not found" });
  }
});

router.get("/sentinel/videos/:filename", (req, res): void => {
  const filename = Array.isArray(req.params.filename)
    ? req.params.filename[0]
    : req.params.filename;
  if (
    !/^[a-f0-9-]{36}\.(mp4|avi|mov)$/.test(filename) ||
    !supportedExtensions.has(extname(filename).toLowerCase())
  ) {
    res.status(404).json({ error: "Video not found" });
    return;
  }
  res.sendFile(filename, { root: sentinelUploadDir }, (error) => {
    if (error && !res.headersSent) {
      res.status(404).json({ error: "Video not found" });
    }
  });
});

router.use((error: unknown, req: import("express").Request, res: import("express").Response, _next: import("express").NextFunction): void => {
  const maybeMulterError = error as { code?: string; message?: string };
  if (maybeMulterError.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: "Video exceeds the 250 MB upload limit." });
    return;
  }
  if (maybeMulterError.message?.startsWith("Upload an MP4")) {
    res.status(400).json({ error: maybeMulterError.message });
    return;
  }
  req.log.error({ error }, "Sentinel route failed");
  res.status(500).json({ error: "Sentinel request failed." });
});

export default router;
