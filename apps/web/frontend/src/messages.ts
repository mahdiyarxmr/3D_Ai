import commonEn from '../../../../locales/en/common.json';
import commonJa from '../../../../locales/ja/common.json';
import commonFa from '../../../../locales/fa/common.json';
import webEn from '../../../../locales/en/web.json';
import webJa from '../../../../locales/ja/web.json';
import webFa from '../../../../locales/fa/web.json';
import type { Locale } from './i18n';

/**
 * Locale bundles for LunaAI Web.
 *
 * The JSON files live in the shared `/locales` directory at the repository root
 * so that both products use the same terminology (see docs/LOCALIZATION.md).
 * Each product only ships its own namespaces: `web.*` here, `pc.*` for LunaAI PC.
 */
export const bundles: Record<Locale, Record<string, string>> = {
  en: { ...commonEn, ...webEn },
  ja: { ...commonJa, ...webJa },
  fa: { ...commonFa, ...webFa },
};
