import type { RendererApi } from '../common/types';

declare global { interface Window { agentUsage: RendererApi; } }
export {};
