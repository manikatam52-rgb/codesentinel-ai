/** Programmatic OpenAPI 3.0 spec — served at /api/docs.json and rendered by Swagger UI. */
export function buildSpec() {
  return {
    openapi: '3.0.3',
    info: {
      title: 'CodeSentinel AI API',
      version: '1.0.0',
      description:
        'AI-powered code quality and engineering platform. Analyze GitHub repositories, automate PR reviews, track issues and view developer analytics.',
      license: { name: 'MIT' },
    },
    servers: [{ url: '/', description: 'Current host' }],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} } } },
        },
        AuthResult: {
          type: 'object',
          properties: { token: { type: 'string' }, user: { type: 'object', properties: { id: { type: 'string' }, email: { type: 'string' }, name: { type: 'string' } } }, orgId: { type: 'string' } },
        },
        Finding: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            filePath: { type: 'string' },
            line: { type: 'integer' },
            ruleId: { type: 'string', example: 'SEC-001' },
            title: { type: 'string' },
            severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
            category: { type: 'string', enum: ['bug', 'security', 'quality'] },
            suggestion: { type: 'string' },
          },
        },
        Analysis: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            projectId: { type: 'string' },
            commitSha: { type: 'string' },
            branch: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED'] },
            qualityScore: { type: 'number', nullable: true },
          },
        },
        Issue: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED'] },
            severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
          },
        },
      },
    },
    paths: {
      '/api/health': {
        get: { tags: ['System'], summary: 'Health check (verifies DB connectivity)', responses: { 200: { description: 'OK' }, 503: { description: 'Degraded' } } },
      },
      '/api/auth/register': {
        post: {
          tags: ['Auth'],
          summary: 'Create an account and personal organization',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password', 'name'],
                  properties: {
                    email: { type: 'string', format: 'email' },
                    password: { type: 'string', minLength: 8 },
                    name: { type: 'string' },
                    orgName: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } } }, 409: { description: 'Email already registered' } },
        },
      },
      '/api/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Log in with email + password',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', required: ['email', 'password'], properties: { email: { type: 'string' }, password: { type: 'string' } } } } },
          },
          responses: { 200: { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResult' } } } }, 401: { description: 'Invalid credentials' } },
        },
      },
      '/api/auth/me': {
        get: { tags: ['Auth'], summary: 'Current user profile', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' }, 401: { description: 'Unauthorized' } } },
      },
      '/api/auth/github-token': {
        put: { tags: ['Auth'], summary: 'Store/replace the GitHub personal access token (encrypted at rest)', security: [{ bearerAuth: [] }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { token: { type: 'string' } } } } } }, responses: { 200: { description: 'OK' } } },
      },
      '/api/projects': {
        get: { tags: ['Projects'], summary: 'List projects in your organizations', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
        post: {
          tags: ['Projects'],
          summary: 'Create a project from a GitHub repository (repo must be accessible)',
          security: [{ bearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name', 'repoOwner', 'repoName'], properties: { name: { type: 'string' }, repoOwner: { type: 'string' }, repoName: { type: 'string' }, defaultBranch: { type: 'string', default: 'main' } } },
              },
            },
          },
          responses: { 201: { description: 'Created' }, 400: { description: 'Repo not accessible' } },
        },
      },
      '/api/projects/{projectId}': {
        get: { tags: ['Projects'], summary: 'Project detail with recent analyses, reviews and issues', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' }, 404: { description: 'Not found' } } },
      },
      '/api/projects/{projectId}/analyses': {
        post: { tags: ['Analysis'], summary: 'Run a repository analysis (async)', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { branch: { type: 'string' }, commitSha: { type: 'string' } } } } } }, responses: { 202: { description: 'Accepted' } } },
        get: { tags: ['Analysis'], summary: 'List analyses', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/analyses/{analysisId}': {
        get: { tags: ['Analysis'], summary: 'Analysis detail with all findings', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/analyses/{analysisId}/suggestions': {
        get: { tags: ['Analysis'], summary: 'AI-powered improvement suggestions for an analysis', security: [{ bearerAuth: [] }], parameters: [{ name: 'analysisId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/reviews': {
        post: { tags: ['Reviews'], summary: 'Run an automated AI review on a pull request', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['prNumber'], properties: { prNumber: { type: 'integer' } } } } } }, responses: { 202: { description: 'Accepted' } } },
        get: { tags: ['Reviews'], summary: 'List PR reviews', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/issues': {
        post: { tags: ['Issues'], summary: 'Create an issue', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Issue' } } } }, responses: { 201: { description: 'Created' } } },
        get: { tags: ['Issues'], summary: 'List issues (filter by status/severity)', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'status', in: 'query', schema: { type: 'string' } }, { name: 'severity', in: 'query', schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/issues/{issueId}': {
        patch: { tags: ['Issues'], summary: 'Update issue status/severity/assignee', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'issueId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
        delete: { tags: ['Issues'], summary: 'Delete an issue (ADMIN+)', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }, { name: 'issueId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 204: { description: 'Deleted' } } },
      },
      '/api/projects/{projectId}/analytics': {
        get: { tags: ['Analytics'], summary: 'Project analytics: score trend, severity mix, top files/rules', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/overview': {
        get: { tags: ['Analytics'], summary: 'Org-wide dashboard overview', security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      },
      '/api/github/repos': {
        get: { tags: ['GitHub'], summary: "List the authenticated user's GitHub repositories", security: [{ bearerAuth: [] }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/pulls': {
        get: { tags: ['GitHub'], summary: 'List open pull requests for a project', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/projects/{projectId}/test-runs': {
        get: { tags: ['Tests'], summary: 'List automated test runs', security: [{ bearerAuth: [] }], parameters: [{ name: 'projectId', in: 'path', required: true, schema: { type: 'string' } }], responses: { 200: { description: 'OK' } } },
      },
      '/api/webhooks/github': {
        post: { tags: ['GitHub'], summary: 'GitHub webhook receiver (pull_request events trigger automated reviews)', responses: { 202: { description: 'Accepted' }, 401: { description: 'Invalid signature' } } },
      },
    },
  };
}
