'use client';

import { Cloud, Cpu, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { SegmentParams } from '@/lib/types';

type ProcessingMode = 'gemini' | 'local' | 'auto';

interface ControlsPanelProps {
  params: SegmentParams | null;
  removeFringing: boolean;
  focusMode: 'auto' | 'center' | 'largest' | 'detailed';
  allowBorderTouch: boolean;
  autoApply: boolean;
  processingMode: ProcessingMode;
  onChange: (params: SegmentParams) => void;
  onFocusModeChange: (mode: 'auto' | 'center' | 'largest' | 'detailed') => void;
  onToggleBorderTouch: () => void;
  onToggleRemoveFringing: () => void;
  onToggleAutoApply: () => void;
  onProcessingModeChange: (mode: ProcessingMode) => void;
  onApply: () => void;
}

function Toggle({
  enabled,
  onToggle,
  label,
}: {
  enabled: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3 text-sm transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span>{label}</span>
      <span
        className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${enabled ? 'bg-accent' : 'bg-border'
          }`}
      >
        <span
          className={`inline-block h-6 w-6 rounded-full bg-white shadow-soft transition ${enabled ? 'translate-x-7' : 'translate-x-1'
            }`}
        />
      </span>
    </button>
  );
}

function InlineToggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="relative inline-flex h-11 w-16 items-center rounded-full border border-border bg-surface transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      <span
        className={`absolute inset-0 rounded-full transition ${enabled ? 'bg-accent' : 'bg-border'
          }`}
      />
      <span
        className={`relative ml-1 h-7 w-7 rounded-full bg-white shadow-soft transition ${enabled ? 'translate-x-6' : 'translate-x-0'
          }`}
      />
    </button>
  );
}

export function ControlsPanel({
  params,
  removeFringing,
  focusMode,
  allowBorderTouch,
  autoApply,
  processingMode,
  onChange,
  onFocusModeChange,
  onToggleBorderTouch,
  onToggleRemoveFringing,
  onToggleAutoApply,
  onProcessingModeChange,
  onApply,
}: ControlsPanelProps) {
  if (!params) {
    return (
      <div className="rounded-3xl border border-border bg-surface/80 p-6 shadow-soft">
        <div className="flex items-center gap-2 text-subtle">
          <SlidersHorizontal className="h-4 w-4" />
          <p className="text-sm">Select an item to refine edges.</p>
        </div>
      </div>
    );
  }

  const update = (key: keyof SegmentParams, value: number | boolean) => {
    onChange({ ...params, [key]: value });
  };

  const stepPadding = (delta: number) => {
    const next = Math.min(50, Math.max(0, params.padding + delta));
    update('padding', next);
  };

  return (
    <div className="rounded-3xl border border-border bg-surface/80 p-6 shadow-soft">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-subtle">Inspector</p>
        <h2 className="text-lg font-semibold">Refine Cutout</h2>
      </div>

      <div className="mt-6 space-y-6">
        {/* Processing Mode */}
        <section>
          <p className="mb-3 text-xs uppercase tracking-[0.2em] text-subtle">Processing Engine</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { key: 'auto' as const, label: 'Auto', icon: RefreshCw, desc: 'Smart fallback' },
              { key: 'gemini' as const, label: 'Cloud', icon: Cloud, desc: 'Gemini AI' },
              { key: 'local' as const, label: 'Local', icon: Cpu, desc: 'RMBG' },
            ].map(({ key, label, icon: Icon, desc }) => (
              <button
                key={key}
                type="button"
                onClick={() => onProcessingModeChange(key)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-3 py-3 text-xs transition-all duration-200 ease-out hover:-translate-y-0.5 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${processingMode === key
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-border bg-surface2 text-subtle hover:text-base'
                  }`}
              >
                <Icon className="h-4 w-4" />
                <span className="font-medium">{label}</span>
                <span className="text-[10px] opacity-70">{desc}</span>
              </button>
            ))}
          </div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Edge</p>
            <span className="text-xs text-subtle">pixel precision</span>
          </div>
          <div className="space-y-4">
            <div>
              <label className="flex items-center justify-between text-sm">
                Threshold
                <span className="text-subtle">{params.threshold}</span>
              </label>
              <input
                type="range"
                min={0}
                max={255}
                value={params.threshold}
                onChange={(event) => update('threshold', Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-sm">
                Feather
                <span className="text-subtle">{params.feather}</span>
              </label>
              <input
                type="range"
                min={0}
                max={10}
                value={params.feather}
                onChange={(event) => update('feather', Number(event.target.value))}
                className="mt-2 w-full"
              />
            </div>
            <div>
              <label className="flex items-center justify-between text-sm">
                Padding
                <span className="text-subtle">{params.padding}px</span>
              </label>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => stepPadding(-2)}
                  className="h-11 w-11 rounded-full border border-border bg-surface2 text-lg font-semibold text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft"
                >
                  -
                </button>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={params.padding}
                  onChange={(event) => update('padding', Number(event.target.value))}
                  className="h-11 w-20 rounded-2xl border border-border bg-surface px-3 text-center text-sm"
                />
                <button
                  type="button"
                  onClick={() => stepPadding(2)}
                  className="h-11 w-11 rounded-full border border-border bg-surface2 text-lg font-semibold text-subtle transition-all duration-200 ease-out hover:-translate-y-0.5 hover:text-text hover:shadow-soft"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Enhancements</p>
            <span className="text-xs text-subtle">preview only</span>
          </div>
          <div className="space-y-3">
            <Toggle
              enabled={params.auto_enhance}
              onToggle={() => update('auto_enhance', !params.auto_enhance)}
              label="Auto Enhance"
            />
            <Toggle
              enabled={removeFringing}
              onToggle={onToggleRemoveFringing}
              label="Remove fringing"
            />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Focus</p>
            <span className="text-xs text-subtle">product priority</span>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl border border-border bg-surface2 px-4 py-3">
              <label className="text-xs uppercase tracking-wide text-subtle">Mode</label>
              <select
                value={focusMode}
                onChange={(event) =>
                  onFocusModeChange(event.target.value as ControlsPanelProps['focusMode'])
                }
                className="mt-2 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <option value="auto">Auto (Recommended)</option>
                <option value="center">Center</option>
                <option value="largest">Largest</option>
                <option value="detailed">Most detailed</option>
              </select>
            </div>
            <Toggle
              enabled={allowBorderTouch}
              onToggle={onToggleBorderTouch}
              label="Touches edge"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-surface2/70 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Apply</p>
              <p className="text-xs text-subtle">Reprocess with current settings.</p>
            </div>
            <button
              type="button"
              onClick={onApply}
              className="h-11 rounded-full bg-gradient-to-r from-accent to-accent2 px-4 text-xs font-semibold text-white shadow-soft transition-all duration-200 ease-out hover:-translate-y-0.5"
            >
              Apply
            </button>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-subtle">Auto apply on change</p>
            <InlineToggle enabled={autoApply} onToggle={onToggleAutoApply} />
          </div>
        </section>
      </div>
    </div>
  );
}
