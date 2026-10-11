/**
 * The app's text in English and Afrikaans, from src/locales/en.json and af.json.
 *
 * Keys are dotted paths, e.g. t('tabs.trips'). Text can include values, e.g.
 * t('fuel.kmFrom', { km: 85, place: 'Palapye' }) for "{{km}} km from {{place}}", and
 * counts, with "one" and "other" forms: t('trips.days', { count: 3 }).
 */
import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';

import af from '@/locales/af.json';
import en from '@/locales/en.json';
import { storage } from '@/lib/storage';

export type Language = 'en' | 'af';
/** What the user chose: a language, or whatever the phone is set to. */
export type LanguageSetting = Language | 'system';
export type Params = Record<string, string | number>;
export type Translate = (key: string, params?: Params) => string;

type Dictionary = { [key: string]: string | Dictionary };
const dictionaries: Record<Language, Dictionary> = { en, af };

const SETTING_KEY = 'spoor.language.v1';

function phoneLanguage(): Language {
  try {
    return getLocales()[0]?.languageCode === 'af' ? 'af' : 'en';
  } catch {
    return 'en';
  }
}

function readSetting(): LanguageSetting {
  try {
    const saved = storage.getItem(SETTING_KEY);
    return saved === 'en' || saved === 'af' ? saved : 'system';
  } catch {
    return 'system';
  }
}

let setting: LanguageSetting = readSetting();
let language: Language = setting === 'system' ? phoneLanguage() : setting;
const listeners = new Set<() => void>();

function lookup(dictionary: Dictionary, key: string): string | Dictionary | undefined {
  let value: string | Dictionary | undefined = dictionary;
  for (const part of key.split('.')) {
    if (typeof value !== 'object') return undefined;
    value = value[part];
  }
  return value;
}

/** The text for a key in a language, falling back to English, then to the key itself. */
export function translate(lang: Language, key: string, params?: Params): string {
  let value = lookup(dictionaries[lang], key) ?? lookup(dictionaries.en, key);
  if (value && typeof value === 'object' && typeof params?.count === 'number') {
    value = params.count === 1 ? value.one : value.other;
  }
  if (typeof value !== 'string') return key;
  return params ? value.replace(/\{\{(\w+)\}\}/g, (match, name: string) => (name in params ? String(params[name]) : match)) : value;
}

/** One translator per language, so screens see a new one (and redraw) when the language changes. */
const translators: Record<Language, Translate> = {
  en: (key, params) => translate('en', key, params),
  af: (key, params) => translate('af', key, params),
};

/** Text in the current language, for code outside screens (e.g. error messages). */
export const t: Translate = (key, params) => translate(language, key, params);

export function currentLanguage(): Language {
  return language;
}

/** For dates: Afrikaans, or the phone's own format in English. */
export function dateLocale(lang: Language = language): string | undefined {
  return lang === 'af' ? 'af-ZA' : undefined;
}

export function languageSetting(): LanguageSetting {
  return setting;
}

export function setLanguageSetting(next: LanguageSetting) {
  setting = next;
  language = next === 'system' ? phoneLanguage() : next;
  try {
    if (next === 'system') storage.removeItem(SETTING_KEY);
    else storage.setItem(SETTING_KEY, next);
  } catch {
    // Not saved, but still used until the app closes.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The current language; redraws the screen when it changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(subscribe, () => language, () => language);
}

/** The translator for screens, e.g. t('tabs.trips'). Changes when the language does, so text updates. */
export function useT(): Translate {
  return translators[useLanguage()];
}

/** The language setting (English, Afrikaans or the phone's), for the Me tab. */
export function useLanguageSetting(): LanguageSetting {
  useLanguage();
  return setting;
}
