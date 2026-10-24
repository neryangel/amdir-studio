import { describe, expect, it } from 'vitest';
import {
  HOME_CRUMB,
  autoCrumbs,
  breadcrumbLd,
  faqPageLd,
  ldJson,
  organizationLd,
  serviceLd,
  studioId,
  videoEmbedUrl,
  workJsonLd,
  type WorkLdInput,
} from '../src/lib/seo';
import { formatWorkTitle } from '../src/lib/titles';

const SITE = new URL('https://studio.example');
const SITE_URL = 'https://studio.example/';

const base = {
  studioName: 'AMDIR',
  ownerName: 'נריה אנג׳ל',
  url: SITE_URL,
  logo: `${SITE_URL}og-default.png`,
  description: 'הפקת קליפים, וידאו ואתרים.',
};

describe('organizationLd', () => {
  it('is an Organization + ProfessionalService with a stable @id', () => {
    const ld = organizationLd(base);
    expect(ld['@type']).toEqual(['Organization', 'ProfessionalService']);
    expect(ld['@id']).toBe('https://studio.example/#studio');
    expect(ld.founder).toEqual({ '@type': 'Person', name: 'נריה אנג׳ל' });
  });

  it('omits contact details and address that are not in settings', () => {
    const ld = organizationLd({ ...base, email: undefined, telephone: undefined, address: undefined });
    expect(ld).not.toHaveProperty('email');
    expect(ld).not.toHaveProperty('telephone');
    expect(ld).not.toHaveProperty('address');
    expect(ld).not.toHaveProperty('aggregateRating');
  });

  it('includes them only when present', () => {
    const ld = organizationLd({ ...base, email: 'a@b.co', telephone: '+972500000000', address: 'רחוב 1, עיר' });
    expect(ld).toMatchObject({
      email: 'a@b.co',
      telephone: '+972500000000',
      address: { '@type': 'PostalAddress', streetAddress: 'רחוב 1, עיר', addressCountry: 'IL' },
    });
  });

  it('lists the services of the build, falling back to the crafts', () => {
    expect(organizationLd({ ...base, services: ['הפקת קליפים', 'אתרים'] }).knowsAbout).toEqual(['הפקת קליפים', 'אתרים']);
    expect(organizationLd({ ...base, services: [] }).knowsAbout.length).toBeGreaterThan(0);
  });
});

describe('studioId', () => {
  it('normalises the trailing slash', () => {
    expect(studioId('https://x.co')).toBe('https://x.co/#studio');
    expect(studioId('https://x.co/')).toBe('https://x.co/#studio');
  });
});

describe('autoCrumbs / breadcrumbLd', () => {
  it('has no trail on the home page', () => {
    expect(autoCrumbs('/', 'דף הבית')).toEqual([]);
  });

  it('top-level page: home > page', () => {
    expect(autoCrumbs('/process/', 'איך אני עובד')).toEqual([HOME_CRUMB, { name: 'איך אני עובד', path: '/process/' }]);
  });

  it('section index uses the section label', () => {
    expect(autoCrumbs('/work/', 'כל העבודות')).toEqual([HOME_CRUMB, { name: 'עבודות', path: '/work/' }]);
  });

  it('work and product pages include their section', () => {
    expect(autoCrumbs('/work/clip/', 'קליפ')).toEqual([
      HOME_CRUMB,
      { name: 'עבודות', path: '/work/' },
      { name: 'קליפ', path: '/work/clip/' },
    ]);
    expect(autoCrumbs('/products/eps/', 'Event Pro Studio')[1]).toEqual({ name: 'מוצרים', path: '/products/' });
  });

  it('skips sections without an index page (no /services/ page exists)', () => {
    expect(autoCrumbs('/services/clips/', 'הפקת קליפים')).toEqual([
      HOME_CRUMB,
      { name: 'הפקת קליפים', path: '/services/clips/' },
    ]);
  });

  it('builds a BreadcrumbList with absolute URLs and 1-based positions', () => {
    const ld = breadcrumbLd(autoCrumbs('/work/clip/', 'קליפ'), SITE);
    expect(ld['@type']).toBe('BreadcrumbList');
    expect(ld.itemListElement.map((i) => [i.position, i.item])).toEqual([
      [1, 'https://studio.example/'],
      [2, 'https://studio.example/work/'],
      [3, 'https://studio.example/work/clip/'],
    ]);
  });
});

describe('serviceLd', () => {
  const svc = {
    name: 'הפקת קליפים',
    description: 'קליפ לשיר.',
    url: 'https://studio.example/services/clips/',
    siteUrl: SITE_URL,
  };

  it('points at the studio as provider and never carries a price', () => {
    const ld = serviceLd(svc);
    expect(ld).toMatchObject({ '@type': 'Service', provider: { '@id': 'https://studio.example/#studio' } });
    expect(JSON.stringify(ld)).not.toMatch(/price/i);
  });

  it('adds deliverables as a price-less OfferCatalog and audiences when given', () => {
    const ld = serviceLd({ ...svc, deliverables: ['גרסה מלאה', 'גרסה 9:16'], audience: ['אמנים'] });
    expect(ld.hasOfferCatalog?.itemListElement).toHaveLength(2);
    expect(ld.hasOfferCatalog?.itemListElement[0]).toEqual({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: 'גרסה מלאה' } });
    expect(ld.audience).toEqual([{ '@type': 'Audience', audienceType: 'אמנים' }]);
    expect(JSON.stringify(ld)).not.toMatch(/price/i);
  });

  it('omits empty optional blocks', () => {
    const ld = serviceLd({ ...svc, deliverables: [], audience: [] });
    expect(ld).not.toHaveProperty('hasOfferCatalog');
    expect(ld).not.toHaveProperty('audience');
    expect(ld).not.toHaveProperty('image');
  });
});

describe('faqPageLd', () => {
  it('maps question/answer pairs to Question/Answer', () => {
    const ld = faqPageLd([{ question: ' כמה זה עולה? ', answer: ' לפי ההיקף. ' }], 'https://studio.example/faq/');
    expect(ld).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      url: 'https://studio.example/faq/',
      inLanguage: 'he',
      mainEntity: [{ '@type': 'Question', name: 'כמה זה עולה?', acceptedAnswer: { '@type': 'Answer', text: 'לפי ההיקף.' } }],
    });
  });

  it('drops blank pairs and returns undefined when nothing is left', () => {
    expect(faqPageLd([{ question: '', answer: 'x' }, { question: 'y', answer: '  ' }])).toBeUndefined();
    expect(faqPageLd([])).toBeUndefined();
  });
});

describe('workJsonLd', () => {
  const work = (over: Partial<WorkLdInput['data']> = {}): WorkLdInput => ({
    id: 'clip-original-song',
    data: {
      title: 'שיר',
      artist: 'אמן',
      client: undefined,
      summary: 'מה היה צריך לקרות.',
      year: 2026,
      disciplines: ['clips', 'motion'],
      video: undefined,
      websiteUrl: undefined,
      ...over,
    },
  });
  const ctx = { site: SITE, ownerName: 'נריה אנג׳ל', image: 'https://studio.example/_astro/poster.jpeg' };

  it('is a CreativeWork named like the site (artist - title)', () => {
    const ld = workJsonLd(work(), ctx);
    expect(ld).toMatchObject({
      '@type': 'CreativeWork',
      '@id': 'https://studio.example/work/clip-original-song/#work',
      name: 'אמן - שיר',
      url: 'https://studio.example/work/clip-original-song/',
      image: ctx.image,
      dateCreated: '2026',
      genre: ['קליפים', 'מושן'],
      creator: { '@type': 'Person', name: 'נריה אנג׳ל' },
      publisher: { '@id': 'https://studio.example/#studio' },
    });
    expect(ld).not.toHaveProperty('video');
  });

  it('never invents views, upload dates or durations', () => {
    const ld = workJsonLd(work({ video: { provider: 'youtube', id: 'abc' } }), ctx);
    const s = JSON.stringify(ld);
    for (const k of ['uploadDate', 'datePublished', 'duration', 'interactionStatistic', 'aggregateRating']) {
      expect(s).not.toContain(k);
    }
  });

  it('nests a VideoObject with embedUrl for hosted players', () => {
    const ld = workJsonLd(work({ video: { provider: 'vimeo', id: '123' } }), ctx);
    expect(ld.video).toMatchObject({
      '@type': 'VideoObject',
      name: 'אמן - שיר',
      thumbnailUrl: ctx.image,
      embedUrl: 'https://player.vimeo.com/video/123',
    });
    expect(ld.video).not.toHaveProperty('contentUrl');
  });

  it('uses an absolute contentUrl and Hebrew captions for self-hosted files', () => {
    const ld = workJsonLd(work({ video: { provider: 'file', id: '/media/clip.mp4', captions: '/media/clip.he.vtt' } }), ctx);
    expect(ld.video).toMatchObject({
      contentUrl: 'https://studio.example/media/clip.mp4',
      caption: { '@type': 'MediaObject', contentUrl: 'https://studio.example/media/clip.he.vtt', encodingFormat: 'text/vtt', inLanguage: 'he' },
    });
    const cdn = workJsonLd(work({ video: { provider: 'file', id: 'https://cdn.example/a.mp4' } }), ctx);
    expect(cdn.video).toMatchObject({ contentUrl: 'https://cdn.example/a.mp4' });
  });

  it('links a website work to the live site', () => {
    const ld = workJsonLd(work({ artist: undefined, client: 'לקוח', disciplines: ['web'], websiteUrl: 'https://client.example' }), ctx);
    expect(ld.name).toBe('שיר ל־לקוח');
    expect(ld.sameAs).toBe('https://client.example');
  });
});

describe('videoEmbedUrl', () => {
  it('uses privacy-friendly embeds', () => {
    expect(videoEmbedUrl({ provider: 'youtube', id: 'a b' })).toBe('https://www.youtube-nocookie.com/embed/a%20b');
    expect(videoEmbedUrl({ provider: 'bunny', id: '1/2' })).toBe('https://iframe.mediadelivery.net/embed/1/2');
    expect(videoEmbedUrl({ provider: 'file', id: '/x.mp4' })).toBeUndefined();
  });
});

describe('ldJson', () => {
  it('escapes "<" so content cannot close the script tag, and stays valid JSON', () => {
    const out = ldJson({ name: '</script><script>alert(1)</script>' });
    expect(out).not.toContain('</script>');
    expect(JSON.parse(out)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});

describe('formatWorkTitle', () => {
  it('artist wins over client, otherwise plain title', () => {
    expect(formatWorkTitle({ title: 'ש', artist: 'א', client: 'ל' })).toBe('א - ש');
    expect(formatWorkTitle({ title: 'ש', client: 'ל' })).toBe('ש ל־ל');
    expect(formatWorkTitle({ title: 'ש' })).toBe('ש');
  });
});
