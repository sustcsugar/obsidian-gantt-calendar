import en from './locales/en.json';
import zh from './locales/zh.json';

type TranslationMap = Record<string, unknown>;

const LOCALES: Record<string, TranslationMap> = { en, zh };
let currentLocale: TranslationMap = en;
let isInitialized = false;
let languageOverride: string | null = null;

function getObsidianLanguage(): string {
	try {
		return localStorage.getItem('language') || 'en';
	} catch {
		return 'en';
	}
}

function resolveEffectiveLanguage(): string {
	if (languageOverride && languageOverride !== 'system') {
		return languageOverride;
	}
	return getObsidianLanguage();
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

export async function initializeI18n(language?: string): Promise<void> {
	if (language) {
		languageOverride = language;
	}
	const lang = resolveEffectiveLanguage();
	currentLocale = LOCALES[lang] || LOCALES['en'] || en;
	isInitialized = true;
}

export function setLanguage(language: string): void {
	languageOverride = language;
	const lang = resolveEffectiveLanguage();
	currentLocale = LOCALES[lang] || LOCALES['en'] || en;
}

export function isChineseLanguage(): boolean {
	const lang = resolveEffectiveLanguage();
	return lang === 'zh';
}

function translate(key: string, params?: Record<string, unknown>): string {
	const locale = isInitialized ? currentLocale : (LOCALES[getObsidianLanguage()] || en);
	let value = resolve(locale, key);
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
