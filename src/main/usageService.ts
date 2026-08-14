import { EventEmitter } from 'node:events';
import type { ProviderAdapter, ProviderSnapshot, UsagePayload } from '../common/types';
import type { Storage } from './storage';

export class UsageService extends EventEmitter {
  private snapshots: ProviderSnapshot[] = [];
  private refreshing = false;
  private activeRefresh?: Promise<UsagePayload>;
  constructor(
    private readonly adapters: ProviderAdapter[],
    private readonly storage: Storage,
    private readonly timeoutMs = 15_000,
    private readonly now: () => Date = () => new Date(),
    private readonly isEnabled: (providerId: string) => boolean = () => true,
  ) { super(); }

  async initialize(): Promise<void> { this.snapshots = (await this.storage.readSnapshots()).filter((item) => this.isEnabled(item.providerId)); }
  get(): UsagePayload { return { snapshots: this.snapshots.filter((item) => this.isEnabled(item.providerId)), refreshing: this.refreshing }; }

  refresh(): Promise<UsagePayload> {
    if (this.activeRefresh) return this.activeRefresh;
    this.activeRefresh = this.doRefresh().finally(() => { this.activeRefresh = undefined; });
    return this.activeRefresh;
  }

  refreshAfterCurrent(): Promise<UsagePayload> {
    const active = this.activeRefresh;
    return active ? active.then(() => this.refresh(), () => this.refresh()) : this.refresh();
  }

  private async doRefresh(): Promise<UsagePayload> {
    this.refreshing = true;
    this.emitChanged();
    const previous = new Map(this.snapshots.map((item) => [item.providerId, item]));
    const enabledAdapters = this.adapters.filter((adapter) => this.isEnabled(adapter.id));
    const results = await Promise.all(enabledAdapters.map(async (adapter): Promise<ProviderSnapshot> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        return await adapter.fetch(controller.signal);
      } catch (error) {
        const old = previous.get(adapter.id);
        const message = error instanceof Error ? error.message : 'Sağlayıcı hatası.';
        if (old?.status === 'ok' || old?.status === 'stale') {
          return { ...old, status: 'stale', staleSince: old.staleSince ?? this.now().toISOString(), error: message };
        }
        return { providerId: adapter.id, displayName: adapter.displayName, status: 'error', fetchedAt: this.now().toISOString(), error: message };
      } finally {
        clearTimeout(timer);
      }
    }));
    this.snapshots = results.filter((item) => this.isEnabled(item.providerId));
    this.refreshing = false;
    this.emitChanged();
    try {
      await this.storage.writeSnapshots(this.snapshots);
    } catch {
      // Fresh in-memory data remains usable when the best-effort cache cannot be persisted.
    }
    return this.get();
  }

  private emitChanged() { this.emit('changed', this.get()); }
}
