import type { CSSProperties } from 'react';

export type IconName =
  | 'home'
  | 'chat'
  | 'antenna'
  | 'bell'
  | 'user'
  | 'back'
  | 'send'
  | 'alert'
  | 'shield'
  | 'check'
  | 'clock'
  | 'map'
  | 'help'
  | 'history'
  | 'logout'
  | 'plus'
  | 'chevron'
  | 'refresh'
  | 'lock'
  | 'eye'
  | 'close'
  | 'settings'
  | 'power'
  | 'signal'
  | 'info'
  | 'list';

const PATHS: Record<IconName, string[]> = {
  home: ['M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  chat: ['M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20.5l1.5-4.4A8.4 8.4 0 0 1 3.6 11.5 8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4z'],
  antenna: ['M5 4.5a11 11 0 0 0 0 15', 'M19 4.5a11 11 0 0 1 0 15', 'M8.5 8a6 6 0 0 0 0 8', 'M15.5 8a6 6 0 0 1 0 8', 'M12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'M12 12.5V21'],
  bell: ['M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9', 'M13.7 21a2 2 0 0 1-3.4 0'],
  user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  back: ['M19 12H5', 'M12 19l-7-7 7-7'],
  send: ['M22 2 11 13', 'M22 2l-7 20-4-9-9-4z'],
  alert: ['M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z', 'M12 9v4', 'M12 17h.01'],
  shield: ['M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z', 'M9 12l2 2 4-4'],
  check: ['M20 6 9 17l-5-5'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 6v6l4 2'],
  map: ['M1 6 8 3l8 3 7-3v15l-7 3-8-3-7 3z', 'M8 3v15', 'M16 6v15'],
  help: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M9.1 9.2a3 3 0 0 1 5.8 1c0 2-2.9 3-2.9 3', 'M12 17.5h.01'],
  history: ['M3 3v5h5', 'M3.05 13A9 9 0 1 0 6 5.3L3 8', 'M12 7.5v5l3.5 2'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  plus: ['M12 5v14', 'M5 12h14'],
  chevron: ['M9 18l6-6-6-6'],
  refresh: ['M21 12a9 9 0 1 1-3-6.7', 'M21 3.5v5h-5'],
  lock: ['M5 11h14v10H5z', 'M8.5 11V7a3.5 3.5 0 0 1 7 0v4'],
  eye: ['M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  close: ['M18 6 6 18', 'M6 6l12 12'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 7.4 19.4l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3 15H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 8.4l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'],
  power: ['M12 2v10', 'M18.4 6.6a9 9 0 1 1-12.8 0'],
  signal: ['M4 20v-5', 'M10 20V9', 'M16 20v-8', 'M22 20V4'],
  info: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z', 'M12 16v-4', 'M12 8h.01'],
  list: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
};

export function Icon({
  name,
  size = 20,
  className = '',
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
