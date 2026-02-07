'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="flex items-center justify-between rounded-2xl border border-border bg-surface/80 px-6 py-4 shadow-soft backdrop-blur">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-subtle">CutoutLab</p>
        <h1 className="text-xl font-semibold">Product Cutout Generator</h1>
      </div>
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="flex items-center gap-2 rounded-full border border-border bg-surface2 px-4 py-2 text-sm font-medium text-subtle transition hover:-translate-y-0.5 hover:text-text hover:shadow-soft"
      >
        {mounted ? (
          <>
            {theme === 'dark' ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </>
        ) : (
          <span className="h-4 w-4" />
        )}
      </button>
    </header>
  );
}
