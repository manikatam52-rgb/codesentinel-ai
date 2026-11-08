const API = '/api';

export interface AuthResult {
  token: string;
  user: { id: string; email: string; name: string };
  orgId: string;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem('cs_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string } }).error;
    if (res.status === 401) {
      localStorage.removeItem('cs_token');
    }
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? 'Request failed');
  }
  return data as T;
}

export const api = {
  register: (body: { email: string; password: string; name: string; orgName?: string }) =>
    request<AuthResult>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<AuthResult>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: (): Promise<any> => request('/auth/me'),
  saveGithubToken: (token: string | null) =>
    request('/auth/github-token', { method: 'PUT', body: JSON.stringify({ token }) }),
  githubRepos: () =>
    request<{ fullName: string; owner: string; name: string; defaultBranch: string; language: string | null }[]>('/github/repos'),
  createProject: (body: { name: string; repoOwner: string; repoName: string; defaultBranch?: string }) =>
    request('/projects', { method: 'POST', body: JSON.stringify(body) }),
  projects: () =>
    request<
      { id: string; name: string; repoOwner: string; repoName: string; defaultBranch: string; _count: { analyses: number; issues: number; reviews: number }; analyses: { qualityScore: number | null; status: string }[] }[]
    >('/projects'),
  project: (id: string): Promise<any> => request('/projects/' + id),
  runAnalysis: (projectId: string, body: { branch?: string } = {}) =>
    request(`/projects/${projectId}/analyses`, { method: 'POST', body: JSON.stringify(body) }),
  analyses: (projectId: string): Promise<any[]> => request(`/projects/${projectId}/analyses`),
  analysis: (projectId: string, analysisId: string): Promise<any> => request(`/projects/${projectId}/analyses/${analysisId}`),
  suggestions: (analysisId: string): Promise<{ suggestions: any[] }> => request(`/analyses/${analysisId}/suggestions`),
  pullRequests: (projectId: string) =>
    request<{ number: number; title: string; author: string; headSha: string }[]>(`/projects/${projectId}/pulls`),
  runReview: (projectId: string, prNumber: number) =>
    request(`/projects/${projectId}/reviews`, { method: 'POST', body: JSON.stringify({ prNumber }) }),
  reviews: (projectId: string): Promise<any[]> => request(`/projects/${projectId}/reviews`),
  review: (projectId: string, reviewId: string): Promise<any> => request(`/projects/${projectId}/reviews/${reviewId}`),
  issues: (projectId: string): Promise<IssueDto[]> => request(`/projects/${projectId}/issues`),
  createIssue: (projectId: string, body: object) =>
    request(`/projects/${projectId}/issues`, { method: 'POST', body: JSON.stringify(body) }),
  updateIssue: (projectId: string, issueId: string, body: object) =>
    request(`/projects/${projectId}/issues/${issueId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  analytics: (projectId: string): Promise<any> => request(`/projects/${projectId}/analytics`),
  overview: () =>
    request<{
      projects: { id: string; name: string; repoOwner: string; repoName: string; score: number | null }[];
      totals: { projects: number; openIssues: number; totalFindings: number; completedReviews: number; avgScore: number | null };
    }>('/overview'),
  testRuns: (projectId: string): Promise<any[]> => request(`/projects/${projectId}/test-runs`),
  health: (): Promise<any> => request('/health'),
};

export interface IssueDto {
  id: string;
  title: string;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  filePath: string | null;
  assignee?: { id: string; name: string } | null;
}
