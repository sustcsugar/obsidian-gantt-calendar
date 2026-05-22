import en from './locales/en.json';
import zh from './locales/zh.json';

type TranslationMap = Record<string, unknown>;

const LOCALES: Record<string, TranslationMap> = { en, zh };
let currentLocale: TranslationMap = en;
let isInitialized = false;

function getObsidianLanguage(): string {
	return localStorage.getItem('language') || 'en';
}

function resolve(obj: TranslationMap, path: string): unknown {
	const keys = path.split('.');
	let current: unknown = obj;
	for (const key of keys) {
		if (current == null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function interpolate(template: string, params?: Record<string, unknown>): string {
	if (!params) return template;
	return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
		params[key] != null ? String(params[key]) : `{{${key}}}`
	);
}

export async function initializeI18n(): Promise<void> {
	if (isInitialized) return;
	const lang = getObsidianLanguage();
	currentLocale = LOCALES[lang] || LOCALES['en'] || en;
	isInitialized = true;
}

function translate(key: string, params?: Record<string, unknown>): string {
	// Before initialization: use en as default
	const locale = isInitialized ? currentLocale : en;
	let value = resolve(locale, key);
	// Fallback to en if not found in current locale
	if (value == null && locale !== en) {
		value = resolve(en, key);
	}
	if (typeof value === 'string') {
		return interpolate(value, params);
	}
	if (Array.isArray(value)) {
		return value as unknown as string;
	}
	return key;
}

export const i18n = { t: translate };
