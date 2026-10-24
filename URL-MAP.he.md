# מפת כתובות (URL-MAP) — לפני כל שינוי דומיין/ניתוב

> מסמך לאישור הבעלים. **לא שונה שום דבר**: לא DNS, לא Vercel, לא דומיינים, לא פריסה, לא DB.
> כל הבדיקות נעשו ב-24.10.2026 (בערך 17:15 UTC) בבקשות GET/HEAD בלבד, פעם עם דפדפן רגיל ופעם עם User-Agent של Googlebot.
> כל שורה מסומנת בראיה (פקודה + סטטוס). מה שלא הצלחתי לאמת כתוב במפורש כ"לא אומת".

## מקרא ראיות

| קוד | פקודה |
|---|---|
| **C1** | `curl -sS -L -o /dev/null -w '%{http_code} %{num_redirects} %{url_effective}' https://HOST/PATH` (דפדפן רגיל) |
| **C2** | אותה פקודה עם `-A 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'` |
| **C3** | `curl -sS -I https://HOST/` (רק הקפיצה הראשונה: קוד הפניה ו-location) |
| **H** | `curl -sS https://HOST/PATH` ובדיקת `<title>`, שם קובץ ה-JS הראשי ו-headers (`server`, `x-served-by`, `sb-project-ref`) |
| **D** | `curl -sS 'https://dns.google/resolve?name=HOST&type=A|CNAME'` (קריאת DNS בלבד, דרך DNS-over-HTTPS) |
| **R** | קריאת קובץ במאגר (נתיב:שורה מצוין) |

"מעטפת SPA" = הקובץ `index.html` של אפליקציית AMDIR (26,669 בתים, טוען `/assets/index-2WvcyUVQ.js`, כותרת "AMDIR - אמדיר | בניית אתרים מקצועית לעסקים קטנים"). השרת מחזיר אותה עם 200 לכל נתיב, והניתוב האמיתי (כולל הפניות כמו ‎/about→/‎) קורה רק בדפדפן אחרי JavaScript. **אין בסביבה דפדפן headless**, ולכן מה שמוצג בפועל אחרי JS לא אומת.

---

## 1. דומיינים: לאן כל אחד מצביע היום

| דומיין | DNS (D) | קפיצה ראשונה (C3) | סופי (C1 / C2) | מי מגיש | ראיה |
|---|---|---|---|---|---|
| `amdir.co.il` | A ‏216.150.1.1, ‏216.150.16.1 (Vercel) | **307** (זמני) ← `https://www.amdir.co.il/` | 200 ‏`https://www.amdir.co.il/` (בשניהם) | Vercel, מעטפת SPA של AMDIR | C3 307; C1/C2 200; H |
| `www.amdir.co.il` | CNAME ‏`0899d4b935c6865a.vercel-dns-017.com` | אין הפניה | 200 (בשניהם) | Vercel, מעטפת SPA של AMDIR (`x-vercel-cache: HIT`) | C1/C2 200; H |
| `neryaangel.com` | A ‏216.198.79.1 (Vercel) | **307** ← `https://www.neryaangel.com/` | 200 ‏`https://www.neryaangel.com/` | Vercel. **אותה מעטפת SPA בדיוק** כמו amdir.co.il (אותו גודל, אותו קובץ JS) | C3 307; C1/C2 200; H |
| `www.neryaangel.com` | A ‏216.198.79.1 | אין הפניה | 200 | כנ"ל | C1/C2 200; H |
| `neryaangel.info` | A ‏216.198.79.1 | **308** (קבוע) ← `https://www.neryaangel.info/` | 200 ‏`https://www.neryaangel.info/` | כנ"ל, אותה מעטפת SPA | C3 308; C1/C2 200; H |
| `www.neryaangel.info` | A ‏216.198.79.1 | אין הפניה | 200 | כנ"ל | C1/C2 200; H |
| `neryaangel.online` | A ‏185.158.133.1 | אין הפניה | 200 ‏`https://neryaangel.online/` | `server: cloudflare`. **אפליקציית Lovable** (כותרת "Lovable App", ‏1,895 בתים, `/assets/index-BmaWrMFG.js`). לא AMDIR | C1/C2 200; H |
| `www.neryaangel.online` | A ‏76.76.21.21 (Vercel) | HTTP: ‏308 ← https | **נכשל: תעודת SSL פגה** (`curl: (60) certificate has expired`) | Vercel, אבל ב-HTTPS אי אפשר להגיע | `curl -I` → שגיאה 60; `curl -I http://…` → 308 |
| `amdir.site` (נמצא בקוד) | A ‏172.67.162.35, ‏104.21.10.24 (Cloudflare) | אין הפניה | **404** | Cloudflare מול Vercel: הגוף "The deployment could not be found on Vercel. DEPLOYMENT_NOT_FOUND" | C1/C2 404; H |
| `www.amdir.site` (נמצא בקוד) | כנ"ל | — | **404** | כנ"ל | C1/C2 404 |

**הערות על הדומיינים:**
- דומיינים שמופיעים בקוד של `/home/user/amdir`: ‏`amdir.co.il`/`www.amdir.co.il` (og:url ב-`index.html:87`, ברירת המחדל של sitemap), ‏`amdir.site`/`www.amdir.site` (רשימות מותרות ב-`supabase/functions/sitemap/index.ts:60` וב-`robots-txt/index.ts:16-17`; ‏robots-txt אף משתמש ב-`amdir.site` כברירת מחדל), ‏`auth.amdir.co.il` (ב-CSP של `vercel.json`). ב-`index.html` אין `<link rel="canonical">`, יש רק og:url. ‏`staging.`/`app.`/`cdn.amdir.co.il` מופיעים רק בבדיקות או בדוגמאות ולא נבדקו.
- הדומיין הקנוני מבולבל: og:url, ‏sitemap ו-robots מצביעים על `https://amdir.co.il` (בלי www), אבל הדומיין הזה מפנה ב-**307 זמני** ל-www. (R + C3)
- ‏neryaangel.com ו-neryaangel.info מגישים את אותה פריסה כמו amdir.co.il. **הסקה, לא אימות:** כנראה אותו פרויקט Vercel ‏(`fit-lead-page`), כי קובץ ה-JS זהה. ב-SPA, ‏`isCustomDomain()` (‏`src/router/RootLayout.tsx:84-106`) מזהה אותם כדומיין של לקוח ומציג `CustomDomainSite`. לפי `docs/audit/2026-05-11-deep/production-state.md:352`, החיפוש `get-site-by-domain` עבור `www.neryaangel.com` החזיר 404 ("domain not yet provisioned"). קיימת מיגרציה לאתר "Nerya Angel" ‏(מאמן כושר, `supabase/migrations/20260119051200_update_neryaangel_content.sql`). **מה מוצג היום בדפדפן לא אומת** (אין דפדפן ולא נגעתי ב-DB).

---

## 2. ‏sitemap.xml ו-robots.txt בכל דומיין

| דומיין | ‎/sitemap.xml (C1 / C2) | ‎/robots.txt (C1 / C2) | ראיה |
|---|---|---|---|
| amdir.co.il → www | 200 ‏`application/xml` (אחרי 307 ל-www) | 200 ‏`text/plain` | C1/C2 |
| www.amdir.co.il | 200 | 200 | C1/C2 |
| neryaangel.com / www | 200, **אותו sitemap של AMDIR** (6 כתובות, כולן `https://amdir.co.il/...`) | 200, **זהה לגמרי** ל-robots של amdir (`cmp` → same) | C1/C2 + `grep -c '<loc>'` = 6 |
| neryaangel.info / www | 200, אותו sitemap (6 כתובות של amdir.co.il) | 200, זהה | C1/C2 |
| neryaangel.online | **404** | 200, robots של Lovable (רק `Allow: /`, בלי Sitemap) | C1/C2 |
| amdir.site / www | 404 (DEPLOYMENT_NOT_FOUND) | 404 | C1/C2 |

**התוכן של ה-sitemap שמוגש היום בייצור** (‏`curl https://www.amdir.co.il/sitemap.xml`, ‏lastmod ‏2026-03-05):
`https://amdir.co.il`, ‏`/about`, ‏`/demos`, ‏`/terms`, ‏`/privacy`, ‏`/accessibility`.
- **אין בו אף אתר לקוח.**
- ‏`/accessibility` לא קיים כנתיב באפליקציה. הנתיב האמיתי הוא `/accessibility-statement`, ולכן `/accessibility` נופל ל-`/:slug` כאילו היה אתר לקוח.
- הוא **לא תואם לא ל-main ולא לענף הנוכחי**. ב-‏`origin/main:supabase/functions/sitemap/index.ts:92-99` מופיעים ‎/, /demos, /about, /pricing, /accessibility-statement, /terms, /privacy‎ ואתרים מפורסמים. בענף `claude/amdir-event-pro-review-g4d74d` (‏commit ‏06da7e2, לא מוזג ל-main) הוסרו /about ו-/pricing. כלומר פונקציית ה-Edge שפרוסה בפועל ישנה יותר מהקוד.

**robots.txt בייצור:** בקבוצת `*` מופיעים רק `Disallow: /dashboard/ /my-sites/ /auth/`, ושורת `Sitemap: https://amdir.co.il/sitemap.xml`. גם זה ישן יותר מ-`supabase/functions/_shared/robotsTxt.ts` במאגר.

**‎/llms.txt:** ‏404 עם `{"code":"NOT_FOUND","message":"Requested function was not found"}`. ה-rewrite קיים ב-vercel.json, אבל הפונקציה `llms-txt` לא פרוסה ב-Supabase. (C1/C2)

---

## 3. ממצא קריטי: Googlebot מקבל 404 על כל נתיב בן מקטע אחד

ב-`origin/main:vercel.json` (שורה 16) הכלל שמנתב בוטים הוא `"source": "/:slug"` **בלי שום החרגה**. לכן כל בקשה של בוט לנתיב בן מקטע אחד נשלחת ל-`serve-published-html?slug=…`, וכשאין HTML שמור מוחזר `404 Not found` (‏9 בתים, `x-served-by: supabase-edge-runtime`, ‏`sb-project-ref: vkdtwlfoeitnrujmyuyx`).

התיקון (‏commit ‏ff18dab, "keep app routes out of the bot-UA /:slug rewrite") קיים רק בענף הנוכחי ו**לא מוזג ל-main** (`git merge-base --is-ancestor ff18dab origin/main` → NOT in main).

בפועל, ב-C2 ‏(Googlebot) קיבלו **404**: ‎/about, /pricing, /templates, /terms, /privacy, /accessibility-statement, /accessibility, /demos, /examples, /auth, /login, /reset-password, /services, /blog, /my-sites, /dashboard, /create‎, ו**גם `/happy-djs-x2x7jf2z`** (האתר של הבעלים). אותו דבר קורה ב-`www.neryaangel.com/about` וב-`www.neryaangel.info/terms`.
נתיבים עם שני מקטעים (‎/demo/happy-djs, /s/abc‎) ודף הבית `/` מקבלים 200 ומעטפת SPA.

המשמעות: גוגל לא יכול לאנדקס היום את דפי השיווק ואת דפי המשפט של AMDIR.

**עדכון אחרי בדיקה (24.10, קריאה בלבד):** ה-404 על `/happy-djs-x2x7jf2z` תקין. האתר הזה סומן כמחוק ב-AMDIR ב-31.3.2026 (`deleted_at` מלא, 0 גרסאות). אתר ה-DJ האמיתי הוא `happy-djs.com`, פרויקט Vercel נפרד, והוא מחזיר 200 גם לגוגל. במסד אין כרגע אף אתר לקוח מפורסם שלא נמחק (32 טיוטות ואתר אחד בסטטוס client_approved), ולכן הבעיה הפעילה היא רק דפי השיווק והמשפט של AMDIR. את זה מתקן ff18dab.

---

## 4. נתיבי האתר החדש (amdir-studio)

מקור: `src/pages/*` ו-`dist/` (נבנה ב-24.10.2026). הגדרות: `trailingSlash: 'always'` ו-`build.format: 'directory'` (‏`astro.config.mjs`). ‏`site` מוגדר היום כ-`https://studio.amdir.example`, כתובת ממלא-מקום (`.env`: "[להשלמה] כשיהיה דומיין").

| נתיב בסטודיו | קובץ מקור | קיים ב-dist היום? |
|---|---|---|
| `/` | `index.astro` | כן |
| `/work/` | `work/index.astro` | כן |
| `/work/{slug}/` | `work/[slug].astro` | **לא**. כל 8 העבודות הן placeholder או needsReview, או חסרות `permissionToShow`, ולכן מסוננות (`src/lib/content.ts:23-30`) |
| `/services/{slug}/` (‏`video`, ‏`websites`) | `services/[slug].astro` | **לא** (placeholder: true) |
| `/products/` | `products/index.astro` | כן |
| `/products/{slug}/` (‏`event-pro-studio`) | `products/[slug].astro` | **לא** (placeholder: true) |
| `/about/` | `about.astro` | כן |
| `/contact/` | `contact.astro` | כן |
| `/privacy/` | `privacy.astro` | כן |
| `/accessibility/` | `accessibility.astro` | כן |
| `/terms/` | `terms.astro` | כן |
| `/404.html` | `404.astro` | כן |
| `/sitemap.xml`, `/robots.txt` | `sitemap.xml.ts`, `robots.txt.ts` | כן (ה-sitemap מכיל 8 כתובות על `studio.amdir.example`) |
| `/api/lead` | `api/lead.ts` (פונקציית Vercel) | — (פונקציה, לא דף) |

---

## 5. כל כתובת ציבורית של אפליקציית AMDIR → הגורל המוצע

מקור הנתיבים: `src/router/segments/*.tsx`, ‏`src/shared/constants/security/reservedSlugs.ts`, ‏`vercel.json`.
בעמודת "היום", C1 תמיד מחזיר 200 עם מעטפת SPA. בעמודה "בוט" מופיעה תוצאת C2.

> **הנחת עבודה של ההצעה:** האתר החדש תופס את **השורש של `amdir.co.il`**, והאפליקציה ממשיכה לפעול. **זו לא החלטה**, ראו שאלה 1. אם הסטודיו יעלה על דומיין או תת-דומיין נפרד, כמעט כל השורות למטה יהיו "ללא שינוי".

### 5א. דפי שיווק ודפים משפטיים (אלה שמועמדים להחלפה)

| כתובת נוכחית | מה היא היום (קוד) | בדפדפן (C1) | בוט (C2) | גורל מוצע | נימוק |
|---|---|---|---|---|---|
| `/` | `HomePage` (‏`publicRoutes.tsx`) | 200 SPA | 200 SPA | **מוחלף** ב-`/` של הסטודיו (אותה כתובת) | זה עמוד השיווק המרכזי |
| `/about` | `Navigate → /` בצד לקוח (`publicRoutes.tsx`: "invented founding team") | 200 SPA | **404** | **‏301 ← `/about/`** | לסטודיו יש דף אודות אמיתי. ההפניה הנוכחית היא JS ולא 301 |
| `/pricing` | `Navigate → /` בצד לקוח | 200 SPA | **404** | **‏301 ← `/contact/`** (או `/`). שאלה 4 | אין דף מחירים בסטודיו |
| `/terms` | `TermsPage`, תנאי השימוש של **פלטפורמת** AMDIR | 200 SPA | **404** | **לא להעביר עד החלטה.** שאלה 3 | טקסט משפטי שמשתמשי האפליקציה הסכימו לו. ב-`/terms/` של הסטודיו יש תוכן אחר |
| `/privacy` | `PrivacyPage`, מדיניות הפרטיות של הפלטפורמה | 200 SPA | **404** | **לא להעביר עד החלטה.** שאלה 3 | כנ"ל, וחל גם על נתוני לקוחות הקצה |
| `/accessibility-statement` | `AccessibilityStatementPage` | 200 SPA | **404** | **‏301 ← `/accessibility/`**, רק אם הצהרת הסטודיו מכסה גם את האפליקציה. אחרת ללא שינוי. שאלה 3 | הצהרת נגישות צריכה לתאר את השירות שהיא חלה עליו |
| `/accessibility` | **אין נתיב** (נופל ל-`/:slug`), אבל מופיע ב-sitemap של הייצור | 200 SPA | **404** | **יוגש ישירות** כ-`/accessibility/` של הסטודיו | כתובת שכבר פורסמה ב-sitemap וחסרה היום |
| `/templates` | `TemplateGalleryPage`, גלריית תבניות של בונה האתרים | 200 SPA | **404** | **שאלה 5:** ללא שינוי (חלק מהמוצר), או ‏301 ← `/products/` | תלוי אם בונה האתרים ממשיך להימכר |
| `/demos` | `Navigate → /#industry-showcase` (‏`miscRoutes.tsx`). מופיע ב-sitemap | 200 SPA | **404** | **‏301 ← `/work/`** | התיק בסטודיו מחליף את "התצוגה לפי ענף" |
| `/examples` | `Navigate → /#industry-showcase` | 200 SPA | **404** | **‏301 ← `/work/`** | כנ"ל |
| `/demo/{slug}` (‏`happy-djs`, ‏`power-gym` מקושרים מהקוד) | `DemoSitePage`, תצוגת תבנית לקריאה בלבד | 200 SPA | 200 SPA | **ללא שינוי** (שייך לאפליקציה). שאלה 5 | דמו של התבנית, לא האתר האמיתי. מקושר מתוך האפליקציה |
| `/sitemap.xml` | rewrite ← Edge `sitemap` | 200 xml | 200 xml | **מוחלף ב-sitemap index** שמאחד את דפי הסטודיו ואת אתרי הלקוחות. שאלה 6 | אסור לאבד את אתרי הלקוחות מה-sitemap |
| `/robots.txt` | rewrite ← Edge `robots-txt` | 200 | 200 | **מאוחד:** robots אחד שחוסם את נתיבי האפליקציה ומפנה ל-sitemap המאוחד | אותה סיבה |
| `/llms.txt` | rewrite ← Edge `llms-txt` (לא פרוס) | **404** | **404** | **מוגש מהסטודיו** (או ‏410 אם לא רוצים) | היום הכתובת שבורה ממילא |

### 5ב. אפליקציה: **ללא שינוי** (לא שיווק)

| כתובות | מקור | היום | גורל |
|---|---|---|---|
| `/auth`, `/auth/callback`, `/login` (→/auth), `/reset-password` | `publicRoutes.tsx`, ‏`miscRoutes.tsx` | C1 200 SPA; C2 404 | **ללא שינוי.** כתובות callback של OAuth ומיילים לאיפוס סיסמה תלויים בהן |
| `/dashboard`, `/dashboard/:slug`, `/settings`, `/settings/mcp`, `/sites`, `/sites/:siteId/*`, `/domains`, `/analytics/:slug`, `/ai-studio/genesis`, `/contracts/*` | `protectedRoutes.tsx` | C1 200 SPA (בדקתי את `/dashboard`); C2 404 | **ללא שינוי** |
| `/my-sites`, `/client/:siteId` | `clientRoutes.tsx` | C1 200 SPA | **ללא שינוי** |
| `/admin/*`, `/create`, `/create/ai`, `/create/ai-wizard` | `adminRoutes.tsx` | C1 200 SPA | **ללא שינוי** |
| `/sales/*` | `salesRoutes.tsx` | — | **ללא שינוי** |
| `/preview/:slug`, `/editor/:slug[/:pageSlug]` | `protectedRoutes.tsx`, ‏`miscRoutes.tsx` | — | **ללא שינוי** |
| `/sign/:token` (חתימה על חוזה) | `miscRoutes.tsx` | — | **ללא שינוי.** הקישורים כבר נשלחו ללקוחות במייל |
| `/s/:slug` (קישור קצר) | `miscRoutes.tsx` | C1/C2 200 SPA | **ללא שינוי** |
| `/services/:slug`, `/projects/:slug`, `/team/:slug`, `/blog/:slug`, `/faq/:slug` | `publicRoutes.tsx` (CMS ציבורי לאתרי לקוח בדומיין מותאם) | — | **ללא שינוי**, אבל **יש התנגשות עם `/services/{slug}/` של הסטודיו**. שאלה 2 |
| `/manifest.webmanifest`, `/sw.js`, `/workbox-*`, `/assets/*`, `/icons/*`, `/favicon.ico` | `vercel.json` | sw.js 200 | **ללא שינוי.** ראו סיכון ה-Service Worker בשאלה 7 |

### 5ג. אתרי לקוחות: **לא לגעת (DO NOT TOUCH)**

| כתובות | מקור | היום | גורל |
|---|---|---|---|
| **`/happy-djs-x2x7jf2z`**, אתר ה-DJ של הבעלים (הסלאג מופיע ב-`CLAUDE.md:15`), ‏`?mode=edit`, וכל תת-דף שלו | `/:slug` ← `SiteModeRouter` | C1 200 SPA; **C2 404** (‏serve-published-html) | **לא לגעת.** לא להפנות, לא לשנות כתובת. (ה-404 לבוטים תקין: העותק הזה נמחק ב-31.3. האתר החי הוא happy-djs.com, ראו סעיף 3) |
| `/{slug}` לכל אתר לקוח מפורסם | `/:slug` | C1 200 SPA; בוט ← serve-published-html | **לא לגעת** |
| `/{slug}/{pageSlug}`, `/{slug}/terms`, `/{slug}/privacy`, `/{slug}/accessibility-statement`, `/{slug}/blog`, `/{slug}/blog/{postSlug}` | `miscRoutes.tsx` | — | **לא לגעת** |
| דומיינים מותאמים של לקוחות (מגישים את ה-SPA ‏← `CustomDomainSite`) | `RootLayout.tsx:84-106` | — | **לא לגעת** |

---

## 6. סיכונים שעלו מהמיפוי

1. **התנגשות במרחב השמות `/:slug`.** כל נתיב עליון חדש של הסטודיו (`/work`, `/contact`, `/products`, `/services`) **לא נמצא** ב-`RESERVED_SLUGS`, כך שלקוח יכול היה לקבל אחד מהסלאגים האלה. אם האתר החדש ישב בשורש, כתובת כזו תיחטף ממנו. לא בדקתי ב-DB אם קיימים סלאגים כאלה, ראו שאלה 2.
2. **‏`/services/:slug` כבר תפוס** באפליקציה (‏CMS של אתרי לקוח בדומיין מותאם).
3. **Service Worker.** ‏`vite.config.ts` מגדיר `VitePWA` עם `registerType: 'prompt'` ו-`navigateFallback: '/index.html'`. מבקר שחזר ל-amdir.co.il עלול לקבל מה-SW השמור את מעטפת ה-SPA הישנה במקום דפי הסטודיו, עד שה-SW יוחלף. בהעברה צריך SW "מתאבד" או החרגה מתאימה.
4. **לוכסן בסוף.** הסטודיו בונה `/about/` (עם לוכסן), והאפליקציה עובדת בלי לוכסן. גם ההפניה האוטומטית מ-`/about` ל-`/about/` צריכה להתקיים בלי לשבור את `/{slug}` של לקוחות.
5. **‏apex מול www.** ‏apex מפנה ב-307 זמני, אבל כל ה-SEO מצביע על apex. כדאי לבחור קנוני אחד ולהפנות ב-301/308.
6. **ה-Edge שבייצור ישן.** ה-sitemap וה-robots בייצור לא תואמים את הקוד ב-main (סעיף 2). כל תכנון של sitemap מאוחד צריך להתחיל מפריסה מסודרת שלהם.

---

## 7. שאלות פתוחות לבעלים

1. **איפה יגור אתר הסטודיו?**
   - (א) בשורש של `amdir.co.il`, כשהאפליקציה עוברת ל-`app.amdir.co.il`. זה דורש העברה של כל `/{slug}` של לקוחות, ולכן **סותר את "לא לגעת"**.
   - (ב) בשורש של `amdir.co.il` ליד האפליקציה, עם ניתוב לפי נתיב. זה מסובך וחשוף להתנגשויות.
   - (ג) על דומיין או תת-דומיין נפרד, למשל `studio.amdir.co.il` או אחד מדומייני neryaangel. אז אפליקציית AMDIR נשארת כמו שהיא, ורק `/` (ואולי ‎/about, /demos‎) מקבלים 301 לשם.

   ההמלצה שלי: (ג). היא היחידה שמבטיחה שאתרי הלקוחות ו-happy-djs לא ייפגעו.
2. **סלאגים שמורים:** לאשר בדיקה (קריאה בלבד) ב-DB אם קיימים אתרים עם הסלאגים `work`, `contact`, `products`, `services`, `about`, `accessibility`. ולהוסיף אותם ל-`RESERVED_SLUGS` לפני ההעברה?
3. **דפים משפטיים:** האם `/terms`, ‏`/privacy` ו-`/accessibility-statement` של **הפלטפורמה** נשארים באפליקציה (ההמלצה), או שמוחלפים בדפי הסטודיו? אם מוחלפים, צריך נוסח משפטי שמכסה גם את משתמשי הבונה.
4. **‏`/pricing`:** ‏301 ל-`/contact/` או ל-`/`?
5. **בונה האתרים כמוצר:** האם `/templates` ו-`/demo/*` ממשיכים להיות שיווק פעיל, או שמפנים אותם ב-301 ל-`/products/` ול-`/work/`?
6. **sitemap:** להחליף את ה-sitemap ב-sitemap index (סטודיו + אתרי לקוחות), או להשאיר לכל אתר sitemap משלו?
7. **Service Worker:** לאשר תכנון של SW "מתאבד" לפני ההעברה, אם הסטודיו יתפוס נתיבים ב-amdir.co.il.
8. **דומייני neryaangel:**
   - ‏`neryaangel.com` ו-`.info` מגישים היום את אפליקציית AMDIR, וגם את ה-sitemap של amdir.co.il, מה שיוצר תוכן כפול. איזה אתר אמור לשבת עליהם?
   - ‏`neryaangel.online` מגיש אפליקציית Lovable, ו-`www.neryaangel.online` נשבר בגלל תעודה שפגה. להשאיר? להפנות?
9. **‏`amdir.site`:** הדומיין מחזיר DEPLOYMENT_NOT_FOUND, אבל ה-robots-txt משתמש בו כברירת מחדל. לחבר אותו, או להוציא אותו מהקוד?
10. **מיזוג התיקונים לפני הכל:** commits ‏ff18dab (בוטים מקבלים 404 על דפי האפליקציה) ו-06da7e2 (sitemap) לא נמצאים ב-main. למזג ולפרוס אותם. (ה-404 של `/happy-djs-x2x7jf2z` נבדק והוא תקין, ראו סעיף 3.)
11. **הדומיין הקנוני:** `amdir.co.il` או `www.amdir.co.il`? ולשנות את ה-307 ל-308 קבוע?
