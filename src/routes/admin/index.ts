import { Hono } from 'hono';
import type { AppEnv } from '../../env';
import { requireAdmin, requirePerm } from '../../lib/auth';
import { isSameOrigin } from '../../lib/guard';
import authRoutes from './auth';
import dashboard from './dashboard';
import applications from './applications';
import pages from './pages';
import collections from './collections';
import media from './media';
import emails from './emails';
import { inbox, reports } from './reports';
import { backups, security, settings, users } from './settings';

const admin = new Hono<AppEnv>();

const OPEN = /^\/admin\/(setup|login|login\/mfa|logout|forgot|reset\/[A-Za-z0-9_-]+)\/?$/;

admin.use('*', async (c, next) => {
  // Same-origin check on every admin write (including login/setup forms).
  if (!['GET', 'HEAD'].includes(c.req.method) && !isSameOrigin(c.req.raw)) return c.text('Cross-origin request blocked.', 403);
  await next();
  c.header('x-frame-options', 'SAMEORIGIN');
  c.header('x-robots-tag', 'noindex, nofollow');
  if (!c.res.headers.get('cache-control')) c.header('cache-control', 'no-store');
});

admin.use('*', async (c, next) => {
  if (OPEN.test(new URL(c.req.url).pathname)) return next();
  return requireAdmin(c, next);
});

admin.route('/', authRoutes);

admin.use('/applications/*', requirePerm('applications.review', 'applications.view_all'));
admin.use('/pages/*', requirePerm('content'));
admin.use('/content/*', requirePerm('content'));
admin.use('/media/*', requirePerm('media', 'content'));
admin.use('/emails/*', requirePerm('emails.templates', 'emails.logs', 'applications.review'));
admin.use('/inbox/*', requirePerm('forms'));
admin.use('/reports/*', requirePerm('reports', 'reports.content'));
admin.use('/settings/*', requirePerm('settings'));
admin.use('/users/*', requirePerm('users'));
admin.use('/security/*', requirePerm('security'));
admin.use('/backups/*', requirePerm('backups'));

admin.route('/', dashboard);
admin.route('/applications', applications);
admin.route('/pages', pages);
admin.route('/content', collections);
admin.route('/media', media);
admin.route('/emails', emails);
admin.route('/inbox', inbox);
admin.route('/reports', reports);
admin.route('/settings', settings);
admin.route('/users', users);
admin.route('/security', security);
admin.route('/backups', backups);

export default admin;
