// JSON-LD builders. Only facts that exist in content are emitted (no invented ratings, prices or addresses).
import type { VideoRef } from '../content.config';

interface SiteFacts {
  studioName: string;
  ownerName: string;
  url: string;
  logo: string;
  email?: string | undefined;
  telephone?: string | undefined;
  description: string;
}

export function organizationLd(f: SiteFacts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': `${f.url}#studio`,
    name: f.studioName,
    alternateName: `הסטודיו של ${f.ownerName}`,
    url: f.url,
    image: f.logo,
    description: f.description,
    founder: { '@type': 'Person', name: f.ownerName },
    areaServed: { '@type': 'Country', name: 'Israel' },
    inLanguage: 'he',
    knowsAbout: ['הפקת קליפים', 'עריכת וידאו', 'מושן גרפיקס', 'אפקטים', 'עיצוב ובניית אתרים'],
    ...(f.email ? { email: f.email } : {}),
    ...(f.telephone ? { telephone: f.telephone } : {}),
  };
}

export function videoEmbedUrl(v: VideoRef): string | undefined {
  switch (v.provider) {
    case 'youtube':
      return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}`;
    case 'vimeo':
      return `https://player.vimeo.com/video/${encodeURIComponent(v.id)}`;
    case 'bunny':
      return `https://iframe.mediadelivery.net/embed/${v.id}`;
    default:
      return undefined;
  }
}

interface WorkFacts {
  name: string;
  description: string;
  url: string;
  image: string;
  year: number;
  studioId: string;
  ownerName: string;
  genre: string[];
  video?: { contentUrl?: string | undefined; embedUrl?: string | undefined } | undefined;
}

export function creativeWorkLd(w: WorkFacts) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: w.name,
    description: w.description,
    url: w.url,
    image: w.image,
    dateCreated: String(w.year),
    inLanguage: 'he',
    genre: w.genre,
    creator: { '@type': 'Person', name: w.ownerName },
    publisher: { '@id': w.studioId },
    ...(w.video
      ? {
          video: {
            '@type': 'VideoObject',
            name: w.name,
            description: w.description,
            thumbnailUrl: w.image,
            ...(w.video.contentUrl ? { contentUrl: w.video.contentUrl } : {}),
            ...(w.video.embedUrl ? { embedUrl: w.video.embedUrl } : {}),
          },
        }
      : {}),
  };
}

/** Safe JSON for <script type="application/ld+json">. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
