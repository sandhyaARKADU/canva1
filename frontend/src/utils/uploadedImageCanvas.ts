import { fabric } from 'fabric';
import type { UploadedImageAsset } from '../types/uploads';
import { DEFAULT_IMAGE_EFFECTS } from './imageEffects';
import { calculateImageFit, createSmartFitImageLayers } from './mediaFittingUtils';

const createObjectId = (prefix: string) => (
  window.crypto?.randomUUID
    ? `${prefix}-${window.crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`
);

const loadImageElement = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const element = new Image();
  element.crossOrigin = 'anonymous';
  element.decoding = 'async';
  element.onload = () => resolve(element);
  element.onerror = () => reject(new Error('The uploaded image is missing or could not be loaded.'));
  element.src = source;
});

export function addUploadedImageToCanvas(
  canvas: fabric.Canvas,
  asset: UploadedImageAsset,
  pointer?: { x: number; y: number },
  isPageImage = true,
) {
  return loadImageElement(asset.url).then(async (element) => {
    if (!element.naturalWidth || !element.naturalHeight) {
      throw new Error('The uploaded image could not be decoded.');
    }

    if (isPageImage && !pointer) {
      // Smart Square Fit for Page Images
      const { foreground } = await createSmartFitImageLayers(canvas, element, {
        name: asset.filename,
        assetId: asset.id,
        assetUrl: asset.url,
        sourceUrl: asset.url,
        fitMode: 'smart-fit',
        backgroundMode: 'blur',
        blurAmount: 40,
        overlayOpacity: 0.15,
      });

      foreground.set({
        thumbnailUrl: asset.thumbnailUrl,
        originalWidth: asset.width,
        originalHeight: asset.height,
        mediaMimeType: asset.mimeType,
        uploadMetadata: asset.metadata,
        imageEffectConfig: { ...DEFAULT_IMAGE_EFFECTS },
        filtersConfig: { ...DEFAULT_IMAGE_EFFECTS },
        cropConfig: null,
      } as Record<string, unknown>);

      return foreground;
    }

    // Floating Image fallback
    const image = new fabric.Image(element, { crossOrigin: 'anonymous' });
    const maxWidth = canvas.getWidth() * 0.8;
    const maxHeight = canvas.getHeight() * 0.8;
    const scale = Math.min(maxWidth / element.naturalWidth, maxHeight / element.naturalHeight, 1);
    image.set({
      id: createObjectId('uploaded-image'),
      name: asset.filename,
      displayName: asset.filename,
      objectType: 'uploaded-image',
      assetId: asset.id,
      assetUrl: asset.url,
      sourceUrl: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      originalWidth: asset.width,
      originalHeight: asset.height,
      naturalWidth: asset.width,
      naturalHeight: asset.height,
      mediaMimeType: asset.mimeType,
      uploadMetadata: asset.metadata,
      imageEffectConfig: { ...DEFAULT_IMAGE_EFFECTS },
      filtersConfig: { ...DEFAULT_IMAGE_EFFECTS },
      cropConfig: null,
      left: pointer?.x ?? canvas.getWidth() / 2,
      top: pointer?.y ?? canvas.getHeight() / 2,
      originX: 'center',
      originY: 'center',
      scaleX: scale,
      scaleY: scale,
      fitMode: 'contain',
      staticExportSupported: true,
    } as Record<string, unknown>);

    canvas.add(image);
    canvas.setActiveObject(image);
    canvas.requestRenderAll();
    return image;
  });
}

export function replaceFabricImageAsset(image: fabric.Image, asset: UploadedImageAsset) {
  return loadImageElement(asset.url).then((element) => {
    image.setElement(element);
    const srcW = element.naturalWidth || element.width || 1080;
    const srcH = element.naturalHeight || element.height || 1080;
    const canvas = image.canvas;
    const frameW = canvas ? canvas.getWidth() : 1080;
    const frameH = canvas ? canvas.getHeight() : 1080;
    const fitMode = (image.get('fitMode' as any) as any) || 'smart-fit';

    const { foreground, background } = calculateImageFit({
      sourceWidth: srcW,
      sourceHeight: srcH,
      frameWidth: frameW,
      frameHeight: frameH,
      fitMode,
    });

    image.set({
      naturalWidth: srcW,
      naturalHeight: srcH,
      originX: 'center',
      originY: 'center',
      left: foreground.left,
      top: foreground.top,
      scaleX: foreground.scaleX,
      scaleY: foreground.scaleY,
      assetId: asset.id,
      assetUrl: asset.url,
      sourceUrl: asset.url,
      thumbnailUrl: asset.thumbnailUrl,
      originalWidth: asset.width,
      originalHeight: asset.height,
      mediaMimeType: asset.mimeType,
      uploadMetadata: asset.metadata,
      cropX: 0,
      cropY: 0,
      cropConfig: null,
      name: asset.filename,
      displayName: asset.filename,
    } as Record<string, unknown>);

    // Update linked background layer if present
    const pairId = image.get('smartFitPairId' as any) || image.get('id' as any);
    if (canvas && pairId) {
      const bgObj = canvas.getObjects().find(
        (o) => o.get('smartFitPairId' as any) === pairId && o.get('isSmartFitBackground' as any) === true,
      );
      if (bgObj && bgObj.type === 'image') {
        (bgObj as fabric.Image).setElement(element);
        bgObj.set({
          originX: 'center',
          originY: 'center',
          left: background.left,
          top: background.top,
          scaleX: background.scaleX,
          scaleY: background.scaleY,
        });
        bgObj.setCoords();
      }
    }

    image.setCoords();
    if (canvas) canvas.requestRenderAll();
  });
}
