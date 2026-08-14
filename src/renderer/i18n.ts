import type { Language } from '../common/types';

const messages = {
  tr: {
    title: 'Agent Usage', subtitle: 'Kota monitörü', refresh: 'Yenile', refreshing: 'Yenileniyor…', settings: 'Ayarlar', back: 'Geri', quit: 'Çıkış',
    remaining: 'kaldı', used: 'kullanıldı', reset: 'Sıfırlanma', updated: 'Güncellendi', balance: 'Bakiye',
    ok: 'Hazır', loading: 'Yükleniyor', unconfigured: 'Yapılandırılmadı', stale: 'Eski veri', error: 'Hata',
    welcome: 'Başlayalım', intro: 'Kurulu sağlayıcılar algılanır. Z.ai kimlik dosyası yalnız açık izninizle okunur.',
    zaiConsent: 'Z.ai Coding Plan kimlik bilgisini oku', autostart: 'Oturum açınca başlat', continue: 'Devam et',
    language: 'Dil', system: 'Sistem', turkish: 'Türkçe', english: 'English', codexPath: 'Codex yolu', agyPath: 'Agy yolu', claudePath: 'Claude Code yolu', providers: 'Sağlayıcılar', providerHint: 'Yalnız kullandığınız sağlayıcıları açık bırakın. Kapalı sağlayıcılar sorgulanmaz ve menüde gösterilmez. Claude Code açıldığında yerel OAuth oturumu yalnız kota okumak için kullanılır.',
    saved: 'Kaydedildi', never: 'Bilinmiyor', noData: 'Kota bilgisi yok', executableHint: 'Boş bırakılırsa PATH kullanılır.',
  },
  en: {
    title: 'Agent Usage', subtitle: 'Quota monitor', refresh: 'Refresh', refreshing: 'Refreshing…', settings: 'Settings', back: 'Back', quit: 'Quit',
    remaining: 'remaining', used: 'used', reset: 'Reset', updated: 'Updated', balance: 'Balance',
    ok: 'Ready', loading: 'Loading', unconfigured: 'Not configured', stale: 'Stale data', error: 'Error',
    welcome: 'Welcome', intro: 'Installed providers are detected. Z.ai credentials are read only with your explicit permission.',
    zaiConsent: 'Read Z.ai Coding Plan credentials', autostart: 'Start at login', continue: 'Continue',
    language: 'Language', system: 'System', turkish: 'Türkçe', english: 'English', codexPath: 'Codex path', agyPath: 'Agy path', claudePath: 'Claude Code path', providers: 'Providers', providerHint: 'Keep only the providers you use enabled. Disabled providers are not queried or shown in the menu. When Claude Code is enabled, its local OAuth session is used only to read quota data.',
    saved: 'Saved', never: 'Unknown', noData: 'No quota information', executableHint: 'Leave blank to use PATH.',
  },
} as const;

export type MessageKey = keyof typeof messages.tr;
export function resolvedLanguage(language: Language): 'tr' | 'en' {
  if (language !== 'system') return language;
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
export function translator(language: Language) { const selected = messages[resolvedLanguage(language)]; return (key: MessageKey) => selected[key]; }
