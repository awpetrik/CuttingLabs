'use client';

import { useEffect } from 'react';
import { Command } from 'lucide-react';

interface Action {
  id: string;
  label: string;
  shortcut: string;
  onTrigger: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  actions: Action[];
}

export function CommandPalette({ open, onClose, actions }: CommandPaletteProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6 backdrop-blur">
      <div className="w-full max-w-lg rounded-3xl border border-border bg-surface p-6 shadow-lift">
        <div className="flex items-center gap-2 text-sm text-subtle">
          <Command className="h-4 w-4" />
          Command Palette
        </div>
        <div className="mt-4 space-y-2">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => {
                action.onTrigger();
                onClose();
              }}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface2 px-4 py-3 text-left text-sm transition hover:-translate-y-0.5 hover:shadow-soft"
            >
              <span>{action.label}</span>
              <span className="text-xs text-subtle">{action.shortcut}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
