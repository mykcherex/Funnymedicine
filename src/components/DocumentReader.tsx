import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  FileText,
  Plus,
  Sparkles,
  Layers,
  AlertCircle,
  Check,
  Crop,
  X,
  ScrollText,
  Move,
  RotateCcw,
  FoldHorizontal,
} from 'lucide-react';
import { DocumentItem, DocumentPageSnapshot } from '../types';
import {
  renderPdfPageToCanvas,
  renderTextPageToCanvas,
  getOrLoadPdfDocument,
  getPdfNaturalDimensions,
} from '../utils/documentRenderer';

interface DocumentReaderProps {
  onShareToPrompt: (snapshot: DocumentPageSnapshot, initialQuery?: string) => void;
  activeAttachedPage: number | null;
}

interface CropBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'n' | 's' | 'e' | 'w' | 'new' | null;

export const DocumentReader: React.FC<DocumentReaderProps> = ({
  onShareToPrompt,
  activeAttachedPage,
}) => {
  // Document state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageInputVal, setPageInputVal] = useState<string>('1');

  // Infinite zoom state (from 0.2 up to unlimited, e.g. 10.0x / 1000%)
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const [isFitWidth, setIsFitWidth] = useState<boolean>(true);
  const [showThumbnails, setShowThumbnails] = useState<boolean>(false);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [captureSuccess, setCaptureSuccess] = useState<boolean>(false);
  const [extractedPageText, setExtractedPageText] = useState<string>('');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);

  // Continuous scrolling mode: render pages continuously in a vertical feed
  const [isContinuousScroll, setIsContinuousScroll] = useState<boolean>(true);

  // Interactive Cropping state:
  // When crop mode is turned on, a scalable box appears automatically!
  const [isCropMode, setIsCropMode] = useState<boolean>(false);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);

  // Drag interaction tracking refs
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    boxX: number;
    boxY: number;
    boxWidth: number;
    boxHeight: number;
  } | null>(null);

  // Store ArrayBuffers for loaded PDFs mapped by document ID
  const pdfBuffersRef = useRef<Map<string, ArrayBuffer>>(new Map());

  // References
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const singleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const cropOverlayRef = useRef<HTMLDivElement | null>(null);

  const activeDoc = documents.find((d) => d.id === activeDocId) || null;

  // Compute the optimal zoomScale that fits the document page neatly into the container's width
  const computeFitWidthScale = useCallback(
    (doc?: DocumentItem | null) => {
      const targetDoc = doc || activeDoc;
      if (!targetDoc) return 1.0;

      const container = scrollContainerRef.current;
      const containerWidth = container
        ? container.clientWidth
        : typeof window !== 'undefined'
        ? window.innerWidth
        : 600;

      // Generous side breathing room: 16px on mobile, 36px on larger screens
      const isMobile = containerWidth < 640;
      const horizontalPadding = isMobile ? 16 : 36;
      const availableWidth = Math.max(160, containerWidth - horizontalPadding);

      const unscaledWidth = targetDoc.naturalWidth || 612;
      if (targetDoc.type === 'pdf') {
        // PDF renderer internally multiplies scale by 1.35
        const baseWidth = unscaledWidth * 1.35;
        const computed = availableWidth / baseWidth;
        return Math.max(0.2, Math.min(3.0, Number(computed.toFixed(2))));
      } else {
        // Text renderer uses baseWidth = 800
        const computed = availableWidth / 800;
        return Math.max(0.2, Math.min(3.0, Number(computed.toFixed(2))));
      }
    },
    [activeDoc]
  );

  // Compute scale that fits the entire page (width + height) into the viewport
  const computeFitPageScale = useCallback(
    (doc?: DocumentItem | null) => {
      const targetDoc = doc || activeDoc;
      if (!targetDoc) return 1.0;

      const container = scrollContainerRef.current;
      const containerWidth = container ? container.clientWidth : 600;
      const containerHeight = container ? container.clientHeight : 800;

      const isMobile = containerWidth < 640;
      const horizontalPadding = isMobile ? 16 : 36;
      const verticalPadding = isMobile ? 24 : 48;

      const availableWidth = Math.max(160, containerWidth - horizontalPadding);
      const availableHeight = Math.max(180, containerHeight - verticalPadding);

      const unscaledWidth = targetDoc.naturalWidth || 612;
      const unscaledHeight = targetDoc.naturalHeight || 792;

      if (targetDoc.type === 'pdf') {
        const baseW = unscaledWidth * 1.35;
        const baseH = unscaledHeight * 1.35;
        const scaleW = availableWidth / baseW;
        const scaleH = availableHeight / baseH;
        return Math.max(0.2, Math.min(3.0, Number(Math.min(scaleW, scaleH).toFixed(2))));
      } else {
        const scaleW = availableWidth / 800;
        const scaleH = availableHeight / 1040;
        return Math.max(0.2, Math.min(3.0, Number(Math.min(scaleW, scaleH).toFixed(2))));
      }
    },
    [activeDoc]
  );

  // Automatically fit document width when document is opened or changed
  useEffect(() => {
    if (activeDoc) {
      // Small timeout to allow DOM container to resolve its client dimensions
      const timer = setTimeout(() => {
        const fitScale = computeFitWidthScale(activeDoc);
        setZoomScale(fitScale);
        setIsFitWidth(true);
      }, 40);
      return () => clearTimeout(timer);
    }
  }, [activeDocId, computeFitWidthScale]);

  // Keep fit-width reactive to window and panel resizing
  useEffect(() => {
    if (!isFitWidth || !activeDoc) return;
    const handleResize = () => {
      const fitScale = computeFitWidthScale(activeDoc);
      setZoomScale(fitScale);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFitWidth, activeDoc, computeFitWidthScale]);

  // Sync page input
  useEffect(() => {
    setPageInputVal(currentPage.toString());
  }, [currentPage]);

  // Window wheel listener on document area to support Ctrl + Wheel or Pinch for infinite smooth zoom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.15 : -0.15;
        setIsFitWidth(false);
        setZoomScale((prev) => {
          const next = prev + delta * (prev >= 2.0 ? 0.3 : 0.15);
          return Math.max(0.2, Number(next.toFixed(2))); // infinite zoom upper bound
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Cache rendered page status to avoid redundant re-renders or concurrent canvas conflicts
  const renderedPagesCache = useRef<Map<number, { docId: string; scale: number }>>(new Map());

  // Invalidate render cache when active document, mode, or zoom scale changes
  useEffect(() => {
    renderedPagesCache.current.clear();
  }, [activeDocId, zoomScale, isContinuousScroll]);

  // Track active page during continuous vertical scrolling with rAF throttling
  const isScrollTicking = useRef(false);
  const handleScroll = useCallback(() => {
    if (!isContinuousScroll || !activeDoc || activeDoc.totalPages <= 1) return;
    if (isScrollTicking.current) return;
    isScrollTicking.current = true;

    requestAnimationFrame(() => {
      isScrollTicking.current = false;
      const container = scrollContainerRef.current;
      if (!container) return;

      const containerTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const midPoint = containerTop + containerHeight / 3;

      for (let p = 1; p <= activeDoc.totalPages; p++) {
        const pageEl = document.getElementById(`doc-page-container-${p}`);
        if (pageEl) {
          const top = pageEl.offsetTop;
          const bottom = top + pageEl.offsetHeight;
          if (midPoint >= top && midPoint <= bottom) {
            if (currentPage !== p) {
              setCurrentPage(p);
            }
            break;
          }
        }
      }
    });
  }, [isContinuousScroll, activeDoc, currentPage]);

  // Render individual page helper with caching and concurrency guard
  const renderSinglePage = async (pageNum: number, canvas: HTMLCanvasElement, force: boolean = false) => {
    if (!activeDoc) return;

    // Check if this page has already been rendered at current scale for this document
    const cached = renderedPagesCache.current.get(pageNum);
    if (!force && cached && cached.docId === activeDoc.id && cached.scale === zoomScale) {
      return;
    }

    try {
      if (activeDoc.type === 'pdf') {
        const buffer = pdfBuffersRef.current.get(activeDoc.id);
        if (!buffer) return;
        const res = await renderPdfPageToCanvas(
          canvas,
          activeDoc.id,
          buffer,
          pageNum,
          zoomScale
        );
        renderedPagesCache.current.set(pageNum, { docId: activeDoc.id, scale: zoomScale });
        if (pageNum === currentPage) {
          setExtractedPageText(res.text || '');
        }
      } else if (activeDoc.type === 'text') {
        renderTextPageToCanvas(
          canvas,
          activeDoc.rawText || '',
          pageNum,
          activeDoc.totalPages || 1,
          activeDoc.name,
          zoomScale
        );
        renderedPagesCache.current.set(pageNum, { docId: activeDoc.id, scale: zoomScale });
      }
    } catch (err: any) {
      console.warn(`Render error on page ${pageNum}:`, err);
    }
  };

  // Re-render when document, continuous mode, active page, or zoom scale changes
  useEffect(() => {
    if (!activeDoc) return;
    setRenderError(null);

    if (isContinuousScroll) {
      // In continuous mode, render visible pages around currentPage
      const minPage = Math.max(1, currentPage - 2);
      const maxPage = Math.min(activeDoc.totalPages, currentPage + 3);

      for (let p = minPage; p <= maxPage; p++) {
        const canvas = canvasRefs.current.get(p);
        if (canvas) {
          renderSinglePage(p, canvas);
        }
      }
    } else {
      // Single page mode
      if (singleCanvasRef.current) {
        renderSinglePage(currentPage, singleCanvasRef.current, true);
      }
    }
  }, [activeDocId, currentPage, zoomScale, isContinuousScroll, activeDoc]);

  // When Crop Mode is toggled ON, automatically create a scalable box in the center of the active page!
  const initializeAutomaticCropBox = useCallback(() => {
    // Determine target canvas
    const targetCanvas = isContinuousScroll
      ? canvasRefs.current.get(currentPage)
      : singleCanvasRef.current;

    let targetWidth = 600;
    let targetHeight = 800;

    if (cropOverlayRef.current) {
      targetWidth = cropOverlayRef.current.clientWidth;
      targetHeight = cropOverlayRef.current.clientHeight;
    } else if (targetCanvas) {
      targetWidth = targetCanvas.clientWidth || 600;
      targetHeight = targetCanvas.clientHeight || 800;
    }

    // Default crop box: centered, taking roughly 70% of width and 40% of height
    const boxWidth = Math.min(targetWidth - 20, Math.max(100, Math.round(targetWidth * 0.70)));
    const boxHeight = Math.min(targetHeight - 20, Math.max(80, Math.round(targetHeight * 0.40)));
    const x = Math.max(10, Math.round((targetWidth - boxWidth) / 2));
    const y = Math.max(10, Math.round((targetHeight - boxHeight) / 3));

    setCropBox({
      x,
      y,
      width: boxWidth,
      height: boxHeight,
    });
  }, [isContinuousScroll, currentPage]);

  // Toggle crop mode
  const handleToggleCropMode = () => {
    if (!isCropMode) {
      setIsCropMode(true);
      // Wait for layout/overlay to attach then compute default scalable box
      setTimeout(() => {
        initializeAutomaticCropBox();
      }, 50);
    } else {
      setIsCropMode(false);
      setCropBox(null);
      setDragMode(null);
    }
  };

  // Initialize crop box only when crop mode is toggled on and no box exists
  useEffect(() => {
    if (isCropMode && !cropBox) {
      initializeAutomaticCropBox();
    }
  }, [isCropMode, cropBox, initializeAutomaticCropBox]);

  // Scroll smoothly to a specific page in continuous mode
  const scrollToPage = (pageNum: number) => {
    setCurrentPage(pageNum);
    if (isContinuousScroll) {
      const pageEl = document.getElementById(`doc-page-container-${pageNum}`);
      if (pageEl && scrollContainerRef.current) {
        pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // Handle file uploads
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingDoc(true);
    setRenderError(null);
    setCropBox(null);
    setIsCropMode(false);

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const docId = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    if (isPdf) {
      try {
        const buffer = await file.arrayBuffer();
        pdfBuffersRef.current.set(docId, buffer);

        const pdfDoc = await getOrLoadPdfDocument(docId, buffer);
        const totalPages = Math.min(400, pdfDoc.numPages);
        const { width: natW, height: natH } = await getPdfNaturalDimensions(docId, buffer, 1);

        const newDoc: DocumentItem = {
          id: docId,
          name: file.name,
          type: 'pdf',
          fileSize:
            file.size > 1024 * 1024
              ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
              : `${(file.size / 1024).toFixed(0)} KB`,
          totalPages: totalPages,
          naturalWidth: natW,
          naturalHeight: natH,
        };

        setDocuments((prev) => [newDoc, ...prev]);
        setActiveDocId(newDoc.id);
        setCurrentPage(1);
      } catch (err: any) {
        console.error('Failed to load PDF:', err);
        setRenderError(`Could not open PDF: ${err?.message || 'Invalid or encrypted PDF file'}`);
      } finally {
        setIsLoadingDoc(false);
      }
    } else {
      try {
        const text = await file.text();
        const newDoc: DocumentItem = {
          id: docId,
          name: file.name,
          type: 'text',
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
          totalPages: 1,
          rawText: text,
          naturalWidth: 800,
          naturalHeight: 1040,
        };

        setDocuments((prev) => [newDoc, ...prev]);
        setActiveDocId(newDoc.id);
        setCurrentPage(1);
      } catch (err: any) {
        console.error('Failed to load document:', err);
        setRenderError('Could not read text file.');
      } finally {
        setIsLoadingDoc(false);
      }
    }

    e.target.value = '';
  };

  // Preloaded sample report document for instant testing
  const loadSampleDocument = () => {
    setIsLoadingDoc(true);
    setRenderError(null);
    setCropBox(null);
    setIsCropMode(false);

    const docId = `doc-sample-${Date.now()}`;
    const sampleMarkdown = `# Deep Learning & Multimodal AI Research
## Executive Summary & Architecture Overview

Modern foundation models combine text comprehension, computer vision, and spatial reasoning into unified multimodal architectures.

### Key Highlights & Technical Breakthroughs:
- **Vision Transformers (ViT)**: Patch-based visual feature extraction enables fine-grained OCR, document table parsing, and high-resolution diagram analysis.
- **Cross-Modal Alignment**: Joint representation spaces bridge document typography, mathematical formulae, and conversational query semantics.
- **Linearized Attention**: Sub-quadratic attention mechanisms drastically reduce memory overhead during long-context document analysis.

### System Performance Benchmarks:
- Accuracy on Dense Document Layouts: 96.8%
- Processing Latency: Under 380ms for typical complex pages
- Full-Document Token Context: Up to 1,000,000 tokens

### Quick Tips for Reading & AI Analysis:
1. Tap **Fit Width** to smoothly fit pages to your phone or desktop screen width.
2. Tap **Crop Area** to position a scalable box over any chart or paragraph.
3. Tap **Send Cropped Box** or the floating AI button to instantly ask Gemini about that specific section!`;

    const newDoc: DocumentItem = {
      id: docId,
      name: 'Multimodal_AI_Technical_Overview.md',
      type: 'text',
      fileSize: '3.1 KB',
      totalPages: 1,
      rawText: sampleMarkdown,
      naturalWidth: 800,
      naturalHeight: 1040,
    };

    setDocuments((prev) => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setCurrentPage(1);
    setIsLoadingDoc(false);
  };

  // Jump to specific page input
  const handlePageJump = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDoc) return;
    const pageNum = parseInt(pageInputVal, 10);
    if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= activeDoc.totalPages) {
      scrollToPage(pageNum);
    } else {
      setPageInputVal(currentPage.toString());
    }
  };

  // Zoom control helpers
  const handleFitWidth = () => {
    if (!activeDoc) return;
    const fitScale = computeFitWidthScale(activeDoc);
    setZoomScale(fitScale);
    setIsFitWidth(true);
  };

  const handleFitPage = () => {
    if (!activeDoc) return;
    const fitScale = computeFitPageScale(activeDoc);
    setZoomScale(fitScale);
    setIsFitWidth(false);
  };

  const handleZoomIn = () => {
    setIsFitWidth(false);
    setZoomScale((prev) => Number((prev + 0.15).toFixed(2)));
  };

  const handleZoomOut = () => {
    setIsFitWidth(false);
    setZoomScale((prev) => Math.max(0.2, Number((prev - 0.15).toFixed(2))));
  };

  const handleResetZoom = () => {
    setIsFitWidth(false);
    setZoomScale(1.0);
  };

  // Unified pointer handler for moving, resizing, and drawing new crop box
  const startDrag = (
    mode: NonNullable<DragMode>,
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!cropOverlayRef.current) return;

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const overlayRect = cropOverlayRef.current.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;

    const baseBox: CropBox = cropBox || {
      x: Math.max(0, e.clientX - overlayRect.left),
      y: Math.max(0, e.clientY - overlayRect.top),
      width: 50,
      height: 50,
    };

    setDragMode(mode);

    const onPointerMove = (moveEvt: PointerEvent) => {
      moveEvt.preventDefault();
      moveEvt.stopPropagation();

      const deltaX = moveEvt.clientX - startX;
      const deltaY = moveEvt.clientY - startY;
      const maxW = overlayRect.width;
      const maxH = overlayRect.height;
      const minSize = 25;

      let newX = baseBox.x;
      let newY = baseBox.y;
      let newW = baseBox.width;
      let newH = baseBox.height;

      if (mode === 'move') {
        newX = Math.max(0, Math.min(baseBox.x + deltaX, maxW - baseBox.width));
        newY = Math.max(0, Math.min(baseBox.y + deltaY, maxH - baseBox.height));
      } else if (mode === 'new') {
        const curX = Math.max(0, Math.min(moveEvt.clientX - overlayRect.left, maxW));
        const curY = Math.max(0, Math.min(moveEvt.clientY - overlayRect.top, maxH));
        const originX = Math.max(0, Math.min(startX - overlayRect.left, maxW));
        const originY = Math.max(0, Math.min(startY - overlayRect.top, maxH));

        newX = Math.min(originX, curX);
        newY = Math.min(originY, curY);
        newW = Math.max(minSize, Math.abs(curX - originX));
        newH = Math.max(minSize, Math.abs(curY - originY));
      } else {
        // Resizing
        if (mode.includes('e')) {
          newW = Math.max(minSize, Math.min(baseBox.width + deltaX, maxW - baseBox.x));
        }
        if (mode.includes('s')) {
          newH = Math.max(minSize, Math.min(baseBox.height + deltaY, maxH - baseBox.y));
        }
        if (mode.includes('w')) {
          const potentialW = baseBox.width - deltaX;
          if (potentialW >= minSize) {
            const clampedX = Math.max(0, baseBox.x + deltaX);
            newW = baseBox.width + (baseBox.x - clampedX);
            newX = clampedX;
          } else {
            newX = baseBox.x + (baseBox.width - minSize);
            newW = minSize;
          }
        }
        if (mode.includes('n')) {
          const potentialH = baseBox.height - deltaY;
          if (potentialH >= minSize) {
            const clampedY = Math.max(0, baseBox.y + deltaY);
            newH = baseBox.height + (baseBox.y - clampedY);
            newY = clampedY;
          } else {
            newY = baseBox.y + (baseBox.height - minSize);
            newH = minSize;
          }
        }
      }

      setCropBox({
        x: Math.round(newX),
        y: Math.round(newY),
        width: Math.round(newW),
        height: Math.round(newH),
      });
    };

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      setDragMode(null);
    };

    window.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
    window.addEventListener('pointerup', onPointerUp, { capture: true, passive: false });
    window.addEventListener('pointercancel', onPointerUp, { capture: true, passive: false });
  };

  // Capture canvas view (or cropped region) and dispatch to Gemini Chat prompt
  const captureAndShare = (initialQuery?: string) => {
    if (!activeDoc) return;

    // Determine target canvas
    let targetCanvas: HTMLCanvasElement | null = null;
    if (isContinuousScroll) {
      targetCanvas = canvasRefs.current.get(currentPage) || null;
    } else {
      targetCanvas = singleCanvasRef.current;
    }

    if (!targetCanvas) return;
    setIsCapturing(true);

    try {
      let finalDataUrl: string;
      let finalWidth = targetCanvas.width;
      let finalHeight = targetCanvas.height;
      let snapshotNote = `Page ${currentPage} of ${activeDoc.name}`;
      const isRegionCrop = Boolean(
        isCropMode && cropBox && cropBox.width > 15 && cropBox.height > 15 && cropOverlayRef.current
      );

      // If in crop mode and scalable box exists, crop that exact portion of the page
      if (isRegionCrop && cropBox && cropOverlayRef.current) {
        const overlayRect = cropOverlayRef.current.getBoundingClientRect();
        const scaleX = targetCanvas.width / overlayRect.width;
        const scaleY = targetCanvas.height / overlayRect.height;

        // Exact pixel coordinates on target canvas
        const sx = Math.max(0, Math.min(Math.floor(cropBox.x * scaleX), targetCanvas.width - 1));
        const sy = Math.max(0, Math.min(Math.floor(cropBox.y * scaleY), targetCanvas.height - 1));
        const sw = Math.max(1, Math.min(Math.floor(cropBox.width * scaleX), targetCanvas.width - sx));
        const sh = Math.max(1, Math.min(Math.floor(cropBox.height * scaleY), targetCanvas.height - sy));

        // Destination canvas has exact dimensions of the crop (scaled down if exceeds 1600px)
        const maxDim = 1600;
        let exportW = sw;
        let exportH = sh;
        if (exportW > maxDim || exportH > maxDim) {
          const ratio = Math.min(maxDim / exportW, maxDim / exportH);
          exportW = Math.round(exportW * ratio);
          exportH = Math.round(exportH * ratio);
        }

        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = exportW;
        cropCanvas.height = exportH;

        const cropCtx = cropCanvas.getContext('2d');
        if (cropCtx) {
          cropCtx.fillStyle = '#ffffff';
          cropCtx.fillRect(0, 0, exportW, exportH);
          // Draw ONLY the exact cropped region onto destination canvas
          cropCtx.drawImage(
            targetCanvas,
            sx,
            sy,
            sw,
            sh,
            0,
            0,
            exportW,
            exportH
          );
          finalDataUrl = cropCanvas.toDataURL('image/jpeg', 0.88);
          finalWidth = exportW;
          finalHeight = exportH;
          snapshotNote = `Cropped selection (${sw}×${sh}px) on Page ${currentPage} of ${activeDoc.name}`;
        } else {
          finalDataUrl = targetCanvas.toDataURL('image/jpeg', 0.85);
        }
      } else {
        // Full page snapshot with max dimension clamping
        const maxDim = 1600;
        let exportW = targetCanvas.width;
        let exportH = targetCanvas.height;
        if (exportW > maxDim || exportH > maxDim) {
          const ratio = Math.min(maxDim / exportW, maxDim / exportH);
          exportW = Math.round(exportW * ratio);
          exportH = Math.round(exportH * ratio);
        }

        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = exportW;
        exportCanvas.height = exportH;
        const exportCtx = exportCanvas.getContext('2d');
        if (exportCtx) {
          exportCtx.fillStyle = '#ffffff';
          exportCtx.fillRect(0, 0, exportW, exportH);
          exportCtx.drawImage(targetCanvas, 0, 0, exportW, exportH);
          finalDataUrl = exportCanvas.toDataURL('image/jpeg', 0.85);
          finalWidth = exportW;
          finalHeight = exportH;
        } else {
          finalDataUrl = targetCanvas.toDataURL('image/jpeg', 0.85);
        }
      }

      const snapshot: DocumentPageSnapshot = {
        pageNumber: currentPage,
        imageUrl: finalDataUrl,
        extractedText: isRegionCrop
          ? `[Cropped Selection (${finalWidth}×${finalHeight}px) from Page ${currentPage} of "${activeDoc.name}"]`
          : (extractedPageText || `Visual snapshot of Page ${currentPage} of ${activeDoc.name}`),
        documentName: activeDoc.name,
        width: finalWidth,
        height: finalHeight,
        timestamp: Date.now(),
        isCropped: isRegionCrop,
      };

      onShareToPrompt(snapshot, initialQuery);
      setCaptureSuccess(true);
      setTimeout(() => setCaptureSuccess(false), 2200);
    } catch (e) {
      console.error('Snapshot capture error:', e);
    } finally {
      setIsCapturing(false);
    }
  };

  // Render the Scalable Crop Box with 8 Resize Handles + Move Handle
  const renderScalableCropBox = () => {
    if (!isCropMode || !cropBox) return null;

    return (
      <div
        ref={cropOverlayRef}
        className="absolute inset-0 z-30 pointer-events-auto select-none touch-none"
      >
        {/* Semi-transparent dark backdrops: touching/dragging on backdrop draws a new crop area! */}
        <div
          style={{ top: 0, left: 0, right: 0, height: `${cropBox.y}px` }}
          className="absolute bg-black/50 cursor-crosshair touch-none"
          onPointerDown={(e) => startDrag('new', e)}
          title="Drag to select new crop area"
        />
        <div
          style={{
            top: `${cropBox.y}px`,
            left: 0,
            width: `${cropBox.x}px`,
            height: `${cropBox.height}px`,
          }}
          className="absolute bg-black/50 cursor-crosshair touch-none"
          onPointerDown={(e) => startDrag('new', e)}
          title="Drag to select new crop area"
        />
        <div
          style={{
            top: `${cropBox.y}px`,
            left: `${cropBox.x + cropBox.width}px`,
            right: 0,
            height: `${cropBox.height}px`,
          }}
          className="absolute bg-black/50 cursor-crosshair touch-none"
          onPointerDown={(e) => startDrag('new', e)}
          title="Drag to select new crop area"
        />
        <div
          style={{
            top: `${cropBox.y + cropBox.height}px`,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          className="absolute bg-black/50 cursor-crosshair touch-none"
          onPointerDown={(e) => startDrag('new', e)}
          title="Drag to select new crop area"
        />

        {/* The Scalable Crop Box */}
        <div
          style={{
            left: `${cropBox.x}px`,
            top: `${cropBox.y}px`,
            width: `${cropBox.width}px`,
            height: `${cropBox.height}px`,
          }}
          onPointerDown={(e) => startDrag('move', e)}
          className="absolute border-2 border-amber-400 bg-amber-400/10 shadow-2xl cursor-move group transition-shadow ring-2 ring-amber-500/25 touch-none"
        >
          {/* Top Label & Action Strip */}
          <div className="absolute -top-8 left-0 right-0 flex items-center justify-between pointer-events-none select-none">
            <div className="bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded shadow flex items-center gap-1 pointer-events-auto">
              <Move className="w-3 h-3" />
              <span>{Math.round(cropBox.width)} × {Math.round(cropBox.height)} px</span>
              <span className="opacity-75 font-normal text-[9px] hidden sm:inline">(Drag box or handles)</span>
            </div>

            <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/90 backdrop-blur-sm border border-slate-700/80 p-0.5 rounded-md shadow-lg">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  initializeAutomaticCropBox();
                }}
                title="Reset Crop Box"
                className="text-slate-300 hover:text-white hover:bg-slate-800 p-1 rounded text-[10px] transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (cropOverlayRef.current) {
                    const rect = cropOverlayRef.current.getBoundingClientRect();
                    setCropBox({
                      x: 8,
                      y: 8,
                      width: Math.max(50, Math.round(rect.width - 16)),
                      height: Math.max(50, Math.round(rect.height - 16)),
                    });
                  }
                }}
                title="Expand to Full Page"
                className="text-slate-300 hover:text-white hover:bg-slate-800 p-1 rounded text-[10px] transition-colors"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  captureAndShare();
                }}
                title="Send Cropped Selection to Gemini"
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold px-2 py-0.5 rounded text-[10px] flex items-center gap-1 shadow transition-colors"
              >
                <Sparkles className="w-3 h-3 text-slate-950" />
                <span>Send</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCropMode(false);
                  setCropBox(null);
                  setDragMode(null);
                }}
                title="Cancel Crop"
                className="text-slate-400 hover:text-red-400 hover:bg-slate-800 p-1 rounded text-[10px] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* 3x3 Grid Lines inside crop box */}
          <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-40">
            <div className="border-r border-b border-dashed border-amber-300/50" />
            <div className="border-r border-b border-dashed border-amber-300/50" />
            <div className="border-b border-dashed border-amber-300/50" />
            <div className="border-r border-b border-dashed border-amber-300/50" />
            <div className="border-r border-b border-dashed border-amber-300/50" />
            <div className="border-b border-dashed border-amber-300/50" />
            <div className="border-r border-dashed border-amber-300/50" />
            <div className="border-r border-dashed border-amber-300/50" />
            <div />
          </div>

          {/* 4 Corner Resize Handles with generous touch target pads */}
          <div
            onPointerDown={(e) => startDrag('nw', e)}
            className="absolute -top-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-20 group/handle"
            title="Resize Top-Left"
          >
            <div className="w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-sm shadow-md group-hover/handle:scale-125 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('ne', e)}
            className="absolute -top-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-20 group/handle"
            title="Resize Top-Right"
          >
            <div className="w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-sm shadow-md group-hover/handle:scale-125 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('se', e)}
            className="absolute -bottom-3.5 -right-3.5 w-7 h-7 flex items-center justify-center cursor-nwse-resize touch-none z-20 group/handle"
            title="Resize Bottom-Right"
          >
            <div className="w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-sm shadow-md group-hover/handle:scale-125 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('sw', e)}
            className="absolute -bottom-3.5 -left-3.5 w-7 h-7 flex items-center justify-center cursor-nesw-resize touch-none z-20 group/handle"
            title="Resize Bottom-Left"
          >
            <div className="w-4 h-4 bg-amber-400 border-2 border-slate-950 rounded-sm shadow-md group-hover/handle:scale-125 transition-transform" />
          </div>

          {/* 4 Edge Midpoint Handles with generous touch pads */}
          <div
            onPointerDown={(e) => startDrag('n', e)}
            className="absolute -top-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-center justify-center cursor-ns-resize touch-none z-20 group/handle"
            title="Resize Height (Top)"
          >
            <div className="w-7 h-2.5 bg-amber-400 border border-slate-950 rounded shadow group-hover/handle:scale-110 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('s', e)}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-12 h-6 flex items-center justify-center cursor-ns-resize touch-none z-20 group/handle"
            title="Resize Height (Bottom)"
          >
            <div className="w-7 h-2.5 bg-amber-400 border border-slate-950 rounded shadow group-hover/handle:scale-110 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('w', e)}
            className="absolute top-1/2 -left-3 -translate-y-1/2 w-6 h-12 flex items-center justify-center cursor-ew-resize touch-none z-20 group/handle"
            title="Resize Width (Left)"
          >
            <div className="w-2.5 h-7 bg-amber-400 border border-slate-950 rounded shadow group-hover/handle:scale-110 transition-transform" />
          </div>
          <div
            onPointerDown={(e) => startDrag('e', e)}
            className="absolute top-1/2 -right-3 -translate-y-1/2 w-6 h-12 flex items-center justify-center cursor-ew-resize touch-none z-20 group/handle"
            title="Resize Width (Right)"
          >
            <div className="w-2.5 h-7 bg-amber-400 border border-slate-950 rounded shadow group-hover/handle:scale-110 transition-transform" />
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex flex-col h-full bg-slate-900 border-r border-slate-800 text-slate-100 select-none overflow-hidden">
      {/* Top Header & Document Open Controls */}
      <div className="px-4 py-3 bg-slate-900/95 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {/* Plus button to open existing PDF / documents */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Open PDF (up to 400 pages) or text document"
            className="w-8 h-8 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 flex items-center justify-center text-white shadow-md shadow-indigo-600/30 transition-all shrink-0 group"
          >
            <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform duration-200" />
          </button>

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".pdf,.txt,.md,.json,.csv"
            className="hidden"
          />

          {/* Document Picker Dropdown if documents exist */}
          {documents.length > 0 ? (
            <div className="relative max-w-[190px] sm:max-w-[240px]">
              <select
                value={activeDocId || ''}
                onChange={(e) => {
                  setActiveDocId(e.target.value);
                  setCurrentPage(1);
                  setCropBox(null);
                }}
                className="w-full bg-slate-800 border border-slate-700 hover:border-slate-600 text-xs font-medium text-slate-200 py-1.5 px-2.5 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate pr-6"
              >
                {documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.totalPages}p • {doc.fileSize})
                  </option>
                ))}
              </select>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400 text-xs">
                ▾
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="font-medium text-slate-300">Open Document</span>
              <span className="text-[11px] text-slate-500 hidden sm:inline">
                Click + to open PDF (continuous scroll & infinite zoom)
              </span>
            </div>
          )}
        </div>

        {/* Viewport Zoom & Page Controls */}
        {activeDoc && (
          <div className="flex items-center gap-1 shrink-0">
            {/* Continuous Scroll Toggle */}
            <button
              onClick={() => setIsContinuousScroll(!isContinuousScroll)}
              title={isContinuousScroll ? 'Switch to Single Page View' : 'Switch to Continuous Scroll View'}
              className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                isContinuousScroll
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span className="text-[10px] hidden md:inline font-medium">Continuous</span>
            </button>

            {/* Crop tool toggle */}
            <button
              onClick={handleToggleCropMode}
              title={isCropMode ? 'Exit Crop Mode' : 'Open scalable crop box to share specific section'}
              className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                isCropMode
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 ring-1 ring-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Crop className="w-4 h-4" />
              <span className="text-[10px] hidden md:inline font-medium">Crop Area</span>
            </button>

            {activeDoc.totalPages > 1 && (
              <button
                onClick={() => setShowThumbnails(!showThumbnails)}
                title="Toggle Page Navigation Strip"
                className={`p-1.5 rounded-lg text-xs transition-colors ${
                  showThumbnails
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Layers className="w-4 h-4" />
              </button>
            )}

            <div className="h-4 w-px bg-slate-800 mx-1 hidden sm:block" />

            {/* Fit to Width Button */}
            <button
              onClick={handleFitWidth}
              title="Fit to Width (Fills screen cleanly with zero margin cutoff)"
              className={`p-1.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
                isFitWidth
                  ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 ring-1 ring-indigo-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <FoldHorizontal className="w-4 h-4" />
              <span className="text-[10px] hidden xl:inline font-medium">Fit Width</span>
            </button>

            {/* Fit Page Button */}
            <button
              onClick={handleFitPage}
              title="Fit Entire Page in View"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            {/* Infinite Zoom Controls */}
            <button
              onClick={handleZoomOut}
              title="Zoom Out (or Ctrl + Scroll)"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>

            <span
              title="Zoom Scale (Tap Fit Width to auto-fill width)"
              className="text-[10px] sm:text-[11px] text-slate-300 font-mono min-w-11 text-center font-semibold bg-slate-800/60 px-1 py-0.5 rounded border border-slate-700/60"
            >
              {Math.round(zoomScale * 100)}%
              {isFitWidth && <span className="hidden sm:inline text-[9px] text-indigo-400 font-normal ml-0.5">fit</span>}
            </span>

            <button
              onClick={handleZoomIn}
              title="Zoom In (or Ctrl + Scroll)"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>

            <button
              onClick={handleResetZoom}
              title="Reset Zoom to 100%"
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-[10px] font-semibold"
            >
              100%
            </button>
          </div>
        )}
      </div>

      {/* Crop Notification Bar when Crop Mode is Active */}
      {isCropMode && activeDoc && (
        <div className="px-4 py-2 bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/60 border-b border-amber-600/30 flex items-center justify-between gap-2 shrink-0 animate-fadeIn">
          <div className="flex items-center gap-2 text-xs text-amber-200">
            <Crop className="w-4 h-4 text-amber-400 animate-pulse" />
            <span className="font-semibold">Scalable Crop Box Active:</span>
            <span className="text-[11px] text-slate-300 hidden sm:inline">
              Drag anywhere inside the box to reposition, or pull any of the 8 yellow corner/edge handles to resize.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => captureAndShare()}
              className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1 shadow-md transition-all active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-slate-950" />
              <span>Send Cropped Box</span>
            </button>
            <button
              onClick={() => {
                setIsCropMode(false);
                setCropBox(null);
                setDragMode(null);
              }}
              title="Cancel Cropping"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Secondary Top Navigation Bar: Page Jump & Indicator */}
      {activeDoc && (
        <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-300 truncate">
            <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-semibold text-white truncate max-w-[200px]">
              {activeDoc.name}
            </span>
            <span className="text-slate-500 text-[11px]">({activeDoc.fileSize})</span>
          </div>

          {/* Page Nav Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              title="Previous Page"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Jumpable page input for documents up to 400 pages */}
            <form onSubmit={handlePageJump} className="flex items-center gap-1 text-xs">
              <span className="text-slate-400 text-[11px]">Page</span>
              <input
                type="text"
                value={pageInputVal}
                onChange={(e) => setPageInputVal(e.target.value)}
                onBlur={handlePageJump}
                className="w-12 text-center bg-slate-900 border border-slate-700 rounded py-0.5 text-xs text-white font-mono focus:outline-none focus:border-indigo-500"
              />
              <span className="text-slate-400 font-mono text-[11px]">
                / {activeDoc.totalPages}
              </span>
            </form>

            <button
              onClick={() => scrollToPage(Math.min(activeDoc.totalPages, currentPage + 1))}
              disabled={currentPage >= activeDoc.totalPages}
              title="Next Page"
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-slate-300"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Document Canvas Viewport or Empty State */}
      <div className="flex-1 relative flex overflow-hidden bg-slate-950/90">
        {/* Optional Page Thumbnails Rail */}
        {showThumbnails && activeDoc && (
          <div className="w-40 bg-slate-900/90 border-r border-slate-800 p-2 overflow-y-auto shrink-0 flex flex-col gap-1.5">
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-1">
              Pages (1 - {activeDoc.totalPages})
            </div>
            {Array.from({ length: activeDoc.totalPages }).map((_, index) => {
              const pNum = index + 1;
              const isSelected = pNum === currentPage;
              return (
                <button
                  key={pNum}
                  onClick={() => scrollToPage(pNum)}
                  className={`px-2.5 py-1.5 rounded-lg border text-left flex items-center justify-between text-xs transition-all ${
                    isSelected
                      ? 'border-indigo-500 bg-indigo-950/60 text-white font-semibold'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span>Page {pNum}</span>
                  {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                </button>
              );
            })}
          </div>
        )}

        {/* Scrollable Document Canvas Container */}
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-2 sm:p-4 md:p-6 relative select-none"
        >
          {isLoadingDoc ? (
            <div className="min-h-full flex flex-col items-center justify-center text-center space-y-3 py-12">
              <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-300">Loading document pages...</p>
            </div>
          ) : !activeDoc ? (
            /* Empty State */
            <div className="min-h-full flex flex-col items-center justify-center p-4 sm:p-8">
              <div className="max-w-sm text-center p-6 sm:p-8 border-2 border-dashed border-slate-800 hover:border-indigo-500/50 rounded-2xl transition-colors bg-slate-900/40">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mx-auto mb-4 cursor-pointer hover:scale-105 transition-transform shadow-lg shadow-indigo-600/10"
                >
                  <Plus className="w-8 h-8" />
                </div>
                <h3 className="text-base font-bold text-white mb-2">No Document Open</h3>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
                  Open an existing PDF (up to 400 pages) or text document to view with auto-fit width, continuous scrolling, zooming, and area cropping.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-600/25 transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Open PDF or Document</span>
                  </button>
                  <button
                    onClick={loadSampleDocument}
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all active:scale-95"
                  >
                    <FileText className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Try Sample Report</span>
                  </button>
                </div>
              </div>
            </div>
          ) : renderError ? (
            <div className="min-h-full flex flex-col items-center justify-center p-4">
              <div className="max-w-md p-6 bg-rose-950/40 border border-rose-800/60 rounded-xl text-center">
                <AlertCircle className="w-8 h-8 text-rose-400 mx-auto mb-2" />
                <h3 className="text-sm font-semibold text-rose-200 mb-1">Rendering Error</h3>
                <p className="text-xs text-rose-300/80">{renderError}</p>
              </div>
            </div>
          ) : isContinuousScroll ? (
            /* CONTINUOUS SCROLL VIEW */
            <div className="min-w-full w-fit mx-auto flex flex-col items-center gap-6 sm:gap-8 py-2 sm:py-4">
              {Array.from({ length: activeDoc.totalPages }).map((_, index) => {
                const pNum = index + 1;
                const isCurrent = pNum === currentPage;

                return (
                  <div
                    key={pNum}
                    id={`doc-page-container-${pNum}`}
                    className="relative shadow-2xl rounded-sm transition-all"
                  >
                    <canvas
                      ref={(el) => {
                        if (el) {
                          canvasRefs.current.set(pNum, el);
                          renderSinglePage(pNum, el);
                        } else {
                          canvasRefs.current.delete(pNum);
                        }
                      }}
                      className="bg-white rounded-sm shadow-xl border border-slate-700/60 block max-w-none"
                    />

                    {/* Page Badge */}
                    <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-md rounded text-[10px] font-mono text-slate-300 border border-slate-700/50">
                      P.{pNum} / {activeDoc.totalPages}
                    </div>

                    {/* Automatic Scalable Crop Box attached to the active page */}
                    {isCropMode && isCurrent && renderScalableCropBox()}
                  </div>
                );
              })}
            </div>
          ) : (
            /* SINGLE PAGE VIEW */
            <div className="min-w-full w-fit mx-auto flex flex-col items-center justify-center min-h-full py-2 sm:py-4">
              <div className="relative shadow-2xl rounded-sm transition-all my-auto">
                <canvas
                  ref={singleCanvasRef}
                  className="bg-white rounded-sm shadow-xl border border-slate-700/60 block max-w-none"
                />

                {/* Page Badge */}
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-slate-900/80 backdrop-blur-md rounded text-[10px] font-mono text-slate-300 border border-slate-700/50">
                  P.{currentPage} / {activeDoc.totalPages}
                </div>

                {/* Automatic Scalable Crop Box for Single Page Mode */}
                {isCropMode && renderScalableCropBox()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Status Bar */}
      {activeDoc && (
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400 shrink-0">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {isContinuousScroll ? 'Continuous Scroll' : 'Single Page'}
            </span>
            <span className="hidden sm:inline text-slate-600">•</span>
            <span className="hidden sm:inline truncate max-w-[180px]">
              {activeDoc.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Zoom: {Math.round(zoomScale * 100)}%</span>
            <span className="text-slate-600">•</span>
            <span>Page {currentPage} of {activeDoc.totalPages}</span>
            <span className="text-slate-600">•</span>
            <span className="text-indigo-400 font-medium">
              {isCropMode ? 'Crop Active' : 'Ready for Gemini Vision'}
            </span>
          </div>
        </div>
      )}

      {/* Floating Point Button in Right Lower Corner */}
      {activeDoc && (
        <div className="absolute right-5 bottom-12 z-40">
          <button
            onClick={() => captureAndShare()}
            disabled={isCapturing}
            title={
              isCropMode && cropBox
                ? 'Send Cropped Region snapshot to Gemini'
                : `One-touch send Page ${currentPage} snapshot with General Prompt to Gemini`
            }
            className={`group relative w-12 h-12 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 active:scale-90 ${
              captureSuccess
                ? 'bg-emerald-600 text-white shadow-emerald-500/40 ring-4 ring-emerald-500/20'
                : isCropMode
                ? 'bg-gradient-to-tr from-amber-500 via-amber-600 to-orange-600 text-slate-950 shadow-amber-500/50 ring-4 ring-amber-500/30'
                : 'bg-gradient-to-tr from-indigo-600 via-indigo-500 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/40 hover:shadow-indigo-500/60 hover:scale-105'
            }`}
          >
            {/* Glowing ring animation */}
            <span
              className={`absolute -inset-1 rounded-full opacity-40 blur-sm transition duration-300 animate-pulse ${
                isCropMode
                  ? 'bg-gradient-to-r from-amber-400 to-orange-500'
                  : 'bg-gradient-to-r from-indigo-500 to-violet-500 group-hover:opacity-75'
              }`}
            />

            {/* Inner Icon */}
            <div className="relative flex items-center justify-center">
              {captureSuccess ? (
                <Check className="w-6 h-6 text-white animate-bounce" />
              ) : isCapturing ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : isCropMode ? (
                <Crop className="w-5 h-5 text-amber-950 group-hover:scale-110 transition-transform" />
              ) : (
                <Sparkles className="w-5 h-5 text-amber-300 group-hover:scale-110 transition-transform" />
              )}
            </div>

            {/* Tooltip on hover */}
            <div className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-900 border border-slate-700 text-slate-200 text-[11px] font-medium py-1 px-2.5 rounded-lg shadow-xl whitespace-nowrap z-50">
              {isCropMode
                ? 'Send Cropped Area to Gemini'
                : `One-touch send Page ${currentPage} to Gemini`}
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
