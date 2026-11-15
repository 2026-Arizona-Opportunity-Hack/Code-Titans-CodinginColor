import type { ReactNode } from "react";

// A few simple line icons, so state is shown with a consistent icon instead of emoji.
// They are decorative (aria-hidden): every use is paired with a text label.
const PATHS = {
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  play: <path d="M8 5.5v13l11-6.5z" />,
  history: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4h4" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  arrowLeft: (
    <>
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
