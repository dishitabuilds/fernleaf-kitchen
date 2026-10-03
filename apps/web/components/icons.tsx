import type { SVGProps } from 'react';

type IconName = 'leaf' | 'grid' | 'settings' | 'arrow' | 'check' | 'lock' | 'truck' | 'utensils' | 'logout' | 'clock';

const paths: Record<IconName, React.ReactNode> = {
  leaf: <><path d="M20 3c-9 0-16 4-16 11a6 6 0 0 0 6 6c7 0 10-8 10-17Z" /><path d="M4 20 16 8M10 14v-4M10 14h5" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  settings: <><path d="m9 3-1 3-3 1v4l-2 1 2 1v4l3 1 1 3h6l1-3 3-1v-4l2-1-2-1V7l-3-1-1-3H9Z" /><circle cx="12" cy="12" r="3" /></>,
  arrow: <><path d="M4 12h16m-6-6 6 6-6 6" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" /></>,
  truck: <><path d="M3 5h11v12H3V5Zm11 4h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  utensils: <><path d="M4 3v5a3 3 0 0 0 6 0V3M7 3v18m12-18c-4 2-4 9 0 10v8m0-18v10" /></>,
  logout: <><path d="M9 3H4v18h5m4-14 5 5-5 5m-6-5h11" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
};

export function Icon({ name, ...props }: SVGProps<SVGSVGElement> & { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>{paths[name]}</svg>;
}
