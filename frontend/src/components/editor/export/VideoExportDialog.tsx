import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Minimize2,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEditorStore } from '../../../store/useEditorStore';
import { getPosterTrack } from '../../../types/timeline';
import type {
  VideoExportFormat,
  VideoExportQuality,
} from '../../../types/videoExport';
import {
  cancelVideoRenderJob,
  createVideoRenderJob,
  downloadRenderedVideo,
  finalizeVideoRenderJob,
  getVideoRenderStatus,
  uploadVideoRenderFrames,
} from '../../../services/videoExportService';
import type { VideoRenderStatus } from '../../../types/videoExport';
import {
  canvasToPngBlob,
  PosterSceneRenderer,
} from '../../../utils/sceneTimelineRenderer';
import { frameTimestampMs } from '../../../utils/animationEvaluator';

interface VideoExportDialogProps {
  isOpen: boolean;
  initialFormat: VideoExportFormat;
  onClose: () => void;
}

const qualityBitrate = {
  draft: 2,
  standard: 5,
  high: 10,
} satisfies Record<VideoExportQuality, number>;

export const VideoExportDialog: React.FC<VideoExportDialogProps> = ({
  isOpen,
  initialFormat,
  onClose,
}) => {
  const store = useEditorStore();
  const setTimelineRecording = store.setTimelineRecording;
  const clips = getPosterTrack(store.timelineProject).clips.filter((clip) => clip.visible);
  const [format, setFormat] = useState<VideoExportFormat>(initialFormat);
  const [width, setWidth] = useState(store.canvasWidth);
  const [height, setHeight] = useState(store.canvasHeight);
  const [fps, setFps] = useState<24 | 30 | 60>(store.timelineProject.fps);
  const [quality, setQuality] = useState<VideoExportQuality>('high');
  const [status, setStatus] = useState<VideoRenderStatus | null>(null);
  const [error, setError] = useState('');
  const [preparing, setPreparing] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const renderAbortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
    renderAbortRef.current?.abort();
  }, []);

  const estimatedMb = useMemo(() => (
    Math.max((store.timelineProject.durationMs / 1000) * qualityBitrate[quality] / 8, 0)
  ), [quality, store.timelineProject.durationMs]);

  const poll = async (jobId: string) => {
    try {
      const nextStatus = await getVideoRenderStatus(jobId);
      setStatus(nextStatus);
      if (nextStatus.status === 'queued' || nextStatus.status === 'processing') {
        pollTimerRef.current = window.setTimeout(() => void poll(jobId), 800);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to read render progress.');
    }
  };

  const exportVideo = async () => {
    if (!store.projectId || store.projectId.startsWith('local_')) {
      setError('Save this design to your TECKSTUDIO account before server video export.');
      return;
    }
    if (clips.length === 0) {
      setError('Add at least one visible poster page to the timeline.');
      return;
    }
    setError('');
    setStatus(null);
    setPreparing(true);
    store.setTimelineRecording(true);
    let renderer: PosterSceneRenderer | null = null;
    let renderJobId: string | null = null;
    try {
      // ─────────────────────────────────────────────────────────────────────
      // CRITICAL FIX: syncAllPages() serializes EVERY page's canvas data,
      // not just the currently active page. Without this, page.data is empty
      // for pages the user hasn't visited in this session, causing
      // prepareFabricScene() to throw and silently skip those clips.
      // ─────────────────────────────────────────────────────────────────────
      setStatus((current) => current ? current : {
        job_id: '',
        status: 'queued',
        progress: 1,
        stage: 'Saving all poster pages…',
        total_frames: 0,
        rendered_frames: 0,
      });
      const pages = await store.syncAllPages();
      const timeline = store.timelineProject;
      const missingPages: string[] = [];
      for (const clip of clips) {
        const page = pages.find((candidate) => candidate.id === clip.pageId);
        if (!page) {
          missingPages.push(`"${clip.name}" references a missing page`);
        } else if (!page.data) {
          missingPages.push(`"${clip.name}" (${page.name}) has no canvas data — open this page in the editor and make a change to save it`);
        }
      }
      if (missingPages.length > 0) {
        throw new Error(`Cannot export: ${missingPages[0]}.`);
      }
      const totalFrames = Math.max(
        Math.ceil((store.timelineProject.durationMs / 1000) * fps),
        1,
      );
      const response = await createVideoRenderJob({
        projectId: store.projectId,
        settings: {
          format,
          width,
          height,
          fps,
          quality,
          includeAudio: Boolean(timeline.audioClips?.length || timeline.audio),
        },
        timeline,
        totalFrames,
      });
      renderJobId = response.job_id;
      setStatus({
        job_id: response.job_id,
        status: response.status,
        progress: 1,
        stage: 'Loading project',
        total_frames: totalFrames,
        rendered_frames: 0,
      });
      const abortController = new AbortController();
      renderAbortRef.current = abortController;
      const outputCanvas = document.createElement('canvas');
      renderer = new PosterSceneRenderer(outputCanvas, () => ({
        pages,
        timeline,
        width,
        height,
      }));
      setStatus((current) => current ? {
        ...current,
        progress: 3,
        stage: 'Loading fonts and assets',
      } : current);
      await renderer.prepare();

      const batchSize = 6;
      let frameBatch: Blob[] = [];
      let batchStartIndex = 0;
      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        if (abortController.signal.aborted) throw new DOMException('Video export cancelled.', 'AbortError');
        const timestampMs = Math.min(
          frameTimestampMs(frameIndex, fps),
          Math.max(timeline.durationMs - 0.001, 0),
        );
        renderer.render(timestampMs);
        frameBatch.push(await canvasToPngBlob(outputCanvas));
        const isLastFrame = frameIndex === totalFrames - 1;
        if (frameBatch.length === batchSize || isLastFrame) {
          const uploadedStatus = await uploadVideoRenderFrames(
            response.job_id,
            batchStartIndex,
            frameBatch,
            abortController.signal,
          );
          setStatus(uploadedStatus);
          batchStartIndex = frameIndex + 1;
          frameBatch = [];
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        }
      }
      setStatus((current) => current ? {
        ...current,
        progress: Math.max(current.progress, 70),
        stage: 'Applying transitions',
      } : current);
      const encodingStatus = await finalizeVideoRenderJob(response.job_id);
      setStatus(encodingStatus);
      void poll(response.job_id);
    } catch (caughtError) {
      const wasCancelled = renderAbortRef.current?.signal.aborted === true;
      if (wasCancelled) {
        setStatus((current) => current ? { ...current, status: 'cancelled', stage: 'Render cancelled' } : current);
      } else {
        setError(caughtError instanceof Error ? caughtError.message : 'Video export failed.');
        if (renderJobId) void cancelVideoRenderJob(renderJobId).catch(() => undefined);
      }
      store.setTimelineRecording(false);
    } finally {
      renderer?.dispose();
      renderAbortRef.current = null;
      setPreparing(false);
    }
  };

  useEffect(() => {
    if (status && ['completed', 'failed', 'cancelled'].includes(status.status)) {
      setTimelineRecording(false);
    }
  }, [setTimelineRecording, status]);

  const cancel = async () => {
    if (!status?.job_id) return;
    renderAbortRef.current?.abort();
    try {
      await cancelVideoRenderJob(status.job_id);
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      setStatus({ ...status, status: 'cancelled', stage: 'Render cancelled' });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to cancel render.');
    }
  };

  if (!isOpen) return null;
  if (minimized) {
    return (
      <button type="button" onClick={() => setMinimized(false)} className="fixed bottom-4 right-4 z-[100] flex items-center gap-2 rounded-xl border border-violet-500/30 bg-[#111119] px-4 py-3 text-xs font-bold text-violet-200 shadow-2xl">
        {status?.status === 'processing' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
        Video export {status?.progress || 0}%
      </button>
    );
  }

  const busy = preparing || status?.status === 'queued' || status?.status === 'processing';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-violet-500/30 bg-[#111119] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <div className="rounded-xl bg-violet-500/15 p-2 text-violet-300"><Film className="h-5 w-5" /></div>
          <div className="flex-1">
            <h2 className="text-sm font-bold">Export Timeline Video</h2>
            <p className="text-[10px] text-zinc-500">{clips.length} poster scenes · {(store.timelineProject.durationMs / 1000).toFixed(1)} seconds</p>
          </div>
          {busy && <button type="button" onClick={() => setMinimized(true)} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800" title="Minimize"><Minimize2 className="h-4 w-4" /></button>}
          {!busy && <button type="button" onClick={onClose} className="rounded p-1.5 text-zinc-500 hover:bg-zinc-800" title="Close"><X className="h-4 w-4" /></button>}
        </header>

        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <label className="text-[10px] text-zinc-500">Format
            <select value={format} onChange={(event) => setFormat(event.target.value as VideoExportFormat)} disabled={busy} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
              <option value="mp4">MP4 · H.264</option>
              <option value="webm">WebM · VP9</option>
            </select>
          </label>
          <label className="text-[10px] text-zinc-500">Resolution
            <select
              value={`${width}x${height}`}
              onChange={(event) => {
                const [nextWidth, nextHeight] = event.target.value.split('x').map(Number);
                setWidth(nextWidth);
                setHeight(nextHeight);
              }}
              disabled={busy}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200"
            >
              <option value={`${store.canvasWidth}x${store.canvasHeight}`}>Original · {store.canvasWidth} × {store.canvasHeight}</option>
              <option value="1080x1350">Portrait · 1080 × 1350</option>
              <option value="1080x1080">Square · 1080 × 1080</option>
              <option value="1920x1080">Landscape · 1920 × 1080</option>
            </select>
          </label>
          <label className="text-[10px] text-zinc-500">Frame rate
            <select value={fps} onChange={(event) => setFps(Number(event.target.value) as 24 | 30 | 60)} disabled={busy} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
              <option value={24}>24 FPS</option>
              <option value={30}>30 FPS</option>
              <option value={60}>60 FPS</option>
            </select>
          </label>
          <label className="text-[10px] text-zinc-500">Quality
            <select value={quality} onChange={(event) => setQuality(event.target.value as VideoExportQuality)} disabled={busy} className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
              <option value="draft">Draft</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="mx-5 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 text-[10px] text-zinc-500">
          <div className="flex justify-between"><span>Estimated output</span><span className="text-zinc-300">≈ {estimatedMb.toFixed(1)} MB</span></div>
          <div className="mt-1 flex justify-between"><span>Audio</span><span>Unavailable · video exports without audio</span></div>
        </div>

        {(busy || status) && (
          <div className="mx-5 mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
            <div className="flex items-center justify-between text-[10px]">
              <span className="font-bold text-violet-200">{status?.stage || 'Preparing deterministic frames'}</span>
              <span className="font-mono text-zinc-400">{`${status?.progress || 0}%`}</span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-[width]" style={{ width: `${status?.progress || 0}%` }} />
            </div>
            {status?.total_frames ? <div className="mt-1 text-right font-mono text-[8px] text-zinc-600">{status.rendered_frames || 0} / {status.total_frames} frames</div> : null}
          </div>
        )}

        {error && <div className="mx-5 mt-4 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[10px] text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        {!error && status?.error && <div className="mx-5 mt-4 flex gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[10px] text-rose-200"><AlertTriangle className="h-4 w-4 shrink-0" />{status.error}</div>}
        {status?.status === 'completed' && (
          <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-[10px] text-emerald-200">
            <CheckCircle2 className="h-4 w-4" /> Video rendered successfully.
          </div>
        )}

        <footer className="mt-5 flex justify-end gap-2 border-t border-zinc-800 px-5 py-4">
          {busy ? (
            <button type="button" onClick={() => void cancel()} disabled={!status?.job_id} className="rounded-lg border border-rose-500/30 px-4 py-2 text-xs font-bold text-rose-300 disabled:opacity-40">Cancel Render</button>
          ) : status?.status === 'completed' && status.download_url && status.file_name ? (
            <>
              <button type="button" onClick={() => { setStatus(null); setError(''); }} className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300"><RotateCcw className="h-3.5 w-3.5" />New Export</button>
              <button type="button" onClick={() => void downloadRenderedVideo(status.download_url as string, status.file_name as string)} className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white"><Download className="h-3.5 w-3.5" />Download Video</button>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-lg border border-zinc-700 px-4 py-2 text-xs font-bold text-zinc-300">Cancel</button>
              <button type="button" onClick={() => void exportVideo()} disabled={clips.length === 0} className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"><Film className="h-3.5 w-3.5" />Export Video</button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};
