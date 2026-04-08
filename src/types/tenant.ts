export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'basic' | 'premium' | 'enterprise';
  status: 'active' | 'suspended' | 'cancelled';
  createdAt: string;
  usageStats: {
    evaluationsTotal: number;
    evaluationsRemaining: number;
    lastEvaluationDate: string | null;
  };
}

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: 'tenant_admin' | 'evaluator';
  status: 'active' | 'invited' | 'suspended';
  createdAt: string;
  lastLogin: string | null;
}