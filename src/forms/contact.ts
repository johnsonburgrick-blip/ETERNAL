import type { Env } from '../env';
import { checkPublicForm, ipKey, overLimit } from '../lib/guard';
import { notifyAdmins } from '../lib/notify';
import { clampStr, HOUR, isEmail } from '../lib/util';
import { queueEmail } from '../email/send';
import type { FormState, RenderCtx } from '../views/public/context';

/** POST /contact and /report: store, confirm to the sender, notify admins. */
export async function handleContactPost(env: Env, ctx: ExecutionContext, req: Request, rc: RenderCtx, kind: 'contact' | 'report'): Promise<{ state: FormState; status: number }> {
  const fd = await req.formData();
  const values = {
    name: clampStr(fd.get('name'), 200),
    email: clampStr(fd.get('email'), 200).toLowerCase(),
    subject: clampStr(fd.get('subject'), 200),
    message: clampStr(fd.get('message'), 5000),
    page_url: clampStr(fd.get('page_url'), 500),
  };
  const guard = await checkPublicForm(env, req, kind, fd);
  if (!guard.ok) {
    const message = guard.reason === 'too_fast' ? rc.t('form.error.too_fast') : guard.reason === 'config' ? 'This form is temporarily unavailable.' : rc.t('form.error.bot');
    return { state: { form: kind, values, message }, status: guard.reason === 'config' ? 503 : 400 };
  }
  const errors: Record<string, string> = {};
  if (!values.name) errors.name = rc.t('form.error.required');
  if (!isEmail(values.email)) errors.email = rc.t('form.error.email');
  if (!values.subject) errors.subject = rc.t('form.error.required');
  if (values.message.length < 2) errors.message = rc.t('form.error.required');
  if (Object.keys(errors).length) return { state: { form: kind, values, errors, message: rc.t('form.error.generic') }, status: 400 };

  if (await overLimit(env, `${kind}_ip`, await ipKey(req), 6, HOUR)) return { state: { form: kind, values, message: rc.t('form.error.rate') }, status: 429 };

  const row = await env.DB.prepare('INSERT INTO form_submissions (kind, name, email, subject, message, page_url, locale, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(kind, values.name, values.email, values.subject, values.message, values.page_url, rc.locale, Date.now())
    .first<{ id: number }>();
  const id = row!.id;

  // Email failures never block the submission (queueEmail delivers in the background and never throws).
  await queueEmail(env, ctx, {
    dedupeKey: `${kind}-client:${id}`, template: kind === 'contact' ? 'contact_received' : 'report_received', to: values.email, locale: rc.locale,
    vars: { name: values.name, subject: values.subject },
  });
  await notifyAdmins(env, ctx, {
    type: 'form_submission', title: `${kind === 'contact' ? 'Contact' : 'Issue report'}: ${values.subject}`, body: `${values.name} <${values.email}>`,
    link: `/admin/inbox/${id}`, roles: ['super_admin'],
    email: { template: 'admin_form_submission', dedupeKey: `${kind}-admin:${id}`, vars: { kind: kind === 'contact' ? 'contact message' : 'issue report', ...values } },
  });
  return { state: { form: kind, success: rc.t('form.sent') }, status: 200 };
}
