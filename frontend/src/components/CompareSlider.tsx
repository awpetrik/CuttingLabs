'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from 'react';
import {
  Hand,
  Minus,
  Plus,
  ScanSearch,
  Maximize2,
  Paintbrush,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { SegmentCandidate } from '@/lib/types';

export type CompareHandle = {
  resetView: () => void;
  zoomTo100: () => void;
  recenter: () => void;
  autoFit: () => void;
};

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl?: string;
  maskUrl?: string;
  view: 'compare' | 'cutout' | 'original' | 'mask';
  background: 'neutral' | 'checker' | 'white' | 'black';
  onBackgroundChange?: (value: 'neutral' | 'checker' | 'white' | 'black') => void;
  objectBox?: number[];
  candidates?: SegmentCandidate[];
  selectedCandidate?: number | null;
  onSelectCandidate?: (index: number) => void;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const CompareSlider = forwardRef<CompareHandle, CompareSliderProps>(
  function CompareSlider(
    {
      beforeUrl,
      afterUrl,
      maskUrl,
      view,
      background,
      onBackgroundChange,
      objectBox,
      candidates,
      selectedCandidate,
      onSelectCandidate,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [isHovered, setIsHovered] = useState(false);
    const [isSpacePanning, setIsSpacePanning] = useState(false);
    const [bgMenuOpen, setBgMenuOpen] = useState(false);
    const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
    const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

    // Comparison slider state
    const [sliderPosition, setSliderPosition] = useState(50);
    const [isDraggingSlider, setIsDraggingSlider] = useState(false);

    const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

    const baseScale = useMemo(() => {
      if (!containerSize.width || !containerSize.height || !imageSize.width || !imageSize.height) {
        return 1;
      }
      return Math.min(
        containerSize.width / imageSize.width,
        containerSize.height / imageSize.height
      );
    }, [containerSize, imageSize]);

    const zoomTo100 = () => {
      if (!baseScale) return;
      setZoom(clamp(1 / baseScale, 0.5, 6));
    };

    const resetView = () => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    };

    const recenter = () => {
      setPan({ x: 0, y: 0 });
    };

    const autoFit = () => {
      if (!objectBox || objectBox.length !== 4 || !baseScale) {
        resetView();
        return;
      }
      const [y0, x0, y1, x1] = objectBox.map((v) => Number(v));
      const boxWidth = (x1 - x0) / 1000 * imageSize.width;
      const boxHeight = (y1 - y0) / 1000 * imageSize.height;
      if (boxWidth <= 0 || boxHeight <= 0) {
        resetView();
        return;
      }
      const target = 0.8;
      const zoomForBox = Math.min(
        (containerSize.width * target) / (boxWidth * baseScale),
        (containerSize.height * target) / (boxHeight * baseScale)
      );
      const nextZoom = clamp(zoomForBox, 0.5, 6);
      setZoom(nextZoom);

      const boxCenterX = (x0 + x1) / 2000 * imageSize.width;
      const boxCenterY = (y0 + y1) / 2000 * imageSize.height;
      const imgCenterX = imageSize.width / 2;
      const imgCenterY = imageSize.height / 2;
      const dx = (imgCenterX - boxCenterX) * baseScale * nextZoom;
      const dy = (imgCenterY - boxCenterY) * baseScale * nextZoom;
      setPan({ x: dx, y: dy });
    };

    useImperativeHandle(ref, () => ({ resetView, zoomTo100, recenter, autoFit }));

    useEffect(() => {
      const img = new Image();
      img.onload = () => {
        setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = beforeUrl;
    }, [beforeUrl]);

    useEffect(() => {
      if (!containerRef.current) return;
      const updateSize = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        setContainerSize({ width: rect.width, height: rect.height });
      };
      updateSize();
      const observer = new ResizeObserver(updateSize);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }, []);

    // Pan handling
    useEffect(() => {
      const onPointerMove = (event: PointerEvent) => {
        if (dragRef.current) {
          const dx = event.clientX - dragRef.current.x;
          const dy = event.clientY - dragRef.current.y;
          setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
        }
      };
      const onPointerUp = () => {
        dragRef.current = null;
      };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      return () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      };
    }, []);

    // Slider drag handling
    useEffect(() => {
      if (!isDraggingSlider) return;

      const onMove = (e: PointerEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = clamp((x / rect.width) * 100, 0, 100);
        setSliderPosition(percent);
      };

      const onUp = () => {
        setIsDraggingSlider(false);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      return () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
    }, [isDraggingSlider]);

    useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
        if (!isHovered) return;
        if (event.code === 'Space') {
          event.preventDefault();
          event.stopPropagation();
          setIsSpacePanning(true);
        }
      };
      const onKeyUp = (event: KeyboardEvent) => {
        if (event.code === 'Space') {
          setIsSpacePanning(false);
        }
      };
      window.addEventListener('keydown', onKeyDown, { capture: true });
      window.addEventListener('keyup', onKeyUp, { capture: true });
      return () => {
        window.removeEventListener('keydown', onKeyDown, { capture: true });
        window.removeEventListener('keyup', onKeyUp, { capture: true });
      };
    }, [isHovered]);

    const startPan = (event: ReactPointerEvent) => {
      if (!isPanning && !isSpacePanning) return;
      dragRef.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
    };

    const handleWheel = useCallback((event: WheelEvent | ReactWheelEvent) => {
      if ('preventDefault' in event) {
        event.preventDefault();
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = 'deltaY' in event ? event.deltaY : 0;
      const zoomFactor = delta > 0 ? 0.92 : 1.08;
      const nextZoom = clamp(zoom * zoomFactor, 0.5, 6);
      if (nextZoom === zoom) return;

      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const cursorX = event.clientX ?? centerX;
      const cursorY = event.clientY ?? centerY;
      const vX = cursorX - (centerX + pan.x);
      const vY = cursorY - (centerY + pan.y);
      const ratio = nextZoom / zoom;
      const nextPan = {
        x: pan.x + vX * (1 - ratio),
        y: pan.y + vY * (1 - ratio),
      };

      setZoom(nextZoom);
      setPan(nextPan);
    }, [zoom, pan]);

    useEffect(() => {
      const node = containerRef.current;
      if (!node) return;
      const onWheelEvent = (event: WheelEvent) => handleWheel(event);
      node.addEventListener('wheel', onWheelEvent, { passive: false });
      return () => node.removeEventListener('wheel', onWheelEvent);
    }, [handleWheel]);

    const handleDoubleClick = () => {
      if (Math.abs(zoom - 1) < 0.01) {
        zoomTo100();
      } else {
        resetView();
      }
    };

    const handleSliderClick = (e: ReactPointerEvent) => {
      if (view !== 'compare' || !afterUrl) return;
      if (isPanning || isSpacePanning) return;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const percent = clamp((x / rect.width) * 100, 0, 100);
      setSliderPosition(percent);
    };

    const backgroundClass = useMemo(() => {
      if (background === 'checker') return 'checker';
      if (background === 'white') return 'bg-white';
      if (background === 'black') return 'bg-black';
      return 'bg-surface2';
    }, [background]);

    const displayScale = baseScale * zoom;
    const offsetX = (containerSize.width - imageSize.width * displayScale) / 2 + pan.x;
    const offsetY = (containerSize.height - imageSize.height * displayScale) / 2 + pan.y;

    const candidateOverlays = useMemo(() => {
      if (!candidates || candidates.length < 2) return [];
      if (!imageSize.width || !imageSize.height || !containerSize.width || !containerSize.height)
        return [];
      return candidates.map((candidate, index) => {
        const [y0, x0, y1, x1] = candidate.box_2d || [0, 0, 0, 0];
        const left = offsetX + (x0 / 1000) * imageSize.width * displayScale;
        const top = offsetY + (y0 / 1000) * imageSize.height * displayScale;
        const width = ((x1 - x0) / 1000) * imageSize.width * displayScale;
        const height = ((y1 - y0) / 1000) * imageSize.height * displayScale;
        return { index, left, top, width, height };
      });
    }, [candidates, containerSize, displayScale, imageSize, offsetX, offsetY]);

    const renderImage = (src: string, alt: string, clipPath?: string) => (
      <div
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
        style={{ clipPath }}
      >
        <div
          className="flex items-center justify-center"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}
        >
          <div style={{ transform: `scale(${zoom})` }}>
            <img src={src} alt={alt} className="max-w-none" draggable={false} />
          </div>
        </div>
      </div>
    );

    // Custom comparison slider handle
    const SliderHandle = () => (
      <div
        className="absolute top-0 bottom-0 z-30 cursor-ew-resize"
        style={{
          left: `${sliderPosition}%`,
          transform: 'translateX(-50%)',
          width: '48px',
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          setIsDraggingSlider(true);
        }}
      >
        {/* Vertical line with glow */}
        <div className="absolute left-1/2 top-0 bottom-0 -translate-x-1/2 w-[3px] bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)]" />

        {/* Center handle button */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`
            flex items-center justify-center gap-0 
            w-12 h-12 rounded-full 
            bg-white shadow-lg
            border-2 border-white/80
            transition-transform duration-150
            ${isDraggingSlider ? 'scale-110' : 'hover:scale-105'}
          `}>
            <ChevronLeft className="h-5 w-5 text-gray-700 -mr-1" />
            <ChevronRight className="h-5 w-5 text-gray-700 -ml-1" />
          </div>
        </div>
      </div>
    );

    return (
      <div
        ref={containerRef}
        className={`group relative h-[320px] w-full overflow-hidden rounded-3xl border border-border ${backgroundClass} shadow-soft ${isPanning || isSpacePanning ? 'cursor-grab' : view === 'compare' && afterUrl ? 'cursor-ew-resize' : 'cursor-default'
          }`}
        onPointerDown={(e) => {
          if (view === 'compare' && afterUrl && !isPanning && !isSpacePanning) {
            handleSliderClick(e);
          } else {
            startPan(e);
          }
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setBgMenuOpen(false);
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* Before/After Labels */}
        {view === 'compare' && afterUrl && isHovered && (
          <>
            <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              Before
            </div>
            <div className="pointer-events-none absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              After
            </div>
          </>
        )}

        {/* Zoom/Pan Controls */}
        <div className="absolute right-4 bottom-4 z-20 flex items-center gap-2 rounded-2xl border border-border bg-surface/80 p-2 shadow-soft backdrop-blur">
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(z - 0.1, 0.5, 6))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-subtle hover:text-text"
            title="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => clamp(z + 0.1, 0.5, 6))}
            className="flex h-8 w-8 items-center justify-center rounded-full text-subtle hover:text-text"
            title="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={resetView}
            className="flex h-8 w-8 items-center justify-center rounded-full text-subtle hover:text-text"
            title="Fit to screen"
          >
            <ScanSearch className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={zoomTo100}
            className="flex h-8 w-8 items-center justify-center rounded-full text-subtle hover:text-text"
            title="100%"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setIsPanning((prev) => !prev)}
            className={`flex h-8 w-8 items-center justify-center rounded-full ${isPanning ? 'bg-accent text-white' : 'text-subtle'
              }`}
            title="Pan"
          >
            <Hand className="h-4 w-4" />
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBgMenuOpen((prev) => !prev)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-subtle hover:text-text"
              title="Background"
            >
              <Paintbrush className="h-4 w-4" />
            </button>
            {bgMenuOpen && (
              <div className="absolute right-0 top-10 w-32 rounded-2xl border border-border bg-surface p-2 text-xs text-subtle shadow-soft">
                {(['neutral', 'checker', 'white', 'black'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      onBackgroundChange?.(option);
                      setBgMenuOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-2 py-1 transition hover:bg-surface2 ${background === option ? 'text-text' : ''
                      }`}
                  >
                    {option.charAt(0).toUpperCase() + option.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Image layers */}
        <div className="absolute inset-0 overflow-hidden">
          {view === 'compare' && afterUrl ? (
            <>
              {/* Single container for both images - exact same position */}
              <div
                className="absolute pointer-events-none"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: 'center center',
                }}
              >
                {/* After image (base layer, full visible) */}
                <img
                  src={afterUrl}
                  alt="After"
                  className="block max-w-none"
                  draggable={false}
                />

                {/* Before image (overlay with clip) */}
                <div
                  className="absolute inset-0"
                  style={{
                    clipPath: `inset(0 ${100 - sliderPosition}% 0 0)`,
                  }}
                >
                  <img
                    src={beforeUrl}
                    alt="Before"
                    className="block max-w-none w-full h-full object-cover"
                    draggable={false}
                  />
                </div>
              </div>

              {/* Slider handle */}
              <SliderHandle />
            </>
          ) : (
            /* Single image view */
            <div
              className="absolute pointer-events-none"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            >
              <img
                src={
                  view === 'mask' && maskUrl
                    ? maskUrl
                    : view === 'cutout' && afterUrl
                      ? afterUrl
                      : beforeUrl
                }
                alt={view === 'mask' ? 'Mask' : view === 'cutout' ? 'Cutout' : 'Original'}
                className="block max-w-none"
                draggable={false}
              />
            </div>
          )}
        </div>

        {/* Candidate overlays */}
        {candidateOverlays.length > 0 && (view === 'compare' || view === 'original') && (
          <div className="pointer-events-none absolute inset-0 z-30">
            {candidateOverlays.map((box) => {
              const isSelected = selectedCandidate === box.index;
              return (
                <button
                  key={box.index}
                  type="button"
                  onClick={() => onSelectCandidate?.(box.index)}
                  className={`pointer-events-auto absolute rounded-xl border text-[11px] font-semibold transition-all duration-150 ease-out ${isSelected
                    ? 'border-accent bg-accent/10 text-accent shadow-soft'
                    : 'border-border/60 bg-surface/70 text-subtle hover:border-accent/60 hover:text-text'
                    }`}
                  style={{
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                  }}
                >
                  <span className="absolute left-2 top-2 rounded-full border border-border bg-surface/80 px-2 py-0.5 text-[10px]">
                    {box.index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }
);
