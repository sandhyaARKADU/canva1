import { apiFetch } from './apiClient';
import type {
  VideoRenderCreateResponse,
  VideoRenderPayload,
  VideoRenderStatus,
} from '../types/videoExport';

const responseError = async (response: Response, fallback: string) => {
  const payload = await response.json().catch(() => null);
  return new Error(payload?.detail || payload?.error || fallback);
};

export const createVideoRenderJob = async ({
  projectId,
  settings,
  timeline,
  totalFrames,
  audioFiles = [],
}: VideoRenderPayload): Promise<VideoRenderCreateResponse> => {
  const formData = new FormData();
  formData.append('project_id', projectId);
  formData.append('format', settings.format);
  formData.append('width', String(settings.width));
  formData.append('height', String(settings.height));
  formData.append('fps', String(settings.fps));
  formData.append('quality', settings.quality);
  formData.append('include_audio', String(settings.includeAudio));
  formData.append('timeline_json', JSON.stringify(timeline));
  formData.append('total_frames', String(totalFrames));
  formData.append('audio_file_ids', JSON.stringify(audioFiles.map((file) => file.clipId)));
  console.info('[EXPORT FPS]', {
    fps: settings.fps,
    totalFrames,
    timelineFps: timeline.fps,
    durationMs: timeline.durationMs,
  });
  audioFiles.forEach((file) => {
    formData.append('audio_files', file.blob, file.fileName);
  });
  const response = await apiFetch('/api/video/render/frames', {
    method: 'POST',
    body: formData,
    timeoutMs: 120_000,
  });
  if (!response.ok) {
    const error = await responseError(response, 'Unable to create the video render job.');
    if (error.message.includes('Part exceeded maximum size')) {
      throw new Error('Export payload exceeded the server multipart text-field limit. Large media must be uploaded as files, not embedded in timeline JSON.');
    }
    throw error;
  }
  return response.json();
};

export const uploadVideoRenderFrames = async (
  jobId: string,
  startIndex: number,
  frames: Blob[],
  signal?: AbortSignal,
): Promise<VideoRenderStatus> => {
  const formData = new FormData();
  formData.append('start_index', String(startIndex));
  frames.forEach((frame, index) => {
    formData.append(
      'frames',
      frame,
      `frame-${String(startIndex + index).padStart(6, '0')}.png`,
    );
  });
  const response = await apiFetch(`/api/video/render/${jobId}/frames`, {
    method: 'POST',
    body: formData,
    signal,
    timeoutMs: 120_000,
  });
  if (!response.ok) throw await responseError(response, 'Unable to upload rendered animation frames.');
  return response.json();
};

export const finalizeVideoRenderJob = async (
  jobId: string,
): Promise<VideoRenderStatus> => {
  const response = await apiFetch(`/api/video/render/${jobId}/finalize`, {
    method: 'POST',
    timeoutMs: 30_000,
  });
  if (!response.ok) throw await responseError(response, 'Unable to start video encoding.');
  return response.json();
};

export const getVideoRenderStatus = async (jobId: string): Promise<VideoRenderStatus> => {
  const response = await apiFetch(`/api/video/render/${jobId}`, { timeoutMs: 15_000 });
  if (!response.ok) throw await responseError(response, 'Unable to read video render progress.');
  return response.json();
};

export const cancelVideoRenderJob = async (jobId: string) => {
  const response = await apiFetch(`/api/video/render/${jobId}`, { method: 'DELETE' });
  if (!response.ok) throw await responseError(response, 'Unable to cancel the video render job.');
};

export const downloadRenderedVideo = async (downloadUrl: string, fileName: string) => {
  const response = await apiFetch(downloadUrl, { timeoutMs: 120_000 });
  if (!response.ok) throw await responseError(response, 'Rendered video download failed.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
