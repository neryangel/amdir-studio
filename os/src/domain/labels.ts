import type { AssetKind, ProjectKind, VersionStatus } from './types';

export const PROJECT_KIND_LABEL: Record<ProjectKind, string> = {
  clip: 'קליפ',
  video: 'עריכת וידאו',
  motion: 'מושן',
  visuals: 'ויז׳ואלים',
  web: 'אתר',
  other: 'אחר',
};

export const ASSET_KIND_LABEL: Record<AssetKind, string> = {
  video: 'וידאו',
  image: 'תמונה',
  audio: 'אודיו',
  document: 'מסמך',
  link: 'קישור',
};

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: 'טיוטה פנימית',
  'awaiting-client': 'ממתין ללקוח',
  'changes-requested': 'התבקשו תיקונים',
  approved: 'אושר',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'] as const;
  let value = bytes / 1024;
  let unit: (typeof units)[number] = 'KB';
  for (const u of units) {
    unit = u;
    if (value < 1024 || u === 'GB') break;
    value /= 1024;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${unit}`;
}
