import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enCommon from "./locales/en/common.json";
import enPages from "./locales/en/pages.json";
import enConnection from "./locales/en/connection.json";
import enConfig from "./locales/en/config.json";
import enSetup from "./locales/en/setup.json";
import enMonitor from "./locales/en/monitor.json";
import enHelp from "./locales/en/help.json";
import enMessages from "./locales/en/messages.json";

import itPages from "./locales/it/pages.json";

import zhTWCommon from "./locales/zh-TW/common.json";
import zhTWPages from "./locales/zh-TW/pages.json";
import zhTWConnection from "./locales/zh-TW/connection.json";
import zhTWConfig from "./locales/zh-TW/config.json";
import zhTWSetup from "./locales/zh-TW/setup.json";
import zhTWMonitor from "./locales/zh-TW/monitor.json";
import zhTWHelp from "./locales/zh-TW/help.json";
import zhTWMessages from "./locales/zh-TW/messages.json";

export const resources = {
  en: {
    common: enCommon,
    pages: enPages,
    connection: enConnection,
    config: enConfig,
    setup: enSetup,
    monitor: enMonitor,
    help: enHelp,
    messages: enMessages,
  },
  it: {
    pages: itPages,
  },
  "zh-TW": {
    common: zhTWCommon,
    pages: zhTWPages,
    connection: zhTWConnection,
    config: zhTWConfig,
    setup: zhTWSetup,
    monitor: zhTWMonitor,
    help: zhTWHelp,
    messages: zhTWMessages,
  },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "it", "zh-TW"],
    defaultNS: "pages",
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "itaiko-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
