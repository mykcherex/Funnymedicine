import * as pdfjsLib from 'pdfjs-dist';

// Configure worker
try {
  if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
  }
} catch (e) {
  console.warn('PDF.js worker initialization warning:', e);
}

// Cached PDF document instances to allow lightning-fast rendering of large documents (up to 400+ pages)
const pdfDocCache = new Map<string, any>();

export async function getOrLoadPdfDocument(docId: string, pdfData: ArrayBuffer | Uint8Array): Promise<any> {
  if (pdfDocCache.has(docId)) {
    return pdfDocCache.get(docId);
  }

  const dataCopy = pdfData.slice(0);
  const loadingTask = pdfjsLib.getDocument({
    data: dataCopy,
    cMapUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjsLib.version + '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@' + pdfjsLib.version + '/standard_fonts/',
    disableAutoFetch: true,
    disableStream: false,
  });

  const pdfDoc = await loadingTask.promise;
  pdfDocCache.set(docId, pdfDoc);
  return pdfDoc;
}

export function clearPdfCache(docId?: string) {
  if (docId) {
    pdfDocCache.delete(docId);
  } else {
    pdfDocCache.clear();
  }
}

/**
 * Retrieve the natural unscaled dimensions (in points) of a PDF page (defaults to page 1).
 */
export async function getPdfNaturalDimensions(
  docId: string,
  pdfData: ArrayBuffer | Uint8Array,
  pageNum: number = 1
): Promise<{ width: number; height: number }> {
  try {
    const pdfDoc = await getOrLoadPdfDocument(docId, pdfData);
    const validPage = Math.max(1, Math.min(pageNum, pdfDoc.numPages));
    const page = await pdfDoc.getPage(validPage);
    const viewport = page.getViewport({ scale: 1.0 });
    return { width: viewport.width, height: viewport.height };
  } catch (e) {
    console.warn('Could not read natural PDF dimensions:', e);
    return { width: 612, height: 792 }; // US Letter default
  }
}

// Track active PDF.js render tasks to prevent concurrent rendering on the same canvas
const activeRenderTasks = new WeakMap<HTMLCanvasElement, any>();

/**
 * Load and render a real PDF page using PDF.js onto an HTML5 canvas.
 * Designed for continuous virtualized rendering and infinite zooming.
 */
export async function renderPdfPageToCanvas(
  canvas: HTMLCanvasElement,
  docId: string,
  pdfData: ArrayBuffer | Uint8Array,
  pageNumber: number,
  scale: number = 1.0
): Promise<{ text: string; width: number; height: number; numPages: number }> {
  // Cancel any prior in-flight render task on this canvas to prevent matrix corruption
  const existingTask = activeRenderTasks.get(canvas);
  if (existingTask) {
    try {
      existingTask.cancel();
    } catch {
      // Ignore cancellation exceptions
    }
    activeRenderTasks.delete(canvas);
  }

  const pdfDoc = await getOrLoadPdfDocument(docId, pdfData);
  const numPages = pdfDoc.numPages;

  const validPageNum = Math.max(1, Math.min(pageNumber, numPages));
  const page = await pdfDoc.getPage(validPageNum);

  // Extract text content from the PDF page
  let extractedText = '';
  try {
    const textContent = await page.getTextContent();
    extractedText = textContent.items
      .map((item: any) => item.str || '')
      .join(' ');
  } catch (textErr) {
    console.warn('Text extraction warning on page ' + validPageNum, textErr);
  }

  // Base PDF scale factor: 1.35 for standard readability multiplied by zoom scale
  const viewport = page.getViewport({ scale: Math.max(0.2, scale * 1.35) });
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5); // Cap DPR to prevent memory exhaustion on ultra-zoom

  canvas.width = Math.floor(viewport.width * dpr);
  canvas.height = Math.floor(viewport.height * dpr);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get 2D canvas context');
  }

  // CRITICAL: Explicitly reset canvas transformation matrix to identity.
  // This completely eliminates leftover or inverted matrices from previous or interrupted renders.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // According to the official PDF.js specification for HiDPI/Retina screens,
  // pass the transform matrix [dpr, 0, 0, dpr, 0, 0] in renderContext instead of
  // calling ctx.scale() manually, which would otherwise flip or compound transformations.
  const transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined;

  const renderContext = {
    canvasContext: ctx,
    viewport,
    canvas,
    transform,
  };

  const renderTask = page.render(renderContext);
  activeRenderTasks.set(canvas, renderTask);

  try {
    await renderTask.promise;
  } catch (err: any) {
    if (err?.name === 'RenderingCancelledException' || err?.message?.includes('cancelled')) {
      // Normal cancellation when switching pages or scrolling rapidly
      return {
        text: extractedText,
        width: viewport.width,
        height: viewport.height,
        numPages,
      };
    }
    throw err;
  } finally {
    if (activeRenderTasks.get(canvas) === renderTask) {
      activeRenderTasks.delete(canvas);
    }
  }

  return {
    text: extractedText,
    width: viewport.width,
    height: viewport.height,
    numPages,
  };
}

/**
 * Render a text or markdown document page onto canvas
 */
export function renderTextPageToCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  pageNumber: number,
  totalPages: number,
  documentTitle: string,
  scale: number = 1.0
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const baseWidth = 800;
  const baseHeight = 1040;
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  canvas.width = Math.floor(baseWidth * scale * dpr);
  canvas.height = Math.floor(baseHeight * scale * dpr);
  canvas.style.width = `${Math.floor(baseWidth * scale)}px`;
  canvas.style.height = `${Math.floor(baseHeight * scale)}px`;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(scale * dpr, scale * dpr);

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, baseWidth, baseHeight);

  // Border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, baseWidth, baseHeight);

  // Header band
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(36, 30, baseWidth - 72, 3);

  // Header text
  ctx.fillStyle = '#475569';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.fillText(documentTitle.toUpperCase(), 36, 52);

  ctx.textAlign = 'right';
  ctx.fillText(`PAGE ${pageNumber} OF ${totalPages}`, baseWidth - 36, 52);
  ctx.textAlign = 'left';

  // Divider
  ctx.strokeStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(36, 62);
  ctx.lineTo(baseWidth - 36, 62);
  ctx.stroke();

  // Content
  const lines = text.split('\n');
  let y = 90;
  const lineHeight = 19;
  const marginX = 40;
  const maxContentWidth = baseWidth - 80;

  for (const line of lines) {
    if (y > baseHeight - 60) break; // page boundary
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 16px Inter, system-ui, sans-serif';
      ctx.fillText(trimmed.replace(/^#\s*/, ''), marginX, y);
      y += 26;
    } else if (trimmed.startsWith('## ')) {
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 13px Inter, system-ui, sans-serif';
      ctx.fillText(trimmed.replace(/^##\s*/, ''), marginX, y);
      y += 22;
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      ctx.fillStyle = '#334155';
      ctx.font = 'normal 11px Inter, system-ui, sans-serif';
      ctx.fillText('•  ' + trimmed.slice(2), marginX + 8, y);
      y += lineHeight;
    } else if (trimmed === '') {
      y += 12;
    } else {
      ctx.fillStyle = '#334155';
      ctx.font = 'normal 11px Inter, system-ui, sans-serif';

      const words = trimmed.split(' ');
      let currentLine = '';
      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxContentWidth && n > 0) {
          ctx.fillText(currentLine, marginX, y);
          currentLine = words[n] + ' ';
          y += lineHeight;
          if (y > baseHeight - 60) break;
        } else {
          currentLine = testLine;
        }
      }
      ctx.fillText(currentLine, marginX, y);
      y += lineHeight;
    }
  }

  // Footer
  const footerY = baseHeight - 30;
  ctx.strokeStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.moveTo(36, footerY - 14);
  ctx.lineTo(baseWidth - 36, footerY - 14);
  ctx.stroke();

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 10px Inter, system-ui, sans-serif';
  ctx.fillText('DOCUGEMINI SMART DOCUMENT READER', 36, footerY);

  ctx.textAlign = 'right';
  ctx.fillText(`Page ${pageNumber} of ${totalPages}`, baseWidth - 36, footerY);
  ctx.textAlign = 'left';
}
