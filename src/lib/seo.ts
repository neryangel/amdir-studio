// JSON-LD builders. Only facts that exist in content are emitted:
// no invented ratings, prices, addresses, view counts or upload dates.
// Pure module (no astro:* imports) so every builder is unit-tested in tests/seo.test.ts.
import type { VideoRef } from '../content.config';
import { DISCIPLINE_LABEL, type Discipline } from './enums';
import { formatWorkTitle } from './titles';
import { absolute } from './url';

const CONTEXT = 'https://schema.org';

/** Stable @id of the studio node, referenced as provider/publisher by every other node. */
export function studioId(siteUrl: string): string {
  return `${siteUrl.replace(/\/?$/, '/')}#studio`;
}

// ---------- Organization / ProfessionalService ----------

interface SiteFacts {
  studioName: string;
  ownerName: string;
  url: string;
  logo: string;
  description: string;
  email?: string | undefined;
  telephone?: string | undefined;
  /** Only if filled in site settings. Never guessed. */
  address?: string | undefined;
  /** Service names that exist in this build (falls back to the studio's crafts). */
  services?: readonly string[] | undefined;
}

const DEFAULT_CRAFTS = ['הפקת קליפים', 'עריכת וידאו', 'מושן גרפיקס', 'אפקטים', 'עיצוב ובניית אתרים'];

/**
 * The studio as Organization + ProfessionalService (a schema.org LocalBusiness subtype).
 * Contact points and address appear only when they exist in settings.
 */
export function organizationLd(f: SiteFacts) {
  return {
    '@context': CONTEXT,
    '@type': ['Organization', 'ProfessionalService'],
    '@id': studioId(f.url),
    name: f.studioName,
    alternateName: `הסטודיו של ${f.ownerName}`,
    url: f.url,
    logo: f.logo,
    image: f.logo,
    description: f.description,
    founder: { '@type': 'Person', name: f.ownerName },
    areaServed: { '@type': 'Country', name: 'Israel' },
    knowsLanguage: 'he',
    knowsAbout: f.services?.length ? [...f.services] : DEFAULT_CRAFTS,
    ...(f.email ? { email: f.email } : {}),
    ...(f.telephone ? { telephone: f.telephone } : {}),
    ...(f.address ? { address: { '@type': 'PostalAddress', streetAddress: f.address, addressCountry: 'IL' } } : {}),
  };
}

// ---------- BreadcrumbList ----------

export interface Crumb {
  name: string;
  /** Base-less site path, e.g. "/work/". */
  path: string;
}

/** Section index pages that exist, keyed by first path segment. */
const SECTIONS: Record<string, string> = {
  work: 'עבודות',
  products: 'מוצרים',
};

export const HOME_CRUMB: Crumb = { name: 'דף הבית', path: '/' };

/**
 * Breadcrumb trail derived from a page path. "/work/x/" -> home > עבודות > title.
 * Sections without an index page (e.g. /services/) skip the middle level, so every crumb is a real page.
 * Returns [] for the home page.
 */
export function autoCrumbs(path: string, title: string): Crumb[] {
  const segs = path.split('/').filter(Boolean);
  if (!segs.length) return [];
  const first = segs[0] ?? '';
  const section = SECTIONS[first];
  if (segs.length === 1) return [HOME_CRUMB, { name: section ?? title, path: `/${first}/` }];
  const trail: Crumb[] = [HOME_CRUMB];
  if (section) trail.push({ name: section, path: `/${first}/` });
  trail.push({ name: title, path: `/${segs.join('/')}/` });
  return trail;
}

export function breadcrumbLd(crumbs: readonly Crumb[], site: URL | undefined) {
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absolute(c.path, site),
    })),
  };
}

// ---------- Service ----------

interface ServiceFacts {
  name: string;
  description: string;
  url: string;
  image?: string | undefined;
  siteUrl: string;
  /** What you get, rendered as an OfferCatalog without prices. */
  deliverables?: readonly string[] | undefined;
  /** Who it's for. */
  audience?: readonly string[] | undefined;
}

export function serviceLd(s: ServiceFacts) {
  return {
    '@context': CONTEXT,
    '@type': 'Service',
    '@id': `${s.url}#service`,
    name: s.name,
    serviceType: s.name,
    description: s.description,
    url: s.url,
    ...(s.image ? { image: s.image } : {}),
    provider: { '@id': studioId(s.siteUrl) },
    areaServed: { '@type': 'Country', name: 'Israel' },
    availableLanguage: 'he',
    ...(s.audience?.length
      ? { audience: s.audience.map((a) => ({ '@type': 'Audience', audienceType: a })) }
      : {}),
    ...(s.deliverables?.length
      ? {
          hasOfferCatalog: {
            '@type': 'OfferCatalog',
            name: `מה מקבלים: ${s.name}`,
            itemListElement: s.deliverables.map((d) => ({
              '@type': 'Offer',
              itemOffered: { '@type': 'Service', name: d },
            })),
          },
        }
      : {}),
  };
}

// ---------- FAQPage ----------

export interface QA {
  question: string;
  answer: string;
}

/** FAQPage for questions that are visibly rendered on the same page. Undefined when there are none. */
export function faqPageLd(items: readonly QA[], url?: string) {
  const list = items.filter((q) => q.question.trim() && q.answer.trim());
  if (!list.length) return undefined;
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    ...(url ? { url } : {}),
    inLanguage: 'he',
    mainEntity: list.map((q) => ({
      '@type': 'Question',
      name: q.question.trim(),
      acceptedAnswer: { '@type': 'Answer', text: q.answer.trim() },
    })),
  };
}

// ---------- Works ----------

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

/** The subset of a works entry that workJsonLd reads. A CollectionEntry<'works'> satisfies it as-is. */
export interface WorkLdInput {
  id: string;
  data: {
    title: string;
    artist?: string | undefined;
    client?: string | undefined;
    summary: string;
    year: number;
    disciplines: readonly Discipline[];
    video?: VideoRef | undefined;
    websiteUrl?: string | undefined;
  };
}

export interface WorkLdContext {
  /** Astro.site */
  site: URL | undefined;
  ownerName: string;
  /** Absolute URL of the poster image (e.g. from getImage(), made absolute). */
  image: string;
}

function absoluteMedia(ref: string, site: URL | undefined): string {
  return /^https?:/.test(ref) ? ref : absolute(ref, site);
}

/**
 * JSON-LD for a work page: CreativeWork, with a nested VideoObject when the work has a video.
 * Uses only content fields. Deliberately omits uploadDate, duration and interaction counts
 * (we do not have them); dateCreated is the work's year as entered.
 *
 * Used by src/pages/work/[slug].astro:
 *   const ld = workJsonLd(work, { site: Astro.site, ownerName: settings.ownerName, image: ogImage });
 *   <Base ... jsonLd={[ld]} />
 */
export function workJsonLd(work: WorkLdInput, ctx: WorkLdContext) {
  const d = work.data;
  const name = formatWorkTitle(d);
  const url = absolute(`/work/${work.id}/`, ctx.site);
  const v = d.video;
  const video = v
    ? {
        '@type': 'VideoObject',
        name,
        description: d.summary,
        thumbnailUrl: ctx.image,
        inLanguage: 'he',
        ...(v.provider === 'file'
          ? { contentUrl: absoluteMedia(v.id, ctx.site) }
          : { embedUrl: videoEmbedUrl(v) }),
        ...(v.captions
          ? {
              caption: {
                '@type': 'MediaObject',
                contentUrl: absoluteMedia(v.captions, ctx.site),
                encodingFormat: 'text/vtt',
                inLanguage: 'he',
              },
            }
          : {}),
      }
    : undefined;
  return {
    '@context': CONTEXT,
    '@type': 'CreativeWork',
    '@id': `${url}#work`,
    name,
    description: d.summary,
    url,
    image: ctx.image,
    thumbnailUrl: ctx.image,
    dateCreated: String(d.year),
    inLanguage: 'he',
    genre: d.disciplines.map((x) => DISCIPLINE_LABEL[x]),
    creator: { '@type': 'Person', name: ctx.ownerName },
    publisher: { '@id': studioId(absolute('/', ctx.site)) },
    ...(d.websiteUrl ? { sameAs: d.websiteUrl } : {}),
    ...(video ? { video } : {}),
  };
}

/** Safe JSON for <script type="application/ld+json">. */
export function ldJson(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
