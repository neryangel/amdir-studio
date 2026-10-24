// Keystatic admin (dev only): http://127.0.0.1:4321/keystatic
// Storage: local. Edits are written straight into src/content/** and src/assets/**,
// then committed with git like any other file. Fields mirror src/content.config.ts.
import { collection, config, fields, singleton } from '@keystatic/core';
import {
  DIRECTION_LABEL,
  DIRECTIONS,
  DISCIPLINE_LABEL,
  DISCIPLINES,
  VAT_LABEL,
  VAT_MODES,
  WORK_TYPE_LABEL,
  WORK_TYPES,
} from './src/lib/enums';

const opts = <T extends string>(values: readonly T[], labels: Record<T, string>) =>
  values.map((value) => ({ value, label: labels[value] }));

const videoFields = () => ({
  id: fields.text({
    label: 'מזהה הסרטון',
    description: 'Bunny: libraryId/videoId · Vimeo/YouTube: מזהה הסרטון · קובץ: נתיב תחת public (למשל /media/clip.mp4) או כתובת https',
  }),
  captions: fields.text({
    label: 'קובץ כתוביות (VTT)',
    description: 'נתיב או כתובת לקובץ כתוביות בעברית. מומלץ מאוד לנגישות.',
  }),
});

const video = (label: string) =>
  fields.conditional(
    fields.select({
      label,
      options: [
        { label: 'אין סרטון', value: 'none' },
        { label: 'Bunny Stream', value: 'bunny' },
        { label: 'Vimeo', value: 'vimeo' },
        { label: 'YouTube (מצב פרטיות מוגבר)', value: 'youtube' },
        { label: 'קובץ וידאו', value: 'file' },
      ],
      defaultValue: 'none',
    }),
    {
      none: fields.empty(),
      bunny: fields.object(videoFields()),
      vimeo: fields.object(videoFields()),
      youtube: fields.object(videoFields()),
      file: fields.object(videoFields()),
    },
  );

const textList = (label: string, itemLabel: string, description?: string) =>
  fields.array(fields.text({ label: itemLabel }), {
    label,
    ...(description ? { description } : {}),
    itemLabel: (props) => props.value || itemLabel,
  });

export default config({
  storage: { kind: 'local' },
  ui: {
    brand: { name: 'AMDIR סטודיו' },
    navigation: {
      תוכן: ['works', 'services', 'products'],
      הגדרות: ['settings'],
    },
  },
  collections: {
    works: collection({
      label: 'עבודות',
      slugField: 'title',
      path: 'src/content/works/*',
      format: { data: 'yaml' },
      columns: ['title', 'year'],
      schema: {
        title: fields.slug({
          name: { label: 'כותרת', description: 'שם השיר או שם הפרויקט. שם האמן או הלקוח בשדות הנפרדים.' },
          slug: { label: 'כתובת (slug)', description: 'אותיות לטיניות קטנות ומקפים בלבד' },
        }),
        artist: fields.text({ label: 'אמן', description: 'לקליפים. ריק אם לא רלוונטי.' }),
        client: fields.text({ label: 'לקוח', description: 'שם הלקוח, רק באישור שלו.' }),
        type: fields.select({ label: 'סוג', options: opts(WORK_TYPES, WORK_TYPE_LABEL), defaultValue: 'personal' }),
        disciplines: fields.multiselect({ label: 'תחומים', options: opts(DISCIPLINES, DISCIPLINE_LABEL) }),
        year: fields.integer({ label: 'שנה', validation: { isRequired: true, min: 2000, max: 2100 } }),
        summary: fields.text({ label: 'המטרה', multiline: true, validation: { length: { min: 1 } } }),
        deliverables: textList('מה נוצר', 'תוצר'),
        credits: textList('קרדיטים (תפקידים)', 'תפקיד', 'למשל: רעיון והפקה, עריכה, מושן ואפקטים, יצירת תמונה ב-AI'),
        tools: textList('כלים', 'כלי', 'למשל: Premiere, After Effects'),
        aiUsed: fields.checkbox({ label: 'נעשה שימוש ב-AI', description: 'יופיע כקרדיט אחד מתוך כמה' }),
        aiNote: fields.text({ label: 'מה נעשה ב-AI', description: 'משפט קצר. למשל: תמונות רקע לשתי סצנות' }),
        outcome: fields.object(
          {
            text: fields.text({ label: 'תוצאה' }),
            source: fields.text({ label: 'מקור לתוצאה', description: 'חובה. בלי מקור התוצאה לא תוצג באתר.' }),
          },
          { label: 'תוצאה (לא חובה)' },
        ),
        poster: fields.image({
          label: 'תמונת פתיחה',
          directory: 'src/assets/works',
          publicPath: '../../assets/works/',
          validation: { isRequired: true },
        }),
        posterAlt: fields.text({ label: 'טקסט חלופי לתמונת הפתיחה', validation: { length: { min: 1 } } }),
        video: video('סרטון'),
        preview: fields.object(
          {
            mp4: fields.text({ label: 'MP4', description: 'נתיב תחת public, למשל /media/works/slug/preview.mp4' }),
            webm: fields.text({ label: 'WebM (לא חובה)' }),
          },
          { label: 'לופ תצוגה מקדימה (מושתק, נוצר בסקריפט הקליטה)' },
        ),
        gallery: fields.array(
          fields.object({
            image: fields.image({
              label: 'תמונה',
              directory: 'src/assets/works',
              publicPath: '../../assets/works/',
              validation: { isRequired: true },
            }),
            alt: fields.text({ label: 'טקסט חלופי', validation: { length: { min: 1 } } }),
          }),
          { label: 'גלריה', itemLabel: (props) => props.fields.alt.value || 'תמונה' },
        ),
        websiteUrl: fields.url({ label: 'קישור לאתר (לעבודות אתרים)' }),
        permissionToShow: fields.checkbox({
          label: 'יש אישור להציג',
          description: 'חובה לעבודות לקוח. עבודת לקוח בלי אישור לא תיכלל באתר.',
        }),
        musicLicensed: fields.checkbox({
          label: 'המוזיקה מורשית לשימוש',
          description: 'לקליפים. אם לא מסומן בקליפ של לקוח או אישי, הבנייה תציג אזהרה.',
        }),
        featured: fields.checkbox({ label: 'להציג בדף הבית' }),
        order: fields.integer({ label: 'סדר', defaultValue: 100 }),
        placeholder: fields.checkbox({ label: 'חומר זמני', description: 'סמנו רק לחומר דוגמה. עבודה מסומנת לא תופיע באתר החי.', defaultValue: false }),
        needsReview: fields.checkbox({
          label: 'ממתין לבדיקה',
          description: 'נוצר אוטומטית בסקריפט הקליטה. להסיר את הסימון אחרי שבדקת את כל השדות.',
        }),
      },
    }),
    services: collection({
      label: 'שירותים',
      slugField: 'title',
      path: 'src/content/services/*',
      format: { data: 'yaml' },
      schema: {
        title: fields.slug({ name: { label: 'שם השירות' } }),
        summary: fields.text({ label: 'תקציר', multiline: true }),
        cover: fields.image({
          label: 'תמונה',
          directory: 'src/assets/services',
          publicPath: '../../assets/services/',
          validation: { isRequired: true },
        }),
        coverAlt: fields.text({ label: 'טקסט חלופי', validation: { length: { min: 1 } } }),
        whoFor: textList('למי זה מתאים', 'שורה'),
        whatYouGet: textList('מה מקבלים', 'שורה'),
        process: fields.array(
          fields.object({ title: fields.text({ label: 'שלב' }), text: fields.text({ label: 'פירוט', multiline: true }) }),
          { label: 'תהליך', itemLabel: (props) => props.fields.title.value || 'שלב' },
        ),
        afterDelivery: textList('אחרי המסירה', 'שורה'),
        relatedDisciplines: fields.multiselect({ label: 'עבודות רלוונטיות מהתחומים', options: opts(DISCIPLINES, DISCIPLINE_LABEL) }),
        price: fields.object(
          {
            text: fields.text({ label: 'מחיר', description: 'כרגע לא מציגים מחירים. השאירו ריק.' }),
            vat: fields.select({
              label: 'מע״מ',
              options: [{ label: 'לא נבחר', value: '' }, ...opts(VAT_MODES, VAT_LABEL)],
              defaultValue: '',
            }),
          },
          { label: 'מחיר (לא חובה, מוצג רק עם ציון מע״מ)' },
        ),
        order: fields.integer({ label: 'סדר', defaultValue: 100 }),
        placeholder: fields.checkbox({ label: 'חומר זמני', description: 'סמנו רק לחומר דוגמה. לא יופיע באתר החי.', defaultValue: false }),
      },
    }),
    products: collection({
      label: 'מוצרים',
      slugField: 'title',
      path: 'src/content/products/*',
      format: { data: 'yaml' },
      schema: {
        title: fields.slug({ name: { label: 'שם המוצר' } }),
        status: fields.select({
          label: 'מצב',
          options: [
            { label: 'בפיילוט', value: 'pilot' },
            { label: 'פעיל', value: 'live' },
          ],
          defaultValue: 'pilot',
        }),
        summary: fields.text({ label: 'תקציר', multiline: true }),
        features: textList('מה המוצר עושה', 'שורה'),
        facts: textList('עובדות והתחייבויות', 'שורה'),
        legalDraft: textList('שורות לבדיקה משפטית', 'שורה', 'יוצגו עם הסימון [טיוטה לבדיקה משפטית]'),
        poster: fields.image({
          label: 'תמונה',
          directory: 'src/assets/products',
          publicPath: '../../assets/products/',
          validation: { isRequired: true },
        }),
        posterAlt: fields.text({ label: 'טקסט חלופי', validation: { length: { min: 1 } } }),
        demoVideo: video('סרטון הדגמה'),
        appUrl: fields.url({ label: 'קישור לאפליקציה' }),
        placeholder: fields.checkbox({ label: 'חומר זמני', description: 'סמנו רק לחומר דוגמה. לא יופיע באתר החי.', defaultValue: false }),
      },
    }),
  },
  singletons: {
    settings: singleton({
      label: 'הגדרות האתר',
      path: 'src/content/settings/site',
      format: { data: 'yaml' },
      schema: {
        studioName: fields.text({ label: 'שם הסטודיו', defaultValue: 'AMDIR' }),
        ownerName: fields.text({ label: 'שם', defaultValue: 'נריה אנג׳ל' }),
        headline: fields.text({ label: 'כותרת ראשית' }),
        subline: fields.text({ label: 'שורת משנה' }),
        defaultDirection: fields.select({ label: 'כיוון עיצוב', options: opts(DIRECTIONS, DIRECTION_LABEL), defaultValue: 'stage' }),
        email: fields.text({ label: 'אימייל ליצירת קשר', description: '[להשלמה]' }),
        whatsappNumber: fields.text({ label: 'מספר וואטסאפ', description: 'בפורמט בינלאומי בלי + ובלי רווחים, למשל 9725XXXXXXXX. [להשלמה]' }),
        replyTime: fields.text({ label: 'זמן מענה', description: 'מופיע אחרי שליחת טופס, למשל: תוך יומיים בימי עבודה' }),
        showreel: video('שואוריל'),
        showreelPoster: fields.image({ label: 'תמונת פתיחה לשואוריל', directory: 'src/assets/site', publicPath: '../../assets/site/' }),
        showreelPosterAlt: fields.text({ label: 'טקסט חלופי לשואוריל' }),
        showreelPlaceholder: fields.checkbox({ label: 'השואוריל זמני', defaultValue: true }),
        business: fields.object(
          {
            legalName: fields.text({ label: 'שם העסק הרשום' }),
            osekNumber: fields.text({ label: 'מספר עוסק' }),
            address: fields.text({ label: 'כתובת למשלוח דואר (לא חובה)' }),
          },
          { label: 'פרטי העסק [להשלמה]' },
        ),
        accessibility: fields.object(
          {
            contactName: fields.text({ label: 'רכז/ת נגישות' }),
            contactEmail: fields.text({ label: 'אימייל לנגישות' }),
            contactPhone: fields.text({ label: 'טלפון לנגישות' }),
            lastReviewed: fields.text({ label: 'תאריך בדיקה אחרון', description: 'למשל 23.10.2026' }),
          },
          { label: 'הצהרת נגישות' },
        ),
      },
    }),
  },
});
