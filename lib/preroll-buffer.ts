// Continuous audio pre-roll buffer.
//
// The locker's audio recorder captures from the moment the user taps "record" —
// but the most evidentially valuable seconds are the ones *before* a trigger
// (the threat that caused the SOS, not the seconds after). This module keeps
// the last N seconds of audio always available so that when SOS fires, we can
// retroactively pull what just happened.
//
// expo-av has no circular-buffer primitive. The honest approach: record in
// fixed-length chunks, keep the most recent K chunks on disk, and on flush()
// concatenate-or-return them. Each chunk rotation drops a small amount of
// audio (~50–100 ms while the recorder is restarted). For production work
// where every sample matters, the native adapter slot below lets a custom
// AVAudioEngine / AudioRecord implementation replace the chunk strategy.

import { Audio } from 'expo-av';
import { File, Paths } from 'expo-file-system';

import { addEvidenceItem, type EvidenceSession } from './evidence-locker';

export type PrerollChunk = {
  uri: string;
  startedAt: number;
  endedAt: number;
};

export type PrerollBackend = {
  start(): Promise<boolean>;
  stop(): Promise<void>;
  /** Return the ring contents in chronological order, oldest first. */
  flush(): Promise<PrerollChunk[]>;
};

export type PrerollConfig = {
  /** Total buffer window in seconds. Default 30 s. */
  windowSeconds: number;
  /** Per-chunk duration in seconds. Default 10 s — smaller = less audio lost
   *  on rotation, more file churn. */
  chunkSeconds: number;
};

export const DEFAULT_PREROLL_CONFIG: PrerollConfig = {
  windowSeconds: 30,
  chunkSeconds: 10,
};

const PREROLL_DIR = `${Paths.cache.uri}preroll/`;

class ChunkRotatingBackend implements PrerollBackend {
  private config: PrerollConfig;
  private recording: Audio.Recording | null = null;
  private chunks: PrerollChunk[] = [];
  private rotateTimer: ReturnType<typeof setTimeout> | null = null;
  private currentChunkStart = 0;
  private running = false;

  constructor(config: PrerollConfig) {
    this.config = config;
  }

  async start(): Promise<boolean> {
    if (this.running) return true;
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) return false;
    try {
      const dir = new File(PREROLL_DIR);
      if (!dir.exists) {
        const dirHandle = new (Paths as unknown as {
          Directory: new (uri: string) => { create: (opts?: { intermediates?: boolean }) => void };
        }).Directory(PREROLL_DIR);
        dirHandle.create({ intermediates: true });
      }
    } catch {
      /* dir creation is best-effort */
    }
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
    });
    this.running = true;
    await this.openChunk();
    return true;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
    await this.closeChunk();
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
    } catch {
      /* ignore */
    }
  }

  async flush(): Promise<PrerollChunk[]> {
    // Close + reopen so the in-flight chunk is included in the snapshot.
    await this.closeChunk();
    const snapshot = this.chunks.slice();
    if (this.running) {
      await this.openChunk();
    }
    return snapshot;
  }

  private async openChunk(): Promise<void> {
    if (!this.running) return;
    try {
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.LOW_QUALITY);
      await recording.startAsync();
      this.recording = recording;
      this.currentChunkStart = Date.now();
      this.rotateTimer = setTimeout(
        () => {
          if (this.running) {
            void this.rotate();
          }
        },
        this.config.chunkSeconds * 1000,
      );
    } catch {
      this.recording = null;
    }
  }

  private async rotate(): Promise<void> {
    await this.closeChunk();
    if (this.running) await this.openChunk();
  }

  private async closeChunk(): Promise<void> {
    const rec = this.recording;
    this.recording = null;
    if (this.rotateTimer) {
      clearTimeout(this.rotateTimer);
      this.rotateTimer = null;
    }
    if (!rec) return;
    let uri: string | null = null;
    try {
      await rec.stopAndUnloadAsync();
      uri = rec.getURI();
    } catch {
      try {
        uri = rec.getURI();
      } catch {
        /* ignore */
      }
    }
    if (!uri) return;
    const chunk: PrerollChunk = {
      uri,
      startedAt: this.currentChunkStart,
      endedAt: Date.now(),
    };
    this.chunks.push(chunk);
    await this.evict();
  }

  private async evict(): Promise<void> {
    const maxChunks = Math.max(
      1,
      Math.ceil(this.config.windowSeconds / this.config.chunkSeconds) + 1,
    );
    while (this.chunks.length > maxChunks) {
      const dropped = this.chunks.shift();
      if (dropped) {
        try {
          new File(dropped.uri).delete();
        } catch {
          /* best effort */
        }
      }
    }
  }
}

const STATE: { backend: PrerollBackend | null; config: PrerollConfig } = {
  backend: null,
  config: DEFAULT_PREROLL_CONFIG,
};

/**
 * Inject a native pre-roll backend (e.g. a real circular buffer via
 * AVAudioEngine / AudioRecord). Call before {@link startPreroll}. If never
 * called, the chunk-rotating fallback is used.
 */
export function registerPrerollBackend(backend: PrerollBackend): void {
  STATE.backend = backend;
}

export function configurePreroll(config: Partial<PrerollConfig>): void {
  STATE.config = { ...STATE.config, ...config };
}

export async function startPreroll(): Promise<boolean> {
  if (!STATE.backend) {
    STATE.backend = new ChunkRotatingBackend(STATE.config);
  }
  return STATE.backend.start();
}

export async function stopPreroll(): Promise<void> {
  if (STATE.backend) {
    await STATE.backend.stop();
    STATE.backend = null;
  }
}

export async function flushPrerollChunks(): Promise<PrerollChunk[]> {
  if (!STATE.backend) return [];
  return STATE.backend.flush();
}

/**
 * Attach the current pre-roll contents to an evidence session. Returns the
 * mutated session (chronological order — oldest chunk first).
 */
export async function attachPrerollToSession(
  session: EvidenceSession,
  alertId: string | null,
): Promise<EvidenceSession> {
  const chunks = await flushPrerollChunks();
  let next = session;
  for (const chunk of chunks) {
    next = addEvidenceItem(next, {
      type: 'audio',
      uri: chunk.uri,
      text: `pre-roll ${new Date(chunk.startedAt).toISOString()} → ${new Date(
        chunk.endedAt,
      ).toISOString()}`,
      lat: null,
      lon: null,
      alertId,
      tags: ['preroll', 'auto'],
    });
  }
  return next;
}

export function isPrerollRunning(): boolean {
  return STATE.backend !== null;
}
