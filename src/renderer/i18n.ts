import type { Language } from '../common/types';

const messages = {
  tr: {
    title: 'Agent Usage', subtitle: 'Kota monitörü', actions: 'Uygulama eylemleri', refresh: 'Yenile', refreshing: 'Yenileniyor…', settings: 'Ayarlar', back: 'Geri', quit: 'Çıkış',
    overview: 'Kullanım', liveUsage: 'Canlı kullanım', lastSync: 'Güncellendi', sources: 'Kaynak', ready: 'Hazır', attention: 'Dikkat', all: 'Tümü', filter: 'Sağlayıcıları filtrele',
    remaining: 'kaldı', used: 'kullanıldı', usageUnknown: 'Kullanım bilinmiyor', reset: 'Sıfırlanma', updated: 'Güncellendi', balance: 'Bakiye', providerFallback: 'Kota sağlayıcısı',
    ok: 'Hazır', loading: 'Yükleniyor', unconfigured: 'Kurulum gerekli', stale: 'Eski veri', error: 'Hata',
    nothingHere: 'Bu görünüm boş', changeFilter: 'Diğer sağlayıcıları görmek için filtreyi değiştirin.', showAll: 'Tümünü göster',
    noProviders: 'Etkin sağlayıcı yok', noProvidersHint: 'Kullanmak istediğiniz sağlayıcıları Ayarlar’dan etkinleştirin.', openSettings: 'Ayarları aç',
    welcome: 'Kota takibini ayarlayın', intro: 'Yalnızca seçtiğiniz yerel sağlayıcılar sorgulanır. İzinleri ve otomatik başlangıcı istediğiniz zaman değiştirebilirsiniz.',
    zaiConsent: 'Z.ai kimlik bilgisini oku', zaiConsentHint: 'Yerel kimlik dosyası yalnız kota isteği için kullanılır.', autostart: 'Oturum açınca başlat', autostartHint: 'Agent Usage menü çubuğunda sessizce hazır olur.', continue: 'Devam et',
    preferences: 'Tercihler', settingsHint: 'Kaynakları, izinleri ve uygulama davranışını yönetin.', general: 'Genel', privacy: 'Gizlilik', advanced: 'Gelişmiş', saveChanges: 'Değişiklikleri kaydet',
    language: 'Dil', languageHint: 'Arayüz dili', system: 'Sistem', turkish: 'Türkçe', english: 'English', codexPath: 'Codex yolu', agyPath: 'Agy yolu', claudePath: 'Claude Code yolu', geminiPath: 'Gemini CLI yolu', qwenPath: 'Qwen Code yolu', opencodePath: 'OpenCode yolu', cursorPath: 'Cursor CLI yolu', copilotPath: 'GitHub Copilot CLI yolu', providers: 'Sağlayıcılar', providerHint: 'Yalnızca kullandıklarınızı açık bırakın. Kapalı kaynaklar sorgulanmaz.',
    saved: 'Kaydedildi', never: 'Bilinmiyor', noData: 'Kota bilgisi yok', quotaUnavailable: 'Kalan kota sunulmuyor', executableHint: 'Özel CLI yolları; boşsa sistem PATH’i kullanılır.',
  },
  en: {
    title: 'Agent Usage', subtitle: 'Quota monitor', actions: 'Application actions', refresh: 'Refresh', refreshing: 'Refreshing…', settings: 'Settings', back: 'Back', quit: 'Quit',
    overview: 'Usage', liveUsage: 'Live usage', lastSync: 'Updated', sources: 'Sources', ready: 'Ready', attention: 'Attention', all: 'All', filter: 'Filter providers',
    remaining: 'left', used: 'used', usageUnknown: 'Usage unknown', reset: 'Reset', updated: 'Updated', balance: 'Balance', providerFallback: 'Quota provider',
    ok: 'Ready', loading: 'Loading', unconfigured: 'Setup needed', stale: 'Stale data', error: 'Error',
    nothingHere: 'Nothing in this view', changeFilter: 'Change the filter to see other providers.', showAll: 'Show all',
    noProviders: 'No active providers', noProvidersHint: 'Enable the providers you use in Settings.', openSettings: 'Open settings',
    welcome: 'Set up quota tracking', intro: 'Only the local providers you select are queried. You can change permissions and startup behavior at any time.',
    zaiConsent: 'Read Z.ai credentials', zaiConsentHint: 'The local credential file is used only for quota requests.', autostart: 'Start at login', autostartHint: 'Agent Usage stays ready in the menu bar.', continue: 'Continue',
    preferences: 'Preferences', settingsHint: 'Manage sources, permissions, and application behavior.', general: 'General', privacy: 'Privacy', advanced: 'Advanced', saveChanges: 'Save changes',
    language: 'Language', languageHint: 'Interface language', system: 'System', turkish: 'Türkçe', english: 'English', codexPath: 'Codex path', agyPath: 'Agy path', claudePath: 'Claude Code path', geminiPath: 'Gemini CLI path', qwenPath: 'Qwen Code path', opencodePath: 'OpenCode path', cursorPath: 'Cursor CLI path', copilotPath: 'GitHub Copilot CLI path', providers: 'Providers', providerHint: 'Keep only the providers you use enabled. Disabled sources are not queried.',
    saved: 'Saved', never: 'Unknown', noData: 'No quota information', quotaUnavailable: 'Remaining quota unavailable', executableHint: 'Custom CLI paths; the system PATH is used when empty.',
  },
} as const;

export type MessageKey = keyof typeof messages.tr;
export function resolvedLanguage(language: Language): 'tr' | 'en' {
  if (language !== 'system') return language;
  return navigator.language.toLowerCase().startsWith('tr') ? 'tr' : 'en';
}
export function translator(language: Language) { const selected = messages[resolvedLanguage(language)]; return (key: MessageKey) => selected[key]; }
