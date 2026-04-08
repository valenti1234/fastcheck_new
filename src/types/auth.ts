export interface User {
  id: string;
  email: string;
  name: string;
  role: 'superuser' | 'tenant_admin' | 'evaluator' | 'read_only' | 'write_only';
  defaultTenantId: string;
  tenants: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  email: string;
  password: string;
  name: string;
  companyName: string; // Used to create the initial tenant
}