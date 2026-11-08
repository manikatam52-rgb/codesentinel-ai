/**
 * Minimal typed GitHub REST client. Uses Octokit-style endpoints but keeps
 * dependencies light and injectable (token per user, fallback to env token).
 */

const GITHUB_API = 'https://api.github.com';

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  owner: { login: string };
  default_branch: string;
  private: boolean;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
}

export interface GitHubPullRequest {
  number: number;
  title: string;
  user: { login: string } | null;
  head: { sha: string };
  base: { sha: string };
  html_url: string;
  state: string;
}

export interface GitHubFile {
  path: string;
  sha: string;
  size: number;
  type?: string;
  content?: string; // base64, only when fetching single blob
  encoding?: string;
}

export class GitHubError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export class GitHubClient {
  constructor(private token?: string | null) { }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'codesentinel-ai',
      ...(init.headers as Record<string, string> | undefined),
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    const res = await fetch(`${GITHUB_API}${path}`, { ...init, headers });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new GitHubError(res.status, `GitHub API error ${res.status}: ${body.slice(0, 500)}`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listUserRepos(): Promise<GitHubRepo[]> {
    return this.request<GitHubRepo[]>('/user/repos?per_page=100&sort=updated');
  }

  getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${owner}/${repo}`);
  }

  listPullRequests(owner: string, repo: string, state = 'open'): Promise<GitHubPullRequest[]> {
    return this.request<GitHubPullRequest[]>(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=50`);
  }

  getPullRequest(owner: string, repo: string, number: number): Promise<GitHubPullRequest> {
    return this.request<GitHubPullRequest>(`/repos/${owner}/${repo}/pulls/${number}`);
  }

  listPullRequestFiles(owner: string, repo: string, number: number): Promise<GitHubFile[]> {
    return this.request<GitHubFile[]>(`/repos/${owner}/${repo}/pulls/${number}/files?per_page=100`);
  }

  async getRepoTree(owner: string, repo: string, branch: string): Promise<GitHubFile[]> {
    const branchInfo = await this.request<{ commit: { commit: { tree: { sha: string } } } }>(
      `/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
    );
    const tree = await this.request<{ tree: GitHubFile[]; truncated: boolean }>(
      `/repos/${owner}/${repo}/git/trees/${branchInfo.commit.commit.tree.sha}?recursive=1`,
    );
    return tree.tree.filter((f) => f.type === 'blob');
  }

  async getFileContent(owner: string, repo: string, path: string, ref?: string): Promise<string | null> {
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
    const file = await this.request<{ content?: string; encoding?: string; size: number }>(
      `/repos/${owner}/${repo}/contents/${path}${query}`,
    );
    if (!file.content || file.encoding !== 'base64' || file.size > 512 * 1024) return null;
    return Buffer.from(file.content, 'base64').toString('utf8');
  }

  createIssueComment(owner: string, repo: string, number: number, body: string): Promise<{ id: number }> {
    return this.request(`/repos/${owner}/${repo}/issues/${number}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    });
  }

  createReview(owner: string, repo: string, number: number, body: string): Promise<{ id: number }> {
    return this.request(`/repos/${owner}/${repo}/pulls/${number}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'COMMENT', body }),
    });
  }
}
