/**
 * Section types available in the page editor. The same definitions drive the admin
 * form builder and the public renderer. Translatable field values are stored per
 * locale (content.en / content.fr). Non-translatable values (images, video, numbers,
 * selects) are stored once in content.shared.
 */
export type FieldType = 'text' | 'textarea' | 'markdown' | 'image' | 'video' | 'url' | 'select' | 'number' | 'checkbox' | 'buttons' | 'items';

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  help?: string;
  options?: { value: string; label: string }[];
  itemFields?: FieldDef[];
  max?: number;
}

export interface SectionTypeDef {
  label: string;
  description: string;
  fields: FieldDef[];
  defaults?: { shared?: Record<string, any>; en?: Record<string, any> };
}

const TRANSLATABLE: FieldType[] = ['text', 'textarea', 'markdown', 'buttons', 'items'];
export const isTranslatable = (f: FieldDef) => TRANSLATABLE.includes(f.type);

const eyebrow: FieldDef = { name: 'eyebrow', label: 'Small heading above the title', type: 'text', max: 80 };
const heading: FieldDef = { name: 'heading', label: 'Heading', type: 'text', max: 160 };
const intro: FieldDef = { name: 'intro', label: 'Introduction', type: 'textarea', max: 800 };
const buttons: FieldDef = { name: 'buttons', label: 'Buttons', type: 'buttons', help: 'Up to 3 buttons. Use site paths like /apply or full https:// links.' };
const count = (label = 'How many to show (0 = all)'): FieldDef => ({ name: 'count', label, type: 'number' });

export const SECTION_TYPES: Record<string, SectionTypeDef> = {
  hero: {
    label: 'Hero banner',
    description: 'Full-width photograph with title, introduction and buttons.',
    fields: [
      eyebrow, heading,
      { name: 'subheading', label: 'Tagline / subheading', type: 'text', max: 200 },
      { name: 'body', label: 'Short introduction', type: 'textarea', max: 600 },
      { name: 'image', label: 'Background photograph', type: 'image' },
      { name: 'video', label: 'Background video (desktop only, never autoplays on mobile)', type: 'video' },
      { name: 'height', label: 'Height', type: 'select', options: [{ value: 'full', label: 'Full screen' }, { value: 'large', label: 'Large' }, { value: 'medium', label: 'Medium' }] },
      buttons,
    ],
    defaults: { shared: { height: 'large' } },
  },
  text: {
    label: 'Text with optional image',
    description: 'Heading, rich text and an optional photograph beside it.',
    fields: [
      eyebrow, heading,
      { name: 'body', label: 'Text', type: 'markdown', help: 'Use **bold**, *italic*, [link](/page), "- " for lists, "## " for sub-headings.' },
      { name: 'image', label: 'Photograph', type: 'image' },
      { name: 'imagePosition', label: 'Photograph position', type: 'select', options: [{ value: 'right', label: 'Right' }, { value: 'left', label: 'Left' }, { value: 'top', label: 'Above text' }] },
      { name: 'caption', label: 'Photograph caption', type: 'text', max: 200 },
      buttons,
    ],
    defaults: { shared: { imagePosition: 'right' } },
  },
  cards: {
    label: 'Cards / features',
    description: 'A grid of cards, each with an optional photograph and link.',
    fields: [
      eyebrow, heading, intro,
      { name: 'columns', label: 'Columns on desktop', type: 'select', options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] },
      {
        name: 'items', label: 'Cards', type: 'items',
        itemFields: [
          { name: 'title', label: 'Title', type: 'text', max: 120 },
          { name: 'text', label: 'Text', type: 'textarea', max: 600 },
          { name: 'image', label: 'Photograph', type: 'image' },
          { name: 'href', label: 'Link (optional)', type: 'url' },
        ],
      },
      buttons,
    ],
    defaults: { shared: { columns: '3' } },
  },
  quote: {
    label: 'Quotation',
    description: 'A large pull-quote with attribution.',
    fields: [
      { name: 'quote', label: 'Quotation', type: 'textarea', max: 600 },
      { name: 'attribution', label: 'Attribution', type: 'text', max: 200 },
      { name: 'image', label: 'Portrait (optional)', type: 'image' },
    ],
  },
  cta: {
    label: 'Call to action',
    description: 'A highlighted invitation with buttons.',
    fields: [eyebrow, heading, { name: 'body', label: 'Text', type: 'textarea', max: 800 }, buttons],
  },
  notice: {
    label: 'Notice / disclaimer',
    description: 'A bordered note, e.g. distinguishing history from speculation.',
    fields: [heading, { name: 'body', label: 'Text', type: 'markdown' }, { name: 'tone', label: 'Tone', type: 'select', options: [{ value: 'info', label: 'Information' }, { value: 'caution', label: 'Caution' }] }],
    defaults: { shared: { tone: 'info' } },
  },
  gallery: {
    label: 'Photo gallery',
    description: 'A grid of photographs with captions.',
    fields: [eyebrow, heading, { name: 'items', label: 'Photographs', type: 'items', itemFields: [{ name: 'image', label: 'Photograph', type: 'image' }, { name: 'caption', label: 'Caption', type: 'text', max: 200 }] }],
  },
  timeline_preview: {
    label: 'Timeline preview',
    description: 'Shows the first events of the historical timeline.',
    fields: [eyebrow, heading, intro, count('How many events'), buttons],
    defaults: { shared: { count: 5 } },
  },
  timeline_full: { label: 'Interactive timeline', description: 'The full, filterable historical timeline.', fields: [eyebrow, heading, intro] },
  figures_list: { label: 'Historical figures', description: 'Portrait cards of historical figures.', fields: [eyebrow, heading, intro, count(), buttons], defaults: { shared: { count: 0 } } },
  principles_list: { label: 'Principles', description: 'The Covenant’s principles.', fields: [eyebrow, heading, intro, count(), buttons], defaults: { shared: { count: 0 } } },
  symbols_list: { label: 'Symbols', description: 'Historical symbols and their interpretations.', fields: [eyebrow, heading, intro, count(), buttons], defaults: { shared: { count: 0 } } },
  leadership_list: { label: 'Leadership profiles', description: 'Published leadership profiles.', fields: [eyebrow, heading, intro] },
  articles_list: {
    label: 'Publications',
    description: 'Articles or announcements, optionally with category filters.',
    fields: [
      eyebrow, heading, intro, count(),
      { name: 'mode', label: 'Show', type: 'select', options: [{ value: 'articles', label: 'Articles (not announcements)' }, { value: 'announcements', label: 'Announcements only' }, { value: 'featured', label: 'Featured only' }, { value: 'all', label: 'Everything' }] },
      { name: 'filters', label: 'Show category filters', type: 'checkbox' },
      buttons,
    ],
    defaults: { shared: { count: 0, mode: 'articles' } },
  },
  archive_list: { label: 'Research archive', description: 'Filterable archive of documents and references.', fields: [eyebrow, heading, intro] },
  faq_list: {
    label: 'Frequently asked questions',
    description: 'Expandable questions and answers.',
    fields: [eyebrow, heading, intro, count(), { name: 'category', label: 'Only this category (optional)', type: 'select', options: [{ value: '', label: 'All' }, { value: 'general', label: 'General' }, { value: 'history', label: 'History' }, { value: 'membership', label: 'Membership' }, { value: 'privacy', label: 'Privacy' }] }, buttons],
    defaults: { shared: { count: 0, category: '' } },
  },
  application_form: { label: 'Membership application form', description: 'The four-step application form.', fields: [heading, { name: 'intro', label: 'Introduction', type: 'markdown' }] },
  contact_form: { label: 'Contact form', description: 'General enquiries form with contact details.', fields: [eyebrow, heading, { name: 'intro', label: 'Introduction', type: 'markdown' }] },
  report_form: { label: 'Report an issue form', description: 'Confidential reporting form.', fields: [heading, { name: 'intro', label: 'Introduction', type: 'markdown' }] },
  applicant_forms: { label: 'Applicant contact & withdrawal', description: 'Lets applicants message the team or withdraw, using their reference.', fields: [heading, { name: 'intro', label: 'Introduction', type: 'markdown' }] },
};

export const BACKGROUNDS = [
  { value: 'obsidian', label: 'Obsidian (black)' },
  { value: 'charcoal', label: 'Charcoal' },
  { value: 'ivory', label: 'Ivory (light)' },
  { value: 'image', label: 'Photograph' },
];
