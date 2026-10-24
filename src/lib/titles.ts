// Pure title formatting (no astro:content import, so it can be unit-tested and used by seo.ts).

export interface WorkTitleFields {
  title: string;
  artist?: string | undefined;
  client?: string | undefined;
}

/** "אמן - שיר" for clips, "פרויקט ל־לקוח" for client work, otherwise the title. */
export function formatWorkTitle({ title, artist, client }: WorkTitleFields): string {
  if (artist) return `${artist} - ${title}`;
  if (client) return `${title} ל־${client}`;
  return title;
}
