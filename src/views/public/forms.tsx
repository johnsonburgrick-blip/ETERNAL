import { COUNTRY_CODES, countryName, pick } from '../../i18n';
import type { AppField } from '../../snapshot/model';
import type { RenderCtx } from './context';
import { Md } from './components';

function Hidden({ rc, form }: { rc: RenderCtx; form: string }) {
  return (
    <>
      <input type="hidden" name="_ft" value={rc.timers[form] ?? ''} />
      <div class="hp" aria-hidden="true">
        <label>Website<input type="text" name="website" tabindex={-1} autocomplete="off" /></label>
      </div>
    </>
  );
}

function Turnstile({ rc }: { rc: RenderCtx }) {
  return rc.env.TURNSTILE_SITE_KEY ? <div class="cf-turnstile" data-sitekey={rc.env.TURNSTILE_SITE_KEY} data-theme="dark" /> : null;
}

function Status({ rc, form }: { rc: RenderCtx; form: string }) {
  const st = rc.formState;
  if (!st || st.form !== form) return null;
  if (st.success) return <div class="alert success" role="status" tabindex={-1} data-focus>{st.success}</div>;
  if (st.message) return <div class="alert error" role="alert" tabindex={-1} data-focus>{st.message}</div>;
  if (st.info) return <div class="alert info" role="status" tabindex={-1} data-focus>{st.info}</div>;
  return null;
}

const val = (rc: RenderCtx, form: string, key: string) => (rc.formState?.form === form ? rc.formState.values?.[key] ?? '' : '');
const err = (rc: RenderCtx, form: string, key: string) => (rc.formState?.form === form ? rc.formState.errors?.[key] : undefined);

export function FieldInput({ rc, f, form }: { rc: RenderCtx; f: AppField; form: string }) {
  const { t, locale } = rc;
  const id = `f-${f.key}`;
  const v = val(rc, form, f.key);
  const e = err(rc, form, f.key);
  const label = pick(f.label, locale) ?? f.key;
  const help = pick(f.help, locale);
  const describedBy = [help ? `${id}-help` : '', e ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined;
  const common = { id, name: f.key, required: f.required, 'aria-invalid': e ? 'true' : undefined, 'aria-describedby': describedBy, 'data-label': label };

  if (f.type === 'checkbox') {
    return (
      <div class={`field field-check${e ? ' has-error' : ''}`}>
        <label class="check">
          <input type="checkbox" value="yes" checked={v === 'yes'} {...common} />
          <span>{label}{f.required ? <span class="req" aria-hidden="true"> *</span> : null}</span>
        </label>
        {help ? <p class="help" id={`${id}-help`}>{help}</p> : null}
        {e ? <p class="error" id={`${id}-err`}>{e}</p> : null}
      </div>
    );
  }

  let control;
  if (f.type === 'textarea') control = <textarea rows={5} maxlength={f.maxLength} {...common}>{v}</textarea>;
  else if (f.type === 'select')
    control = (
      <select {...common}>
        <option value="">{t('apply.select')}</option>
        {f.options.map((o) => <option value={o.value} selected={v === o.value}>{pick(o.label, locale)}</option>)}
      </select>
    );
  else if (f.type === 'country') {
    const opts = COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => a.name.localeCompare(b.name, locale));
    control = (
      <select autocomplete="country" {...common}>
        <option value="">{t('apply.select')}</option>
        {opts.map((o) => <option value={o.code} selected={v === o.code}>{o.name}</option>)}
      </select>
    );
  } else {
    const auto = f.key === 'full_name' ? 'name' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : f.key === 'occupation' ? 'organization-title' : undefined;
    control = <input type={f.type === 'text' ? 'text' : f.type} value={v} maxlength={f.maxLength} autocomplete={auto} inputmode={f.type === 'tel' ? 'tel' : undefined} {...common} />;
  }

  return (
    <div class={`field${e ? ' has-error' : ''}`}>
      <label for={id}>
        {label}
        {f.required ? <span class="req" aria-hidden="true"> *</span> : <span class="opt"> ({t('common.optional')})</span>}
      </label>
      {control}
      {help ? <p class="help" id={`${id}-help`}>{help}</p> : null}
      {e ? <p class="error" id={`${id}-err`}>{e}</p> : null}
    </div>
  );
}

export function ApplicationForm({ rc, heading, intro }: { rc: RenderCtx; heading?: string; intro?: string }) {
  const { t, data, lp } = rc;
  const st = rc.formState?.form === 'apply' ? rc.formState : undefined;
  if (!data.settings.applicationsOpen) {
    return (
      <div class="container narrow">
        {heading ? <h2>{heading}</h2> : null}
        <div class="alert">Applications are currently closed. Please check back later.</div>
      </div>
    );
  }
  if (st?.success) {
    return (
      <div class="container narrow center confirmation" data-focus tabindex={-1}>
        <p class="eyebrow">{t('apply.title')}</p>
        <h2>{t('apply.submittedTitle')}</h2>
        <span class="rule" aria-hidden="true" />
        <p class="lede">{st.success}</p>
      </div>
    );
  }
  const steps = [1, 2, 3].map((n) => data.applicationFields.filter((f) => f.step === n));
  const stepNames = [t('apply.step1'), t('apply.step2'), t('apply.step3'), t('apply.step4')];
  const fieldError = (key: string) => st?.errors?.[key];

  return (
    <div class="container narrow">
      {heading ? <h2 class="form-title">{heading}</h2> : null}
      <Md src={intro} />
      <Status rc={rc} form="apply" />
      <form class="apply-form" method="post" action={lp('/apply')} enctype="multipart/form-data" data-multistep>
        <Hidden rc={rc} form="apply" />
        <input type="hidden" name="submission_token" value={st?.values?.submission_token || rc.submissionToken} />
        {st?.values?._resume ? <input type="hidden" name="_resume" value={st.values._resume} /> : null}
        <ol class="progress" aria-label={t('apply.title')} data-progress hidden>
          {stepNames.map((name, i) => <li data-step-indicator={i + 1}><span class="num">{i + 1}</span><span class="label">{name}</span></li>)}
        </ol>
        <p class="nojs-note" data-nojs>{t('apply.noJs')}</p>
        {steps.map((fields, i) => (
          <fieldset class="step" data-step={i + 1}>
            <legend>
              <span class="step-count" data-step-count>{t('apply.step', { n: i + 1, total: 4 })}</span>
              {stepNames[i]}
            </legend>
            {fields.map((f) => <FieldInput rc={rc} f={f} form="apply" />)}
            <div class="step-nav" data-step-nav hidden>
              {i > 0 ? <button type="button" class="btn btn-ghost" data-prev>{t('apply.prev')}</button> : <span />}
              <button type="button" class="btn btn-gold" data-next>{t('apply.next')}</button>
            </div>
          </fieldset>
        ))}
        <fieldset class="step" data-step="4">
          <legend><span class="step-count" data-step-count>{t('apply.step', { n: 4, total: 4 })}</span>{stepNames[3]}</legend>
          <div class="review" data-review hidden>
            <p>{t('apply.review')}</p>
            <div data-review-body />
          </div>
          <div class={`field${fieldError('documents') ? ' has-error' : ''}`}>
            <label for="f-documents">{t('apply.documents')} <span class="opt">({t('common.optional')})</span></label>
            <input id="f-documents" type="file" name="documents" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" data-max-files="3" data-max-bytes="10485760" aria-describedby="f-documents-help" />
            <p class="help" id="f-documents-help">{t('apply.documentsHelp')}</p>
            {fieldError('documents') ? <p class="error">{fieldError('documents')}</p> : null}
          </div>
          <div class="privacy-box">
            <p>{t('apply.privacyNotice')} <a href={lp('/privacy')}>{pick({ en: 'Privacy Policy', fr: 'Politique de confidentialité' }, rc.locale)}</a> · <a href={lp('/terms')}>{pick({ en: 'Application terms', fr: 'Conditions' }, rc.locale)}</a></p>
          </div>
          <div class={`field field-check${fieldError('consent') ? ' has-error' : ''}`}>
            <label class="check"><input type="checkbox" name="consent" value="yes" required checked={st?.values?.consent === 'yes'} /><span>{t('apply.consent')} <span class="req" aria-hidden="true">*</span></span></label>
            {fieldError('consent') ? <p class="error">{fieldError('consent')}</p> : null}
          </div>
          <div class={`field field-check${fieldError('terms') ? ' has-error' : ''}`}>
            <label class="check"><input type="checkbox" name="terms" value="yes" required checked={st?.values?.terms === 'yes'} /><span>{t('apply.terms')} <span class="req" aria-hidden="true">*</span></span></label>
            {fieldError('terms') ? <p class="error">{fieldError('terms')}</p> : null}
          </div>
          <Turnstile rc={rc} />
          <div class="step-nav final">
            <button type="button" class="btn btn-ghost" data-prev hidden>{t('apply.prev')}</button>
            <button type="submit" class="btn btn-gold" name="_action" value="submit" data-submit>{t('apply.submit')}</button>
          </div>
        </fieldset>
        <div class="save-later">
          <button type="submit" class="link-button" name="_action" value="save" formnovalidate>{t('apply.saveResume')}</button>
          <p class="help">{t('apply.saveResumeHelp')}</p>
        </div>
      </form>
    </div>
  );
}

export function ContactForm({ rc, kind, eyebrow, heading, intro }: { rc: RenderCtx; kind: 'contact' | 'report'; eyebrow?: string; heading?: string; intro?: string }) {
  const { t, lp, data } = rc;
  const st = rc.formState?.form === kind ? rc.formState : undefined;
  const fv = (k: string) => st?.values?.[k] ?? '';
  const fe = (k: string) => st?.errors?.[k];
  const fld = (name: string, label: string, type: 'text' | 'email' | 'textarea' | 'url', required = true, auto?: string) => (
    <div class={`field${fe(name) ? ' has-error' : ''}`}>
      <label for={`${kind}-${name}`}>{label}{required ? <span class="req" aria-hidden="true"> *</span> : null}</label>
      {type === 'textarea' ? (
        <textarea id={`${kind}-${name}`} name={name} rows={6} required={required} maxlength={5000} aria-invalid={fe(name) ? 'true' : undefined}>{fv(name)}</textarea>
      ) : (
        <input id={`${kind}-${name}`} name={name} type={type} required={required} value={fv(name)} maxlength={type === 'url' ? 500 : 200} autocomplete={auto} aria-invalid={fe(name) ? 'true' : undefined} />
      )}
      {fe(name) ? <p class="error">{fe(name)}</p> : null}
    </div>
  );
  return (
    <div class="container contact-layout">
      <div class="contact-intro">
        {eyebrow ? <p class="eyebrow">{eyebrow}</p> : null}
        {heading ? <h2>{heading}</h2> : null}
        {heading ? <span class="rule" aria-hidden="true" /> : null}
        <Md src={intro} />
        {kind === 'contact' && data.settings.contactEmail ? (
          <p class="contact-line"><span class="eyebrow">Email</span><a href={`mailto:${data.settings.contactEmail}`}>{data.settings.contactEmail}</a></p>
        ) : null}
        {kind === 'contact' && pick(data.settings.contactAddress, rc.locale) ? <p class="contact-line address">{pick(data.settings.contactAddress, rc.locale)}</p> : null}
      </div>
      <div class="contact-form">
        <Status rc={rc} form={kind} />
        {st?.success ? null : (
          <form method="post" action={lp(kind === 'contact' ? '/contact' : '/report')} class="stack-form">
            <Hidden rc={rc} form={kind} />
            {fld('name', t('form.name'), 'text', true, 'name')}
            {fld('email', t('form.email'), 'email', true, 'email')}
            {fld('subject', t('form.subject'), 'text')}
            {kind === 'report' ? fld('page_url', t('form.pageUrl'), 'url', false) : null}
            {fld('message', t('form.message'), 'textarea')}
            <Turnstile rc={rc} />
            <button class="btn btn-gold" type="submit">{t('common.send')}</button>
          </form>
        )}
      </div>
    </div>
  );
}

export function ApplicantForms({ rc, heading, intro }: { rc: RenderCtx; heading?: string; intro?: string }) {
  const { t, lp } = rc;
  const mk = (form: 'applicant_message' | 'applicant_withdraw') => {
    const st = rc.formState?.form === form ? rc.formState : undefined;
    const v = (k: string) => st?.values?.[k] ?? '';
    return { st, v };
  };
  const m = mk('applicant_message');
  const w = mk('applicant_withdraw');
  return (
    <div class="container applicant-forms">
      <div>
        <h2>{heading || t('applicant.title')}</h2>
        <span class="rule" aria-hidden="true" />
        {intro ? <Md src={intro} /> : <p>{t('applicant.intro')}</p>}
        <Status rc={rc} form="applicant_message" />
        {m.st?.success ? null : (
          <form method="post" action={lp('/apply/message')} class="stack-form">
            <Hidden rc={rc} form="applicant_message" />
            <div class="field"><label for="am-ref">{t('applicant.reference')} <span class="req" aria-hidden="true">*</span></label><input id="am-ref" name="reference" required maxlength={20} placeholder="EIC-2026-XXXXXX" value={m.v('reference')} autocapitalize="characters" /></div>
            <div class="field"><label for="am-email">{t('form.email')} <span class="req" aria-hidden="true">*</span></label><input id="am-email" name="email" type="email" required maxlength={200} autocomplete="email" value={m.v('email')} /></div>
            <div class="field"><label for="am-msg">{t('form.message')} <span class="req" aria-hidden="true">*</span></label><textarea id="am-msg" name="message" rows={5} required maxlength={5000}>{m.v('message')}</textarea></div>
            <Turnstile rc={rc} />
            <button class="btn btn-gold" type="submit">{t('common.send')}</button>
          </form>
        )}
      </div>
      <div class="withdraw-box">
        <h3>{t('applicant.withdrawTitle')}</h3>
        <p>{t('applicant.withdrawIntro')}</p>
        <Status rc={rc} form="applicant_withdraw" />
        {w.st?.success ? null : (
          <form method="post" action={lp('/apply/withdraw')} class="stack-form">
            <Hidden rc={rc} form="applicant_withdraw" />
            <div class="field"><label for="aw-ref">{t('applicant.reference')}</label><input id="aw-ref" name="reference" required maxlength={20} value={w.v('reference')} autocapitalize="characters" /></div>
            <div class="field"><label for="aw-email">{t('form.email')}</label><input id="aw-email" name="email" type="email" required maxlength={200} autocomplete="email" value={w.v('email')} /></div>
            <button class="btn btn-ghost" type="submit">{t('applicant.withdraw')}</button>
          </form>
        )}
      </div>
    </div>
  );
}
