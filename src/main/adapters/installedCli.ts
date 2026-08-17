import type { ExecutableId, ProviderAdapter, ProviderId, ProviderSnapshot } from '../../common/types';
import { resolveExecutable } from '../executableResolver';

interface InstalledCliOptions {
  id: Extract<ProviderId, 'gemini-cli' | 'qwen-code' | 'opencode' | 'cursor-cli' | 'github-copilot'>;
  displayName: string;
  executableId: Extract<ExecutableId, 'gemini' | 'qwen' | 'opencode' | 'cursor-agent' | 'copilot'>;
  executableOverride?: string | (() => string | undefined);
  resolve?: typeof resolveExecutable;
  now?: () => Date;
}

export class InstalledCliAdapter implements ProviderAdapter {
  readonly id: InstalledCliOptions['id'];
  readonly displayName: string;

  constructor(private readonly options: InstalledCliOptions) {
    this.id = options.id;
    this.displayName = options.displayName;
  }

  private resolve() {
    const override = typeof this.options.executableOverride === 'function'
      ? this.options.executableOverride()
      : this.options.executableOverride;
    return (this.options.resolve ?? resolveExecutable)(this.options.executableId, override);
  }

  async detect(): Promise<boolean> { return Boolean(await this.resolve()); }

  async fetch(_signal: AbortSignal): Promise<ProviderSnapshot> {
    if (!await this.resolve()) return this.snapshot('unconfigured', `${this.displayName} çalıştırılabilir dosyası bulunamadı.`);
    return {
      providerId: this.id,
      displayName: this.displayName,
      status: 'ok',
      fetchedAt: this.now(),
      plan: 'CLI',
      usageUnavailable: true,
    };
  }

  private now() { return (this.options.now?.() ?? new Date()).toISOString(); }

  private snapshot(status: ProviderSnapshot['status'], error: string, plan?: string): ProviderSnapshot {
    return { providerId: this.id, displayName: this.displayName, status, fetchedAt: this.now(), plan, error };
  }
}
