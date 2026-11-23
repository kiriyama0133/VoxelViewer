import { type Language, type LanguageSetting, languages } from './config'
import enCommon from './locales/en/common.json'
import enMenu from './locales/en/menu.json'
import frCommon from './locales/fr/common.json'
import frMenu from './locales/fr/menu.json'
import zhCommon from './locales/zh/common.json'
import zhMenu from './locales/zh/menu.json'

// Translations are shared: the renderer uses `common`, the main process uses `menu` for the
// native menu. English is the source of truth for keys and types.
export const resources = {
  en: { common: enCommon, menu: enMenu },
  fr: { common: frCommon, menu: frMenu },
  zh: { common: zhCommon, menu: zhMenu }
} satisfies Record<Language, Record<string, unknown>>

export const defaultLanguage: Language = 'en'

/** Resolves the `system` setting with the OS locale (e.g. `zh-CN` -> `zh`, `fr-FR` -> `fr`). */
export function resolveLanguage(setting: LanguageSetting, systemLocale: string): Language {
  if (setting !== 'system') return setting
  const base = systemLocale.split('-')[0]
  return languages.find((language) => language === base) ?? defaultLanguage
}
