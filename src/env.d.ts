interface ImportMetaEnv {
  readonly PUBLIC_SITE_URL?: string;
  readonly PUBLIC_SHOW_PLACEHOLDERS?: string;
  readonly PUBLIC_REVIEW_MODE?: string;
  readonly PUBLIC_BASE_PATH?: string;
  readonly PUBLIC_LEAD_ENDPOINT?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
