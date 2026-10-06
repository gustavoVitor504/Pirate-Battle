import { useEffect, useRef, type ReactNode } from 'react';

/**
 * The screen's main heading. It takes focus when the screen appears, so
 * keyboard and screen-reader users land at the top of the new screen instead
 * of on a button that no longer exists.
 */
export function ScreenHeading({ children, className = 'panel__title' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} className={className} tabIndex={-1}>
      {children}
    </h1>
  );
}
