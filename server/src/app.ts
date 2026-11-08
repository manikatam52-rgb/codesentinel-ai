import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './modules/auth/routes';
import { projectRouter } from './modules/projects/routes';
import { githubRouter } from './modules/github/routes';
import { analysisRouter } from './modules/analysis/routes';
import { suggestionRouter } from './modules/analysis/suggestions.routes';
import { reviewRouter } from './modules/reviews/routes';
import { issueRouter } from './modules/issues/routes';
import { analyticsRouter } from './modules/analytics/routes';
import { testRunRouter } from './modules/testruns/routes';
import { webhookHandler } from './modules/webhooks/handler';
import { healthRouter } from './routes/health';
import { buildSpec } from './lib/openapi';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
// Webhook needs the raw body for signature verification
app.use(
  '/api/webhooks/github',
  express.raw({ type: 'application/json' }),
  ((req, res, next) => {
    (req as express.Request & { rawBody?: Buffer }).rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
    try {
      req.body = JSON.parse((req.body as Buffer).toString('utf8') || '{}');
    } catch {
      req.body = {};
    }
    next();
  }) as express.RequestHandler,
);
app.use(express.json({ limit: '2mb' }));
app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

app.use('/api/health', healthRouter);

// API documentation
const spec = buildSpec();
app.get('/api/docs.json', (_req, res) => res.json(spec));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));

// Webhook (unauthenticated, signature-verified)
app.post('/api/webhooks/github', webhookHandler);

const api = express.Router();
api.use('/auth', authRouter);
api.use('/projects', projectRouter);
api.use('/projects', issueRouter);
api.use('/projects', analysisRouter);
api.use('/projects', reviewRouter);
api.use('/projects', testRunRouter);
api.use(githubRouter);
api.use(analyticsRouter);
api.use(suggestionRouter);
app.use('/api', api);

app.use(notFoundHandler);
app.use(errorHandler);

export function startServer(): void {
  app.listen(config.port, () => {
    logger.info({ port: config.port }, `CodeSentinel API listening on :${config.port}`);
    logger.info(`Docs: http://localhost:${config.port}/api/docs`);
  });
}

// Only auto-start when run directly (tests import the app)
if (require.main === module) {
  void import('./lib/db').then(async ({ db }) => {
    try {
      await db.$queryRaw`SELECT 1`;
      logger.info('Database connection verified');
      startServer();
    } catch (err) {
      logger.error({ err }, 'Failed to connect to database');
      process.exit(1);
    }
  });
}

export default app;
