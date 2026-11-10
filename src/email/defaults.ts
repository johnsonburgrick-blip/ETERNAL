/**
 * Default email templates. Administrators can override any of them per language in
 * Admin → Emails → Templates. Overrides are stored in `email_templates`. These defaults
 * apply whenever no override exists.
 *
 * Body syntax: the safe Markdown subset (see lib/markdown.ts) with {{placeholders}}.
 * Placeholder values are HTML-escaped when inserted.
 */
export interface TemplateDef {
  name: string;
  audience: 'client' | 'admin';
  vars: string[];
  en: { subject: string; heading: string; body: string; button?: string };
  fr?: { subject: string; heading: string; body: string; button?: string };
}

export const TEMPLATE_DEFS: Record<string, TemplateDef> = {
  application_verify: {
    name: 'Application — confirm email address',
    audience: 'client',
    vars: ['name', 'reference', 'link'],
    en: {
      subject: 'Confirm your email to complete your application ({{reference}})',
      heading: 'Please confirm your email address',
      body: 'Dear {{name}},\n\nThank you for applying to the {{site_name}}. Your application reference is **{{reference}}**.\n\nTo protect your privacy, your application will only be reviewed after you confirm that this email address belongs to you. The link below is valid for 7 days.\n\nIf you did not submit an application, you can ignore this message and the application will be deleted automatically.',
      button: 'Confirm my email address',
    },
    fr: {
      subject: 'Confirmez votre adresse e-mail pour finaliser votre candidature ({{reference}})',
      heading: 'Veuillez confirmer votre adresse e-mail',
      body: 'Bonjour {{name}},\n\nMerci pour votre candidature auprès de l’{{site_name}}. Votre référence est **{{reference}}**.\n\nPour protéger votre vie privée, votre candidature ne sera examinée qu’après la confirmation de cette adresse e-mail. Le lien ci-dessous est valable 7 jours.\n\nSi vous n’êtes pas à l’origine de cette candidature, ignorez ce message : elle sera supprimée automatiquement.',
      button: 'Confirmer mon adresse e-mail',
    },
  },
  application_received: {
    name: 'Application — received (after confirmation)',
    audience: 'client',
    vars: ['name', 'reference'],
    en: {
      subject: 'Application received — {{reference}}',
      heading: 'Your application has been received',
      body: 'Dear {{name}},\n\nThank you — your email address is confirmed and your application **{{reference}}** is now in our review queue.\n\n**What happens next**\n\n- Every application is read by an authorised reviewer.\n- We may contact you if we need more information.\n- You will receive an email when a decision has been made.\n\nPlease keep your reference number. If you need to contact us about your application, reply to this email or use the contact page on our website.\n\nWe will never ask you for money transfers, passwords or banking details by email.',
    },
    fr: {
      subject: 'Candidature reçue — {{reference}}',
      heading: 'Votre candidature a bien été reçue',
      body: 'Bonjour {{name}},\n\nMerci : votre adresse e-mail est confirmée et votre candidature **{{reference}}** est désormais en attente d’examen.\n\n**Prochaines étapes**\n\n- Chaque candidature est lue par un examinateur autorisé.\n- Nous pourrons vous contacter si nous avons besoin d’informations complémentaires.\n- Vous recevrez un e-mail lorsqu’une décision aura été prise.\n\nConservez votre référence. Pour nous écrire au sujet de votre candidature, répondez à cet e-mail ou utilisez la page de contact du site.\n\nNous ne vous demanderons jamais de virement, de mot de passe ou de coordonnées bancaires par e-mail.',
    },
  },
  application_duplicate: {
    name: 'Application — already submitted',
    audience: 'client',
    vars: ['name', 'reference'],
    en: {
      subject: 'You already have an application in progress',
      heading: 'An application already exists',
      body: 'Hello,\n\nWe received a new application for this email address, but an application (**{{reference}}**) is already in progress, so the new submission was not created.\n\nIf you need to update your application, please contact us and quote your reference.',
    },
    fr: {
      subject: 'Vous avez déjà une candidature en cours',
      heading: 'Une candidature existe déjà',
      body: 'Bonjour,\n\nNous avons reçu une nouvelle candidature pour cette adresse e-mail, mais une candidature (**{{reference}}**) est déjà en cours ; la nouvelle demande n’a donc pas été créée.\n\nPour modifier votre candidature, contactez-nous en indiquant votre référence.',
    },
  },
  application_resume: {
    name: 'Application — continue later link',
    audience: 'client',
    vars: ['link'],
    en: {
      subject: 'Continue your membership application',
      heading: 'Continue your application',
      body: 'Hello,\n\nYou asked us to save your membership application. Use the private link below to continue where you left off. It is valid for 7 days and can be used once.\n\nIf you did not request this, you can ignore this message; the saved answers will be deleted automatically.',
      button: 'Continue my application',
    },
    fr: {
      subject: 'Reprendre votre candidature',
      heading: 'Reprendre votre candidature',
      body: 'Bonjour,\n\nVous avez demandé l’enregistrement de votre candidature. Utilisez le lien privé ci-dessous pour la reprendre. Il est valable 7 jours et utilisable une seule fois.\n\nSi vous n’êtes pas à l’origine de cette demande, ignorez ce message ; les réponses enregistrées seront supprimées automatiquement.',
      button: 'Reprendre ma candidature',
    },
  },
  application_under_review: {
    name: 'Status — under review',
    audience: 'client',
    vars: ['name', 'reference'],
    en: { subject: 'Your application {{reference}} is under review', heading: 'Your application is under review', body: 'Dear {{name}},\n\nA reviewer has begun reviewing your application **{{reference}}**. There is nothing you need to do at this stage; we will contact you if we need anything further.' },
    fr: { subject: 'Votre candidature {{reference}} est en cours d’examen', heading: 'Votre candidature est en cours d’examen', body: 'Bonjour {{name}},\n\nUn examinateur a commencé l’étude de votre candidature **{{reference}}**. Vous n’avez rien à faire pour le moment ; nous vous contacterons si nécessaire.' },
  },
  application_info_requested: {
    name: 'Status — information requested',
    audience: 'client',
    vars: ['name', 'reference', 'message'],
    en: { subject: 'Additional information requested — {{reference}}', heading: 'We need a little more information', body: 'Dear {{name}},\n\nThank you for your application **{{reference}}**. To continue the review, we would be grateful if you could provide the following:\n\n> {{message}}\n\nPlease reply directly to this email.' },
    fr: { subject: 'Informations complémentaires demandées — {{reference}}', heading: 'Nous avons besoin de quelques précisions', body: 'Bonjour {{name}},\n\nMerci pour votre candidature **{{reference}}**. Pour poursuivre l’examen, pourriez-vous nous fournir les éléments suivants :\n\n> {{message}}\n\nVeuillez répondre directement à cet e-mail.' },
  },
  application_accepted: {
    name: 'Decision — accepted',
    audience: 'client',
    vars: ['name', 'reference', 'message'],
    en: { subject: 'Your application {{reference}} has been accepted', heading: 'Welcome to the Covenant', body: 'Dear {{name}},\n\nWe are pleased to tell you that your application **{{reference}}** has been accepted.\n\n{{message}}\n\nIf you have any questions, simply reply to this email.' },
    fr: { subject: 'Votre candidature {{reference}} a été acceptée', heading: 'Bienvenue au sein du Covenant', body: 'Bonjour {{name}},\n\nNous avons le plaisir de vous informer que votre candidature **{{reference}}** a été acceptée.\n\n{{message}}\n\nPour toute question, répondez simplement à cet e-mail.' },
  },
  application_declined: {
    name: 'Decision — declined',
    audience: 'client',
    vars: ['name', 'reference', 'message'],
    en: { subject: 'Your application {{reference}}', heading: 'Thank you for your interest', body: 'Dear {{name}},\n\nThank you for the time you took to apply. After careful consideration, we are unable to accept your application **{{reference}}** at this time.\n\n{{message}}\n\nWe wish you every success in your intellectual pursuits.' },
    fr: { subject: 'Votre candidature {{reference}}', heading: 'Merci de votre intérêt', body: 'Bonjour {{name}},\n\nMerci du temps consacré à votre candidature. Après un examen attentif, nous ne sommes pas en mesure d’accepter votre candidature **{{reference}}** pour le moment.\n\n{{message}}\n\nNous vous souhaitons beaucoup de succès dans vos recherches.' },
  },
  application_withdraw_confirm: {
    name: 'Applicant — confirm withdrawal',
    audience: 'client',
    vars: ['reference', 'link'],
    en: { subject: 'Confirm withdrawal of application {{reference}}', heading: 'Confirm withdrawal', body: 'Hello,\n\nWe received a request to withdraw application **{{reference}}**. If you made this request, confirm it with the button below (valid for 48 hours). If not, ignore this email and nothing will change.', button: 'Withdraw my application' },
    fr: { subject: 'Confirmez le retrait de la candidature {{reference}}', heading: 'Confirmer le retrait', body: 'Bonjour,\n\nNous avons reçu une demande de retrait de la candidature **{{reference}}**. Si vous êtes à l’origine de cette demande, confirmez-la avec le bouton ci-dessous (valable 48 heures). Sinon, ignorez cet e-mail.', button: 'Retirer ma candidature' },
  },
  application_withdrawn: {
    name: 'Applicant — withdrawal confirmed',
    audience: 'client',
    vars: ['name', 'reference'],
    en: { subject: 'Application {{reference}} withdrawn', heading: 'Your application has been withdrawn', body: 'Dear {{name}},\n\nAs requested, application **{{reference}}** has been withdrawn. Your personal data will be deleted in line with our privacy policy.' },
    fr: { subject: 'Candidature {{reference}} retirée', heading: 'Votre candidature a été retirée', body: 'Bonjour {{name}},\n\nComme demandé, la candidature **{{reference}}** a été retirée. Vos données personnelles seront supprimées conformément à notre politique de confidentialité.' },
  },
  applicant_message_confirm: {
    name: 'Applicant — confirm message',
    audience: 'client',
    vars: ['reference', 'link'],
    en: { subject: 'Confirm your message about application {{reference}}', heading: 'Confirm your message', body: 'Hello,\n\nWe received a message about application **{{reference}}**. To make sure it really came from you, please confirm it with the button below (valid for 48 hours).', button: 'Send my message' },
    fr: { subject: 'Confirmez votre message concernant la candidature {{reference}}', heading: 'Confirmez votre message', body: 'Bonjour,\n\nNous avons reçu un message concernant la candidature **{{reference}}**. Pour vérifier qu’il vient bien de vous, confirmez-le avec le bouton ci-dessous (valable 48 heures).', button: 'Envoyer mon message' },
  },
  applicant_message_received: {
    name: 'Applicant — message delivered',
    audience: 'client',
    vars: ['name', 'reference'],
    en: { subject: 'We received your message — {{reference}}', heading: 'Message received', body: 'Dear {{name}},\n\nYour message about application **{{reference}}** has been delivered to the review team. We will reply by email.' },
    fr: { subject: 'Nous avons reçu votre message — {{reference}}', heading: 'Message reçu', body: 'Bonjour {{name}},\n\nVotre message concernant la candidature **{{reference}}** a été transmis à l’équipe d’examen. Nous vous répondrons par e-mail.' },
  },
  applicant_correspondence: {
    name: 'Correspondence from the review team',
    audience: 'client',
    vars: ['name', 'reference', 'subject', 'message'],
    en: { subject: '{{subject}}', heading: '{{subject}}', body: 'Dear {{name}},\n\n{{message}}\n\nReference: {{reference}}' },
    fr: { subject: '{{subject}}', heading: '{{subject}}', body: 'Bonjour {{name}},\n\n{{message}}\n\nRéférence : {{reference}}' },
  },
  announcement: {
    name: 'Official announcement',
    audience: 'client',
    vars: ['name', 'subject', 'message', 'link'],
    en: { subject: '{{subject}}', heading: '{{subject}}', body: 'Dear {{name}},\n\n{{message}}', button: 'Read on our website' },
    fr: { subject: '{{subject}}', heading: '{{subject}}', body: 'Bonjour {{name}},\n\n{{message}}', button: 'Lire sur notre site' },
  },
  contact_received: {
    name: 'Contact form — confirmation',
    audience: 'client',
    vars: ['name', 'subject'],
    en: { subject: 'We received your message', heading: 'Thank you for contacting us', body: 'Dear {{name}},\n\nThank you for your message “{{subject}}”. A member of our team will reply by email. If you need to add anything, simply reply to this email.' },
    fr: { subject: 'Nous avons bien reçu votre message', heading: 'Merci de nous avoir contactés', body: 'Bonjour {{name}},\n\nMerci pour votre message « {{subject}} ». Un membre de notre équipe vous répondra par e-mail. Pour ajouter une précision, répondez simplement à cet e-mail.' },
  },
  report_received: {
    name: 'Report an issue — confirmation',
    audience: 'client',
    vars: ['name', 'subject'],
    en: { subject: 'Your report has been received', heading: 'Thank you for your report', body: 'Dear {{name}},\n\nThank you for reporting “{{subject}}”. Reports are reviewed by our team and handled confidentially.' },
    fr: { subject: 'Votre signalement a été reçu', heading: 'Merci pour votre signalement', body: 'Bonjour {{name}},\n\nMerci d’avoir signalé « {{subject}} ». Les signalements sont examinés par notre équipe et traités de manière confidentielle.' },
  },
  // ───────────── Admin notifications (sent to ADMIN_NOTIFY_EMAIL) ─────────────
  admin_new_application: {
    name: 'Admin — new application',
    audience: 'admin',
    vars: ['name', 'reference', 'email', 'country', 'link'],
    en: { subject: 'New application: {{reference}} — {{name}}', heading: 'New membership application', body: 'A new application has been submitted and its email address confirmed.\n\n- **Reference:** {{reference}}\n- **Name:** {{name}}\n- **Email:** {{email}}\n- **Country:** {{country}}', button: 'Open in admin' },
  },
  admin_applicant_message: {
    name: 'Admin — applicant message',
    audience: 'admin',
    vars: ['name', 'reference', 'message', 'link'],
    en: { subject: 'Applicant message: {{reference}}', heading: 'An applicant sent a message', body: '**{{name}}** ({{reference}}) wrote:\n\n> {{message}}', button: 'Open in admin' },
  },
  admin_application_withdrawn: {
    name: 'Admin — application withdrawn',
    audience: 'admin',
    vars: ['name', 'reference', 'link'],
    en: { subject: 'Application withdrawn: {{reference}}', heading: 'Application withdrawn', body: '**{{name}}** withdrew application {{reference}}.', button: 'Open in admin' },
  },
  admin_form_submission: {
    name: 'Admin — contact / report submission',
    audience: 'admin',
    vars: ['kind', 'name', 'email', 'subject', 'message', 'link'],
    en: { subject: 'New {{kind}}: {{subject}}', heading: 'New {{kind}} submission', body: '- **From:** {{name}} ({{email}})\n- **Subject:** {{subject}}\n\n> {{message}}', button: 'Open in admin' },
  },
  admin_security: {
    name: 'Admin — security event',
    audience: 'admin',
    vars: ['subject', 'message', 'link'],
    en: { subject: 'Security: {{subject}}', heading: 'Security event', body: '{{message}}', button: 'Open security log' },
  },
  admin_invite: {
    name: 'Admin — invitation',
    audience: 'admin',
    vars: ['name', 'role', 'link'],
    en: { subject: 'You have been invited to administer {{site_name}}', heading: 'Administrator invitation', body: 'Dear {{name}},\n\nYou have been invited to the {{site_name}} administration portal as **{{role}}**. Use the button below to choose your password. The link is valid for 72 hours and can be used once.', button: 'Set my password' },
  },
  admin_password_reset: {
    name: 'Admin — password reset',
    audience: 'admin',
    vars: ['name', 'link'],
    en: { subject: 'Reset your administrator password', heading: 'Password reset', body: 'Dear {{name}},\n\nA password reset was requested for your administrator account. The link below is valid for 30 minutes and can be used once. If you did not request this, ignore this email; your password will not change.', button: 'Choose a new password' },
  },
};

export type TemplateKey = keyof typeof TEMPLATE_DEFS;
