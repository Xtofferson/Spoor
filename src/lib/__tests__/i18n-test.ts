// Reads the source files, so it needs Node’s types (installed with Jest).
/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

import af from '@/locales/af.json';
import en from '@/locales/en.json';

import { stretchAdvice, type FuelStretch, type Vehicle } from '../fuel';
import { translate, type Translate } from '../i18n';
import { formatDays, waterAdvice, type WaterStretch } from '../water';

type Dictionary = { [key: string]: string | Dictionary };

/** Every key in a dictionary, with the text (or plural forms) it leads to. */
function entries(dictionary: Dictionary, prefix = ''): [string, string][] {
  return Object.entries(dictionary).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value] as [string, string]] : entries(value, `${prefix}${key}.`)
  );
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();

const afrikaans: Translate = (key, params) => translate('af', key, params);
const english: Translate = (key, params) => translate('en', key, params);

describe('English and Afrikaans text', () => {
  const enEntries = new Map(entries(en));
  const afEntries = new Map(entries(af));

  it('has the same keys in en.json and af.json', () => {
    expect([...afEntries.keys()].sort()).toEqual([...enEntries.keys()].sort());
  });

  it('uses the same {{values}} in both languages', () => {
    for (const [key, text] of enEntries) {
      expect([key, placeholders(afEntries.get(key) ?? '')]).toEqual([key, placeholders(text)]);
    }
  });

  it('has text for every key the app uses', () => {
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== '__tests__') walk(path);
        } else if (/\.tsx?$/.test(name)) {
          for (const match of readFileSync(path, 'utf8').matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(match[1]);
        }
      }
    };
    walk(join(__dirname, '..', '..'));
    // Plural keys hold "one" and "other" forms.
    const missing = [...used].filter((key) => !enEntries.has(key) && !enEntries.has(`${key}.other`));
    expect(missing).toEqual([]);
  });
});

describe('translate', () => {
  it('fills in values and picks the singular or plural form', () => {
    expect(english('trips.days', { count: 1 })).toBe('1 day');
    expect(english('trips.days', { count: 3 })).toBe('3 days');
    expect(afrikaans('trips.days', { count: 3 })).toBe('3 dae');
    expect(afrikaans('fuel.kmFrom', { km: 85, place: 'Palapye' })).toBe('85 km van Palapye');
  });

  it('falls back to English, then to the key', () => {
    expect(translate('af', 'no.such.key')).toBe('no.such.key');
  });

  it('gives fuel and water advice in Afrikaans', () => {
    const vehicle: Vehicle = {
      name: 'Land Cruiser 79',
      mainTankLitres: 130,
      jerryCanLitres: 40,
      consumption: { tar: 13, gravel: 15, sand: 19 },
      updatedAt: 1,
    };
    const tight = { from: 'Letlhakane', to: 'Nata', shareOfRange: 0.86, litres: 117, status: 'tight' } as FuelStretch;
    expect(stretchAdvice(tight, vehicle, afrikaans)).toBe(
      'Gebruik 86% van die reikafstand — maak die kanne vol by Letlhakane.'
    );

    const short = { from: 'A', status: 'short', litresNeeded: 45, days: 3 } as WaterStretch;
    expect(formatDays(0.4, afrikaans)).toBe('½ dag');
    expect(waterAdvice(short, { people: 3, waterLitres: 40 }, false, afrikaans)).toBe(
      'Het omtrent 45 L water nodig vir 3 mense oor 3 dae; jy dra 40 L. Maak vol by A en dra meer.'
    );
  });
});
