// Seed content. Historical statements are limited to well-documented facts, and
// disputed or legendary material is labelled as such. Organisational statements
// about the modern Covenant are DRAFTS for the Covenant to confirm. Sections that need
// facts only the Covenant can supply (founding details, leaders, governance, activities)
// are seeded HIDDEN with clear placeholders.

const S = (type, en, opts = {}) => ({ type, en, fr: opts.fr, shared: opts.shared ?? {}, settings: opts.settings ?? {}, visible: opts.visible ?? true });
const B = (label, href, style = 'primary') => ({ label, href, style });

export const SOURCES_CORE = `- Richard van Dülmen, *Der Geheimbund der Illuminaten. Darstellung, Analyse, Dokumentation* (Stuttgart-Bad Cannstatt: frommann-holzboog, 1975).
- Manfred Agethen, *Geheimbund und Utopie. Illuminaten, Freimaurer und deutsche Spätaufklärung* (Munich: Oldenbourg, 1984).
- Hermann Schüttler, *Die Mitglieder des Illuminatenordens 1776–1787/93* (Munich: ars una, 1991).
- René Le Forestier, *Les Illuminés de Bavière et la franc-maçonnerie allemande* (Paris: Hachette, 1914).
- Vernon Stauffer, *New England and the Bavarian Illuminati* (New York: Columbia University Press, 1918).`;

export const pages = [
  // ───────────────────────── HOME ─────────────────────────
  {
    slug: 'home', name: 'Homepage', sort: 0,
    meta: { title: { en: 'Home', fr: 'Accueil' }, description: { en: 'An independent, modern organisation devoted to the history of the Bavarian Illuminati, Enlightenment philosophy and the pursuit of knowledge.', fr: "Une organisation moderne et indépendante consacrée à l'histoire des Illuminés de Bavière, à la philosophie des Lumières et à la quête du savoir." } },
    sections: [
      S('hero', {
        eyebrow: 'An independent modern society', heading: 'Eternal Illuminati Covenant', subheading: 'Knowledge. Enlightenment. Legacy.',
        body: 'A community devoted to the history of the Bavarian Illuminati, the ideals of the Enlightenment and the lifelong pursuit of knowledge.',
        buttons: [B('Apply for membership', '/apply'), B('Explore our history', '/history', 'secondary')],
      }, {
        fr: { eyebrow: 'Une société moderne et indépendante', heading: 'Eternal Illuminati Covenant', subheading: 'Savoir. Lumières. Héritage.', body: "Une communauté consacrée à l'histoire des Illuminés de Bavière, aux idéaux des Lumières et à la quête du savoir tout au long de la vie.", buttons: [B('Candidater', '/apply'), B('Découvrir notre histoire', '/history', 'secondary')] },
        shared: { image: 'img:hero-library', height: 'full' },
      }),
      S('text', {
        eyebrow: '1776 · Ingolstadt', heading: 'An Enlightenment society in Bavaria',
        body: `On **1 May 1776**, Adam Weishaupt, a young professor of canon law at the University of Ingolstadt, founded a small secret society. Its members wanted to spread reason, secular learning and moral self-improvement at a time when Bavarian intellectual life was still closely supervised by Church and state.

Within a decade the Order of the Illuminati had recruited officials, nobles, scholars and writers across the German-speaking world. Then it was banned, its papers were seized and published, and it disappeared, only to be reborn as a legend.

The Eternal Illuminati Covenant is a **modern organisation**. We study this history. We do not claim to continue it.`,
        buttons: [B('Read the history', '/history')],
      }, {
        fr: { eyebrow: '1776 · Ingolstadt', heading: 'Une société des Lumières en Bavière', body: `Le **1er mai 1776**, Adam Weishaupt, jeune professeur de droit canon à l'université d'Ingolstadt, fonde une petite société secrète. Ses membres veulent diffuser la raison, le savoir laïque et le perfectionnement moral, à une époque où la vie intellectuelle bavaroise reste étroitement surveillée par l'Église et l'État.

En une décennie, l'Ordre des Illuminés recrute fonctionnaires, nobles, savants et écrivains dans tout l'espace germanophone. Puis il est interdit, ses papiers sont saisis et publiés, et il disparaît, pour renaître sous forme de légende.

L'Eternal Illuminati Covenant est une **organisation moderne**. Nous étudions cette histoire ; nous ne prétendons pas la prolonger.`, buttons: [B("Lire l'histoire", '/history')] },
        shared: { image: 'img:weishaupt', imagePosition: 'left' },
      }),
      S('timeline_preview', { eyebrow: 'Chronology', heading: 'From Ingolstadt to legend', intro: 'Key dates in the short, documented life of the Bavarian Illuminati, and in the long afterlife of the myth.', buttons: [B('View the full timeline', '/timeline', 'secondary')] },
        { fr: { eyebrow: 'Chronologie', heading: "D'Ingolstadt à la légende", intro: "Les dates clés de la brève existence documentée des Illuminés de Bavière, et de la longue postérité du mythe.", buttons: [B('Voir toute la chronologie', '/timeline', 'secondary')] }, shared: { count: 5 }, settings: { background: 'charcoal' } }),
      S('text', {
        eyebrow: 'Philosophy', heading: 'Sapere aude: dare to know',
        body: `In 1784 Immanuel Kant described Enlightenment as humanity's emergence from a self-imposed immaturity, the inability to use one's own understanding without another's guidance. His motto, borrowed from Horace, was *sapere aude*: have the courage to use your own reason.

That spirit of critical inquiry, open discussion and education guides our work today: reading sources carefully, questioning comfortable myths and improving ourselves through study.`,
        buttons: [B('Our philosophy', '/philosophy')],
      }, {
        fr: { eyebrow: 'Philosophie', heading: 'Sapere aude : ose savoir', body: `En 1784, Emmanuel Kant décrit les Lumières comme la sortie de l'humanité d'une minorité dont elle est elle-même responsable : l'incapacité de se servir de son entendement sans la direction d'autrui. Sa devise, empruntée à Horace : *sapere aude*, aie le courage de te servir de ta propre raison.

Cet esprit d'examen critique, de libre discussion et d'éducation guide notre travail : lire les sources avec soin, interroger les mythes confortables et se perfectionner par l'étude.`, buttons: [B('Notre philosophie', '/philosophy')] },
        shared: { image: 'img:orrery', imagePosition: 'right' },
      }),
      S('principles_list', { eyebrow: 'Our principles', heading: 'Six commitments', intro: 'Principles adopted by the modern Covenant to guide its members and its work.', buttons: [B('Read the principles', '/principles', 'secondary')] },
        { fr: { eyebrow: 'Nos principes', heading: 'Six engagements', intro: 'Principes adoptés par le Covenant moderne pour guider ses membres et ses travaux.', buttons: [B('Lire les principes', '/principles', 'secondary')] }, shared: { count: 6 } }),
      S('symbols_list', { eyebrow: 'Symbols', heading: 'Symbols and their interpretations', intro: 'Where historical symbols really come from, and how later myths attached themselves to them.', buttons: [B('All symbols', '/symbols', 'secondary')] },
        { fr: { eyebrow: 'Symboles', heading: 'Symboles et interprétations', intro: "D'où viennent réellement les symboles historiques, et comment les mythes s'y sont attachés.", buttons: [B('Tous les symboles', '/symbols', 'secondary')] }, shared: { count: 2 }, settings: { background: 'charcoal' } }),
      S('text', {
        eyebrow: 'The Covenant', heading: 'A modern society with a historical interest',
        body: `The Eternal Illuminati Covenant is an independent organisation for people who take history, philosophy and self-improvement seriously. Members study the Enlightenment and the Bavarian Illuminati, discuss sources and ideas, and support one another's learning.

We are open about what we are and what we are not. We are not the historical order. We hold no secret power, and we promise no wealth, influence or protection.`,
        buttons: [B('About the Covenant', '/covenant')],
      }, {
        fr: { eyebrow: 'Le Covenant', heading: 'Une société moderne passionnée d’histoire', body: `L'Eternal Illuminati Covenant est une organisation indépendante pour celles et ceux qui prennent au sérieux l'histoire, la philosophie et le perfectionnement personnel. Ses membres étudient les Lumières et les Illuminés de Bavière, discutent des sources et des idées, et s'entraident dans leurs apprentissages.

Nous sommes transparents sur ce que nous sommes et ce que nous ne sommes pas : nous ne sommes pas l'ordre historique, nous ne détenons aucun pouvoir secret, et nous ne promettons ni richesse, ni influence, ni protection.`, buttons: [B('À propos du Covenant', '/covenant')] },
        shared: { image: 'img:pantheon', imagePosition: 'left' },
      }),
      S('articles_list', { eyebrow: 'Publications', heading: 'From the research desk', buttons: [B('All publications', '/publications', 'secondary')] },
        { fr: { eyebrow: 'Publications', heading: 'Nos dernières publications', buttons: [B('Toutes les publications', '/publications', 'secondary')] }, shared: { count: 3, mode: 'articles' } }),
      S('cta', {
        eyebrow: 'Membership', heading: 'An invitation to apply',
        body: 'Membership is open to adults who share a serious interest in history, philosophy and personal development. Every application is read by a person. We offer study, discussion and fellowship. We do not offer wealth, power or influence.',
        buttons: [B('Apply for membership', '/apply'), B('Membership information', '/membership', 'secondary')],
      }, {
        fr: { eyebrow: 'Adhésion', heading: 'Une invitation à candidater', body: "L'adhésion est ouverte aux adultes qui partagent un intérêt sérieux pour l'histoire, la philosophie et le développement personnel. Chaque candidature est lue par une personne. Nous offrons l'étude, la discussion et la fraternité ; pas la richesse, le pouvoir ou l'influence.", buttons: [B('Candidater', '/apply'), B("Informations sur l'adhésion", '/membership', 'secondary')] },
        settings: { background: 'image', bgImage: 'img:admont-library', overlay: 'strong', spacing: 'spacious', align: 'center' },
      }),
      S('faq_list', { eyebrow: 'Questions', heading: 'Frequently asked', buttons: [B('All questions', '/faq', 'secondary')] },
        { fr: { eyebrow: 'Questions', heading: 'Questions fréquentes', buttons: [B('Toutes les questions', '/faq', 'secondary')] }, shared: { count: 4 } }),
      S('cta', { eyebrow: 'Contact', heading: 'Write to us', body: 'Questions about our work, the archive or membership? We read every message.', buttons: [B('Contact us', '/contact', 'secondary')] },
        { fr: { eyebrow: 'Contact', heading: 'Écrivez-nous', body: "Des questions sur nos travaux, les archives ou l'adhésion ? Nous lisons chaque message.", buttons: [B('Nous contacter', '/contact', 'secondary')] }, settings: { background: 'charcoal', align: 'center' } }),
    ],
  },

  // ───────────────────────── OUR HISTORY ─────────────────────────
  {
    slug: 'history', name: 'Our History', sort: 10,
    meta: { title: { en: 'Our History: The Bavarian Illuminati', fr: 'Notre histoire : les Illuminés de Bavière' }, description: { en: 'The documented history of the Bavarian Illuminati (1776–c.1787): origins, founding, Adam Weishaupt, structure, expansion, suppression, and the myths that followed.' } },
    sections: [
      S('hero', { eyebrow: 'Our history', heading: 'The Bavarian Illuminati, 1776–1787', body: 'What is documented, what is disputed, and what was invented later.' }, { fr: { eyebrow: 'Notre histoire', heading: 'Les Illuminés de Bavière, 1776–1787', body: 'Ce qui est documenté, ce qui est contesté, et ce qui a été inventé plus tard.' }, shared: { image: 'img:ingolstadt', height: 'medium' } }),
      S('notice', { heading: 'History, not lineage', body: 'The Eternal Illuminati Covenant is a modern organisation. The Bavarian Illuminati were suppressed in the 1780s, and **no documented organisational continuity** links them to any group today, including ours. On this page we separate established facts from interpretation and from later claims, and we cite our sources.' }, { shared: { tone: 'info' }, settings: { spacing: 'compact' } }),
      S('text', { eyebrow: 'Origins', heading: 'Bavaria in the 1770s', body: `Electoral Bavaria was a Catholic state in which censorship was strict and education had long been dominated by the Society of Jesus. When Pope Clement XIV suppressed the Jesuits in **1773**, chairs at the University of Ingolstadt fell vacant. Among those appointed was **Adam Weishaupt** (1748–1830), who became professor of canon law, a post previously held by Jesuits.

Weishaupt was influenced by the French and German Enlightenment. He clashed with former Jesuits on the faculty and came to believe that reform could only be advanced by a disciplined, discreet association of like-minded men who would educate one another and gradually take positions of influence.` }),
      S('text', { eyebrow: '1 May 1776', heading: 'The founding', body: `On 1 May 1776 Weishaupt and a small group of students founded a society first called the **Bund der Perfektibilisten** ("League of the Perfectibilists"). Within about two years it was known as the **Illuminatenorden**, the Order of the Illuminati.

Members took classical code names. Weishaupt was "Spartacus", and his early collaborator Franz Xaver von Zwackh was "Cato". Cities received code names too: Munich was "Athens" and Ingolstadt "Eleusis". The order kept its own calendar and required members to read prescribed works and to submit regular written reports on their studies and conduct to their superiors.`, buttons: [B('Adam Weishaupt', '/figures/adam-weishaupt', 'secondary')] }, { shared: { image: 'img:weishaupt', imagePosition: 'right', caption: 'Adam Weishaupt (1748–1830), founder of the order.' } }),
      S('text', { eyebrow: 'Structure', heading: 'Grades and membership', body: `The early order had three grades: **Novice, Minerval and Illuminated Minerval**. Its emblem was the owl of Minerva, the classical symbol of wisdom.

From 1780–82, under the influence of Adolph Freiherr Knigge, the system was greatly expanded and linked to Freemasonry. Knigge's scheme grouped the grades into three classes:

- a preparatory "nursery" (Novice, Minerval, Illuminatus Minor);
- Masonic grades (the three craft degrees, followed by Illuminatus Major and Illuminatus Dirigens);
- the "Mysteries", lesser (Priest, Regent) and greater (Magus, Rex). The highest grades appear never to have been fully worked out.

Recruitment was selective and often conducted through existing Masonic lodges.` }, { shared: { image: 'img:minerval', imagePosition: 'left', caption: 'Title page of Weishaupt’s Das verbesserte System der Illuminaten (1788), with the owl of Minerva.' } }),
      S('text', { eyebrow: '1780–1784', heading: 'Expansion', body: `Knigge, who joined in 1780 under the name "Philo", was a gifted recruiter. Around the time of the Masonic **Convent of Wilhelmsbad** (1782), the order gained a foothold in lodges across the Holy Roman Empire.

Members included civil servants, professors, clergy, officers and nobles. Documented members include **Duke Ernst II of Saxe-Gotha-Altenburg**, the publisher **Johann Joachim Christoph Bode**, and, in Weimar, **Johann Wolfgang von Goethe** and **Johann Gottfried Herder**, both of whom joined in 1783.

Historians' estimates of total membership vary, from several hundred active members to around two thousand people recruited over the order's lifetime. Internal tensions grew. Knigge and Weishaupt quarrelled over the order's direction, and Knigge left in **1784**.`, buttons: [B('Historical figures', '/figures', 'secondary')] }, { shared: { image: 'img:knigge', imagePosition: 'right', caption: 'Adolph Freiherr Knigge (1752–1796).' }, settings: { background: 'charcoal' } }),
      S('text', { eyebrow: '1784–1787', heading: 'Government suppression', body: `Elector **Karl Theodor** of Bavaria acted against secret associations in a series of edicts:

- **22 June 1784**: a general prohibition of societies formed without official authorisation;
- **2 March 1785**: an edict naming and banning the Freemasons and the Illuminati;
- **16 August 1787**: a further edict renewing the ban under severe penalties.

Weishaupt lost his professorship and left Bavaria in February 1785, eventually settling in Gotha under the protection of Duke Ernst II. In October 1786 the authorities searched the house of Franz Xaver von Zwackh in Landshut and seized correspondence and documents. In 1787 the government published them as *Einige Originalschriften des Illuminatenordens* to expose the order's aims and methods.` }, { shared: { image: 'img:karl-theodor', imagePosition: 'left', caption: 'Elector Karl Theodor (1724–1799), who banned the order.' } }),
      S('text', { eyebrow: 'After 1787', heading: 'Disappearance', body: `After the edicts and the publication of its papers, the order ceased to function in Bavaria. Former members elsewhere, notably Bode, tried for a time to keep networks alive, but by the early 1790s there is no evidence of the order operating as an organisation.

Weishaupt published defences of his conduct and lived quietly in Gotha until his death on **18 November 1830**.` }, { shared: { image: 'img:weishaupt', imagePosition: 'right', caption: 'Adam Weishaupt lived in exile in Gotha until his death in 1830.' } }),
      S('text', { eyebrow: 'Interpretations', heading: 'Modern interpretations and claims', body: `The order's afterlife has been far longer than its life.

**Documented history.** In 1797–98 the French Jesuit Augustin Barruel and the Scottish physicist John Robison published influential books arguing that the Illuminati had survived and engineered the French Revolution. Historians have found no evidence for this, but the claim spread quickly. In 1798 it fuelled an "Illuminati scare" in New England, led by the minister Jedidiah Morse.

**Later revivals.** In the 1890s, groups in Germany adopted the name (for example Leopold Engel's *Illuminatenorden*). They had no organisational continuity with the original.

**Popular culture.** In the twentieth century, the Illuminati became a staple of conspiracy theories and fiction, helped by satire such as *The Illuminatus! Trilogy* (1975). Widely repeated claims, for example that the order secretly controls governments or that the pyramid on the U.S. one-dollar bill is its emblem, are **not supported by historical evidence**.` }, { shared: { image: 'img:great-seal', imagePosition: 'left', caption: 'The Great Seal of the United States (1782), often wrongly linked to the Illuminati.' }, settings: { background: 'charcoal' } }),
      S('timeline_preview', { eyebrow: 'Timeline', heading: 'Key dates', buttons: [B('Full interactive timeline', '/timeline')] }, { shared: { count: 6 } }),
      S('notice', { heading: 'Sources', body: SOURCES_CORE + '\n- Primary source: *Einige Originalschriften des Illuminatenordens* (Munich, 1787), available in our [archive](/archive).' }, { shared: { tone: 'info' } }),
    ],
  },

  {
    slug: 'timeline', name: 'Historical Timeline', sort: 11,
    meta: { title: { en: 'Historical Timeline', fr: 'Chronologie historique' }, description: { en: 'An interactive timeline of the Bavarian Illuminati and the myths that followed, with sources and certainty labels.' } },
    sections: [
      S('hero', { eyebrow: 'Chronology', heading: 'Historical timeline', body: 'Each entry is labelled as documented, disputed, or tradition/legend.' }, { fr: { eyebrow: 'Chronologie', heading: 'Chronologie historique', body: 'Chaque entrée est indiquée comme documentée, contestée ou relevant de la tradition.' }, shared: { image: 'img:pantheon', height: 'medium' } }),
      S('timeline_full', { heading: '', intro: '' }),
    ],
  },
  {
    slug: 'figures', name: 'Historical Figures', sort: 12,
    meta: { title: { en: 'Historical Figures', fr: 'Personnages historiques' }, description: { en: 'Profiles of the people who shaped, joined and opposed the Bavarian Illuminati, with references.' } },
    sections: [
      S('hero', { eyebrow: 'People', heading: 'Historical figures', body: 'Founders, members and opponents of the Bavarian Illuminati. Only documented information is published here.' }, { fr: { eyebrow: 'Personnages', heading: 'Personnages historiques', body: 'Fondateurs, membres et adversaires des Illuminés de Bavière. Seules des informations documentées sont publiées ici.' }, shared: { image: 'img:goethe', height: 'medium' } }),
      S('figures_list', {}),
    ],
  },
  {
    slug: 'philosophy', name: 'Philosophy', sort: 20,
    meta: { title: { en: 'Philosophy', fr: 'Philosophie' }, description: { en: 'Reason, education, intellectual freedom and personal development: the Enlightenment traditions behind our work.' } },
    sections: [
      S('hero', { eyebrow: 'Philosophy', heading: 'The courage to use one’s own reason', body: 'The Enlightenment traditions that inspire our study.' }, { fr: { eyebrow: 'Philosophie', heading: 'Le courage de se servir de sa propre raison', body: 'Les traditions des Lumières qui inspirent nos études.' }, shared: { image: 'img:orrery', height: 'large' } }),
      S('text', { eyebrow: 'Reason', heading: 'Reason as a shared practice', body: `Eighteenth-century thinkers did not treat reason as a possession of the clever few. For them it was a public practice: arguments are tested in the open, evidence is weighed, and conclusions stay open to revision.

We try to work the same way. We read primary sources, compare interpretations, and change our minds when the evidence requires it.` }),
      S('quote', { quote: 'Enlightenment is man’s emergence from his self-incurred immaturity. Sapere aude! Have courage to use your own understanding!', attribution: 'Immanuel Kant, “An Answer to the Question: What Is Enlightenment?” (1784)' }, { shared: { image: 'img:kant' }, settings: { background: 'charcoal', align: 'center' } }),
      S('text', { eyebrow: 'Education', heading: 'Learning for life', body: `The reformers of the 1770s believed that education, more than birth or rank, should shape a person's place in society. Lifelong learning remains at the centre of our work: reading groups, research notes, shared bibliographies and careful writing.` }, { shared: { image: 'img:admont-library', imagePosition: 'right' } }),
      S('text', { eyebrow: 'Intellectual freedom', heading: 'Freedom to inquire', body: `Censorship shaped the world in which the Illuminati were founded and suppressed. We value the freedom to ask difficult questions, and with it the responsibility to answer them honestly, to respect people who disagree, and to distinguish what we know from what we merely suspect.` }),
      S('text', { eyebrow: 'Personal development', heading: 'Perfectibility, reconsidered', body: `The order's first name, the *Perfectibilists*, expressed an Enlightenment hope that human beings can improve. We interpret that hope modestly: through discipline, reflection, service and sustained effort, each of us can become wiser and more useful to others than we were.` }, { settings: { background: 'charcoal' } }),
      S('cta', { heading: 'Explore our principles', body: 'Six commitments that guide the modern Covenant.', buttons: [B('Our principles', '/principles')] }, { settings: { align: 'center' } }),
    ],
  },
  {
    slug: 'principles', name: 'Principles', sort: 21,
    meta: { title: { en: 'Our Principles', fr: 'Nos principes' }, description: { en: 'The principles adopted by the Eternal Illuminati Covenant.' } },
    sections: [
      S('hero', { eyebrow: 'Principles', heading: 'Our principles', body: 'Adopted by the modern Covenant. These are not the statutes of the historical order.' }, { fr: { eyebrow: 'Principes', heading: 'Nos principes', body: "Adoptés par le Covenant moderne. Il ne s'agit pas des statuts de l'ordre historique." }, shared: { image: 'img:pantheon', height: 'medium' } }),
      S('principles_list', {}),
    ],
  },
  {
    slug: 'symbols', name: 'Symbols & Interpretations', sort: 13,
    meta: { title: { en: 'Symbols and Interpretations', fr: 'Symboles et interprétations' }, description: { en: 'Historical symbols associated with the Illuminati: origins, documented meanings and later interpretations.' } },
    sections: [
      S('hero', { eyebrow: 'Symbolism', heading: 'Symbols and interpretations', body: 'Origins, documented meanings, and the stories later told about them.' }, { fr: { eyebrow: 'Symbolique', heading: 'Symboles et interprétations', body: 'Origines, significations documentées, et récits ultérieurs.' }, shared: { image: 'img:great-seal', height: 'medium' } }),
      S('notice', { heading: 'Fact and speculation', body: 'Many symbols popularly linked to the "Illuminati" were never used by the Bavarian order. For each symbol we state its documented origin first, then later interpretations, clearly labelled. Unsupported conspiracy theories are described as claims, not facts.' }, { shared: { tone: 'caution' }, settings: { spacing: 'compact' } }),
      S('symbols_list', {}),
    ],
  },

  // ───────────────────────── THE COVENANT ─────────────────────────
  {
    slug: 'covenant', name: 'The Covenant', sort: 30,
    meta: { title: { en: 'The Covenant', fr: 'Le Covenant' }, description: { en: 'Who we are: the identity, mission, vision, governance and activities of the Eternal Illuminati Covenant.' } },
    sections: [
      S('hero', { eyebrow: 'Who we are', heading: 'The Covenant', body: 'An independent, modern organisation, open about what it is and what it is not.' }, { fr: { eyebrow: 'Qui sommes-nous', heading: 'Le Covenant', body: "Une organisation moderne et indépendante, transparente sur ce qu'elle est et ce qu'elle n'est pas." }, shared: { image: 'img:pantheon', height: 'medium' } }),
      S('text', { eyebrow: 'Identity', heading: 'What we are', body: `The Eternal Illuminati Covenant is an **independently established, modern organisation**. It takes its inspiration from the Enlightenment and studies the history of the Bavarian Illuminati.

**What we are not:**

- We are not the Bavarian Illuminati, and we claim no historical continuity with them.
- We are not connected to any other organisation using the word "Illuminati".
- We do not offer wealth, fame, power, protection or influence, and we never ask for money in exchange for such promises.` }),
      S('text', { eyebrow: 'Mission', heading: 'Our mission', body: 'To promote the study of the Enlightenment and of the Bavarian Illuminati through careful, source-based research, and to support members in lifelong learning, critical thinking and personal development.' }, { settings: { background: 'charcoal' } }),
      S('text', { eyebrow: 'Vision', heading: 'Our vision', body: 'A community in which curiosity, reason and integrity are practised together, and in which history is studied honestly rather than mythologised.' }),
      S('principles_list', { eyebrow: 'Principles', heading: 'Independently established principles' }, { shared: { count: 6 } }),
      S('text', { eyebrow: 'Founding', heading: 'Founding information', body: '[To be completed by the Covenant: date and place of founding, founders (only with their consent), legal form and registration details if any.]' }, { visible: false }),
      S('text', { eyebrow: 'Background', heading: 'Organisational background', body: '[To be completed by the Covenant: how the organisation came into being and how it has developed.]' }, { visible: false }),
      S('text', { eyebrow: 'Governance', heading: 'How the Covenant is governed', body: '[To be completed by the Covenant: governing body, decision-making, terms of office. See also the Governance & Accountability page.]' }, { visible: false }),
      S('text', { eyebrow: 'Activities', heading: 'What we actually do', body: '[To be completed by the Covenant: list only activities that genuinely take place, e.g. reading groups, lectures, publications, with frequency and location or format.]' }, { visible: false }),
      S('cta', { heading: 'Leadership and governance', body: 'Learn who leads the Covenant and how it is held accountable.', buttons: [B('Leadership & governance', '/leadership'), B('Code of conduct', '/code-of-conduct', 'secondary')] }, { settings: { align: 'center', background: 'charcoal' } }),
    ],
  },
  {
    slug: 'leadership', name: 'Leadership & Governance', sort: 31,
    meta: { title: { en: 'Leadership and Governance', fr: 'Direction et gouvernance' }, description: { en: 'Leadership profiles and governance of the Eternal Illuminati Covenant.' } },
    sections: [
      S('hero', { eyebrow: 'Leadership', heading: 'Leadership and governance', body: 'Profiles are published only with verified information.' }, { fr: { eyebrow: 'Direction', heading: 'Direction et gouvernance', body: 'Les profils ne sont publiés qu’avec des informations vérifiées.' }, shared: { height: 'medium' } }),
      S('text', { eyebrow: 'Governance', heading: 'Governance structure', body: '[To be completed by the Covenant: describe the governing body, roles and how leaders are appointed.]' }, { visible: false }),
      S('leadership_list', { heading: 'Leadership' }),
      S('cta', { heading: 'Accountability', body: 'How the Covenant handles conduct, complaints and personal data.', buttons: [B('Governance & accountability', '/governance', 'secondary')] }, { settings: { align: 'center' } }),
    ],
  },

  // ───────────────────────── MEMBERSHIP ─────────────────────────
  {
    slug: 'membership', name: 'Membership', sort: 40,
    meta: { title: { en: 'Membership', fr: 'Adhésion' }, description: { en: 'Eligibility, requirements, expectations, review process and privacy for membership applications.' } },
    sections: [
      S('hero', { eyebrow: 'Membership', heading: 'Membership information', body: 'Everything you should know before you apply.', buttons: [B('Apply now', '/apply'), B('Application guide', '/application-guide', 'secondary')] }, { fr: { eyebrow: 'Adhésion', heading: "Informations sur l'adhésion", body: 'Tout ce que vous devez savoir avant de candidater.', buttons: [B('Candidater', '/apply'), B('Guide de candidature', '/application-guide', 'secondary')] }, shared: { image: 'img:admont-library', height: 'large' } }),
      S('text', { eyebrow: 'What we represent', heading: 'A community of study', body: 'Members share an interest in the Enlightenment, in the history of the Bavarian Illuminati, and in personal development through learning. Membership means taking part in that work: reading, discussing, writing and helping others learn.' }),
      S('text', { eyebrow: 'Eligibility', heading: 'Who may apply', body: `- Adults aged **18 or over**.
- From any country, background or belief.
- With a genuine interest in history, philosophy and self-improvement.
- Willing to follow our [Code of Conduct](/code-of-conduct).` }, { settings: { background: 'charcoal' } }),
      S('text', { eyebrow: 'Requirements', heading: 'What the application asks', body: `The application has four steps: personal information, background, motivation, and a final review. It takes about 15–20 minutes. You may attach up to three supporting documents, but you do not have to. **Applying is free**, and you do not need to create an account.` }),
      S('text', { eyebrow: 'Expectations', heading: 'What is expected of members', body: '- Honesty and respect towards other members and the public.\n- Willingness to learn and to share knowledge.\n- Care in distinguishing fact from speculation.\n- Discretion about other members\' personal information.' }, { settings: { background: 'charcoal' } }),
      S('text', { eyebrow: 'Review', heading: 'How applications are reviewed', body: `1. You confirm your email address using the link we send you.
2. An authorised reviewer reads your application.
3. We may email you to ask for more information.
4. You receive a decision by email.

Review times vary. You will receive an email at each important stage.` }),
      S('text', { eyebrow: 'Privacy', heading: 'Privacy and confidentiality', body: 'Applications are visible only to authorised administrators. They are never published, sold or used for marketing. Unconfirmed applications are deleted automatically after 7 days. See our [Privacy Policy](/privacy) and [Data Protection](/data-protection) pages.' }, { settings: { background: 'charcoal' } }),
      S('notice', { heading: 'What membership does not offer', body: 'Membership does **not** bring wealth, fame, power, political influence, business advantages, protection or access to "elite" networks. **We will never ask you for money transfers, gift cards, cryptocurrency or banking details by email or social media.** If anyone makes such offers in our name, please [report it](/report).' }, { shared: { tone: 'caution' } }),
      S('cta', { heading: 'Ready to apply?', body: 'It takes about 15 minutes and you can save your progress.', buttons: [B('Start your application', '/apply')] }, { settings: { align: 'center' } }),
    ],
  },
  {
    slug: 'apply', name: 'Apply', sort: 41,
    meta: { title: { en: 'Apply for Membership', fr: 'Candidater' }, description: { en: 'Apply to join the Eternal Illuminati Covenant. No account needed.' } },
    sections: [
      S('hero', { eyebrow: 'Membership', heading: 'Apply for membership', body: 'Four short steps. No account needed. Your progress can be saved and finished later.' }, { fr: { eyebrow: 'Adhésion', heading: 'Candidater', body: 'Quatre étapes. Aucun compte nécessaire. Vous pouvez enregistrer et terminer plus tard.' }, shared: { height: 'medium', image: 'img:admont-library' } }),
      S('application_form', { heading: '', intro: 'Before you begin, please read the [membership information](/membership) and the [application guide](/application-guide). Fields marked * are required.' }, { fr: { intro: "Avant de commencer, veuillez lire les [informations sur l'adhésion](/membership) et le [guide de candidature](/application-guide). Les champs marqués * sont obligatoires." } }),
    ],
  },
  {
    slug: 'application-guide', name: 'Application Guide', sort: 42,
    meta: { title: { en: 'Application Guide', fr: 'Guide de candidature' }, description: { en: 'Step-by-step guidance for completing a membership application.' } },
    sections: [
      S('hero', { eyebrow: 'Guide', heading: 'Application guide', body: 'How to complete each step, and what happens next.' }, { shared: { height: 'medium' } }),
      S('text', { heading: 'Step by step', body: `**Step 1: Personal information.** Your name, email address and country. Use an email address you check regularly: everything we send goes there.

**Step 2: Background.** Your occupation, relevant experience and interests. There are no "right" answers, and formal qualifications are not required.

**Step 3: Motivation.** Why you want to apply, what you understand about the Covenant, and what you hope to contribute. Please write in your own words.

**Step 4: Review and submit.** Check your answers, read the privacy notice, and confirm your consent. You can go back to correct anything.

**Save and continue later.** Use "Save and continue later" at any point. We will email you a private link that is valid for 7 days.

**After you submit.** We will email you a link to confirm your address. Your application is reviewed only after you confirm it, and unconfirmed applications are deleted after 7 days.

**Questions or changes.** Use the form on our [contact page](/contact) with your reference number. You can also withdraw your application there at any time.` }),
      S('cta', { heading: 'Begin your application', buttons: [B('Apply now', '/apply')] }, { settings: { align: 'center', background: 'charcoal' } }),
    ],
  },

  // ───────────────────────── LIBRARY ─────────────────────────
  {
    slug: 'publications', name: 'Publications', sort: 50,
    meta: { title: { en: 'Publications', fr: 'Publications' }, description: { en: 'Articles and research notes on the Enlightenment and the Bavarian Illuminati.' } },
    sections: [
      S('hero', { eyebrow: 'Newsroom', heading: 'Publications', body: 'Articles, research notes and essays.' }, { fr: { eyebrow: 'Actualités', heading: 'Publications', body: 'Articles, notes de recherche et essais.' }, shared: { height: 'medium', image: 'img:orrery' } }),
      S('articles_list', {}, { shared: { mode: 'articles', filters: true, count: 0 } }),
    ],
  },
  {
    slug: 'announcements', name: 'Official Announcements', sort: 51,
    meta: { title: { en: 'Official Announcements', fr: 'Annonces officielles' }, description: { en: 'Official announcements from the Eternal Illuminati Covenant.' } },
    sections: [
      S('hero', { eyebrow: 'Official', heading: 'Announcements', body: 'Official notices from the Covenant. If you see an “announcement” elsewhere that is not listed here, it is not from us.' }, { fr: { eyebrow: 'Officiel', heading: 'Annonces', body: "Communications officielles du Covenant. Une « annonce » publiée ailleurs et absente d'ici ne vient pas de nous." }, shared: { height: 'medium' } }),
      S('articles_list', {}, { shared: { mode: 'announcements', count: 0 } }),
    ],
  },
  {
    slug: 'archive', name: 'Research Library & Archive', sort: 52,
    meta: { title: { en: 'Research Library and Historical Archive', fr: 'Bibliothèque et archives' }, description: { en: 'Historical documents, images, manuscripts and research references, with licence information.' } },
    sections: [
      S('hero', { eyebrow: 'Archive', heading: 'Research library & historical archive', body: 'Primary sources, images and references, each with its source and licence.' }, { fr: { eyebrow: 'Archives', heading: 'Bibliothèque et archives historiques', body: 'Sources primaires, images et références, avec leur source et leur licence.' }, shared: { height: 'medium', image: 'img:admont-library' } }),
      S('notice', { heading: 'Copyright', body: 'We publish or link only material that is in the public domain, openly licensed, or used with permission. The licence is stated on every item. If you believe an item infringes your rights, please [contact us](/report).' }, { shared: { tone: 'info' }, settings: { spacing: 'compact' } }),
      S('archive_list', {}),
    ],
  },

  // ───────────────────────── SUPPORT & LEGAL ─────────────────────────
  {
    slug: 'faq', name: 'FAQ', sort: 60,
    meta: { title: { en: 'Frequently Asked Questions', fr: 'Questions fréquentes' }, description: { en: 'Answers about the Covenant, the history of the Illuminati, membership and privacy.' } },
    sections: [
      S('hero', { eyebrow: 'Help', heading: 'Frequently asked questions' }, { fr: { eyebrow: 'Aide', heading: 'Questions fréquentes' }, shared: { height: 'medium' } }),
      S('faq_list', {}),
      S('cta', { heading: 'Still have a question?', buttons: [B('Contact us', '/contact')] }, { settings: { align: 'center', background: 'charcoal' } }),
    ],
  },
  {
    slug: 'contact', name: 'Contact', sort: 61,
    meta: { title: { en: 'Contact Us', fr: 'Contact' }, description: { en: 'Contact the Eternal Illuminati Covenant, or write to us about your application.' } },
    sections: [
      S('hero', { eyebrow: 'Contact', heading: 'Contact us' }, { fr: { eyebrow: 'Contact', heading: 'Nous contacter' }, shared: { height: 'medium' } }),
      S('contact_form', { eyebrow: 'General enquiries', heading: 'Send a message', intro: 'We aim to reply to every genuine message. Please do not send passwords, banking details or identity documents through this form.' }, { fr: { eyebrow: 'Demandes générales', heading: 'Envoyer un message', intro: "Nous nous efforçons de répondre à chaque message. N'envoyez ni mot de passe, ni coordonnées bancaires, ni pièce d'identité via ce formulaire." } }),
      S('applicant_forms', {}, { settings: { background: 'charcoal' } }),
    ],
  },
  {
    slug: 'report', name: 'Report an Issue', sort: 62,
    meta: { title: { en: 'Report an Issue', fr: 'Signaler un problème' }, description: { en: 'Report impersonation, scams, conduct concerns, copyright issues or website problems.' } },
    sections: [
      S('hero', { eyebrow: 'Report', heading: 'Report an issue' }, { fr: { eyebrow: 'Signalement', heading: 'Signaler un problème' }, shared: { height: 'medium' } }),
      S('report_form', { heading: 'Confidential report', intro: 'Use this form to report:\n\n- someone claiming to represent the Covenant and asking for money;\n- a conduct concern involving a member;\n- a copyright or accuracy problem on this website;\n- a technical problem.\n\nReports are read only by authorised administrators.' }),
    ],
  },
  legal('code-of-conduct', 'Code of Conduct', 'Code of Conduct', `## Purpose
This code sets out the standards of behaviour expected of every member, applicant and volunteer of the Eternal Illuminati Covenant, online and in person.

## We expect members to
- treat others with courtesy and respect, whatever their background, belief or opinion;
- argue with evidence, cite sources, and distinguish fact from speculation;
- respect the privacy of members and applicants, and never share personal information without consent;
- represent the Covenant honestly and never claim powers, connections or benefits it does not have.

## We do not tolerate
- harassment, discrimination, threats or intimidation;
- fraud, including asking anyone for money with promises of wealth, power or protection;
- impersonating the Covenant, its officers or its communications;
- spreading claims about real people that you know, or should know, to be false.

## Reporting and consequences
Concerns can be raised confidentially through the [Report an Issue](/report) page. Breaches may lead to a warning, suspension or termination of membership, and illegal conduct may be reported to the authorities.`),
  legal('governance', 'Governance & Accountability', 'Governance and Accountability', `## Independence
The Eternal Illuminati Covenant is an independent organisation. It is not affiliated with any other organisation that uses the word "Illuminati".

## Decision-making
[To be completed by the Covenant: describe the governing body, how members of it are chosen, and how decisions are recorded.]

## Accountability
- Administrator access to applicant data is limited by role and recorded in an audit log.
- Every change to public content is versioned and can be traced to the administrator who made it.
- Complaints can be raised through the [Report an Issue](/report) page and are reviewed by an administrator who was not involved in the matter.

## Honesty in communication
We publish only verified information about our leadership and activities. Historical content cites its sources and labels disputed or legendary material.`),
  legal('privacy', 'Privacy Policy', 'Privacy Policy', `*Last updated: November 2026. This policy should be reviewed by a qualified adviser before publication.*

## Who we are
The Eternal Illuminati Covenant ("we") is responsible for the personal data described here. Contact: the email address shown in the website footer.

## What we collect
- **Membership applications:** name, email address, country, optional phone number, your answers to the application questions, optional supporting documents, your consent record, and the language you used.
- **Contact and report forms:** name, email address, subject, message and (for reports) an optional page address.
- **Technical data:** to prevent abuse we store a one-way hash of your IP address alongside form submissions. We do not keep raw IP addresses for public forms.

## Why we use it
- To review membership applications and to communicate with you about them (your consent, and steps taken at your request).
- To answer messages and handle reports (our legitimate interest in responding).
- To protect the website against spam and abuse (our legitimate interest).

## Who can see it
Only authorised administrators, according to their role. We do not sell personal data or use it for advertising. We use these service providers:
- **Cloudflare** for hosting, database and file storage;
- **Resend** for delivering transactional emails.

## How long we keep it
- Unconfirmed applications are deleted automatically after **7 days**.
- Decided or withdrawn applications are kept for the retention period set by the Covenant (currently up to two years) and then deleted.
- Saved "continue later" drafts expire after 7 days.

## Cookies
The public website sets no tracking or advertising cookies. Administrators receive a strictly necessary session cookie when they sign in. If cookieless web analytics are enabled, they collect no personal data.

## Your rights
Depending on where you live, you may have the right to access, correct or delete your data, to restrict or object to its use, to data portability, and to withdraw consent at any time. You can withdraw an application through the [contact page](/contact). For other requests, write to us. You may also complain to your data protection authority.`),
  legal('terms', 'Terms and Conditions', 'Terms and Conditions', `*Last updated: November 2026. These terms should be reviewed by a qualified adviser before publication.*

## Use of this website
You may browse and share content from this website for personal, non-commercial purposes. Archive items are subject to the licence stated on each item.

## Accuracy
We take care to distinguish documented history from interpretation and legend, and we cite our sources. Historical scholarship changes, so if you find an error, please [tell us](/report).

## Membership application terms
- Applying is free. Submitting an application does not create membership or any contractual right to membership.
- The information you provide must be true and your own.
- Every application is reviewed individually. We are not required to give reasons for a decision.
- Membership confers no financial, professional, political or legal benefits, and **no one may ask you for money in exchange for membership or its supposed benefits**.
- You may withdraw your application at any time.

## Prohibited use
You must not misuse the forms, attempt to gain unauthorised access, or impersonate the Covenant.

## Changes
We may update these terms. The date at the top shows the latest version.`),
  legal('data-protection', 'Data Protection Information', 'Data Protection Information', `## Our approach
We collect only what we need to review applications and answer messages, keep it secure, and delete it when it is no longer needed.

## Security measures
- All traffic is encrypted (HTTPS).
- Administrator passwords are stored only as salted, peppered PBKDF2 hashes. Optional two-step verification is available.
- Access to applications is limited by role, and every view, export and decision is logged.
- Supporting documents are stored privately and are never publicly accessible.
- Regular backups are kept in private storage for 30 days.

## Data subject requests
To access, correct or delete your data, write to us from the email address you used. For applications, include your reference number. We may verify your identity before acting on a request.

## Data breaches
If a breach affecting your data occurs, we will assess it promptly and notify you and the relevant authority where the law requires.

See also our [Privacy Policy](/privacy).`),
];

function legal(slug, name, title, body) {
  return {
    slug, name, sort: 70,
    meta: { title: { en: title }, description: { en: `${title}: Eternal Illuminati Covenant.` } },
    sections: [
      S('hero', { eyebrow: 'Information', heading: title }, { shared: { height: 'medium' } }),
      S('text', { body }),
    ],
  };
}

// ───────────────────────── Navigation ─────────────────────────
export const nav = [
  { key: 'history', location: 'header', label: { en: 'History', fr: 'Histoire' }, href: '/history', children: [
    { label: { en: 'Our History', fr: 'Notre histoire' }, href: '/history' },
    { label: { en: 'Historical Timeline', fr: 'Chronologie' }, href: '/timeline' },
    { label: { en: 'Historical Figures', fr: 'Personnages historiques' }, href: '/figures' },
    { label: { en: 'Symbols & Interpretations', fr: 'Symboles et interprétations' }, href: '/symbols' },
  ] },
  { key: 'philosophy', location: 'header', label: { en: 'Philosophy', fr: 'Philosophie' }, href: '/philosophy', children: [
    { label: { en: 'Philosophy', fr: 'Philosophie' }, href: '/philosophy' },
    { label: { en: 'Principles', fr: 'Principes' }, href: '/principles' },
  ] },
  { key: 'covenant', location: 'header', label: { en: 'The Covenant', fr: 'Le Covenant' }, href: '/covenant', children: [
    { label: { en: 'The Covenant', fr: 'Le Covenant' }, href: '/covenant' },
    { label: { en: 'Leadership & Governance', fr: 'Direction et gouvernance' }, href: '/leadership' },
    { label: { en: 'Governance & Accountability', fr: 'Gouvernance et responsabilité' }, href: '/governance' },
    { label: { en: 'Code of Conduct', fr: 'Code de conduite' }, href: '/code-of-conduct' },
  ] },
  { key: 'library', location: 'header', label: { en: 'Library', fr: 'Bibliothèque' }, href: '/archive', children: [
    { label: { en: 'Research Archive', fr: 'Archives' }, href: '/archive' },
    { label: { en: 'Publications', fr: 'Publications' }, href: '/publications' },
    { label: { en: 'Announcements', fr: 'Annonces' }, href: '/announcements' },
  ] },
  { key: 'membership', location: 'header', label: { en: 'Membership', fr: 'Adhésion' }, href: '/membership', children: [
    { label: { en: 'Membership', fr: 'Adhésion' }, href: '/membership' },
    { label: { en: 'Application Guide', fr: 'Guide de candidature' }, href: '/application-guide' },
    { label: { en: 'FAQ', fr: 'FAQ' }, href: '/faq' },
  ] },
  { key: 'contact', location: 'header', label: { en: 'Contact', fr: 'Contact' }, href: '/contact' },
  { key: 'apply', location: 'header', label: { en: 'Apply', fr: 'Candidater' }, href: '/apply', isButton: true },
  ...[
    ['Our History', 'Notre histoire', '/history'], ['Timeline', 'Chronologie', '/timeline'], ['Publications', 'Publications', '/publications'],
    ['Archive', 'Archives', '/archive'], ['Membership', 'Adhésion', '/membership'], ['FAQ', 'FAQ', '/faq'], ['Contact', 'Contact', '/contact'], ['Report an Issue', 'Signaler un problème', '/report'],
  ].map(([en, fr, href]) => ({ location: 'footer', label: { en, fr }, href })),
  ...[
    ['Privacy Policy', 'Confidentialité', '/privacy'], ['Terms & Conditions', 'Conditions', '/terms'], ['Data Protection', 'Protection des données', '/data-protection'],
    ['Code of Conduct', 'Code de conduite', '/code-of-conduct'], ['Governance & Accountability', 'Gouvernance', '/governance'],
  ].map(([en, fr, href]) => ({ location: 'legal', label: { en, fr }, href })),
];

// ───────────────────────── Timeline ─────────────────────────
const ERA = { pre: 'Before the order', order: 'The order', supp: 'Suppression', after: 'Afterlife & myth' };
const ERA_FR = { pre: "Avant l'ordre", order: "L'ordre", supp: 'Répression', after: 'Postérité et mythe' };
const ev = (slug, year, date, era, title, summary, body, opts = {}) => ({ slug, year, date_label: date, era: ERA[era], title, summary, body, image: opts.image ?? '', image_alt: opts.alt ?? '', certainty: opts.certainty ?? 'documented', sources: opts.sources ?? '', sort: opts.sort ?? 0, i18n: opts.fr ? { fr: { era: ERA_FR[era], ...opts.fr } } : { fr: { era: ERA_FR[era] } } });

export const events = [
  ev('birth-of-adam-weishaupt', 1748, '6 February 1748', 'pre', 'Birth of Adam Weishaupt', 'Johann Adam Weishaupt is born in Ingolstadt, Bavaria. Orphaned young, he is raised under the guidance of his godfather, the jurist Johann Adam von Ickstatt.', 'Weishaupt was educated at a Jesuit school and later studied at the University of Ingolstadt, where his godfather, the reform-minded jurist Johann Adam Freiherr von Ickstatt, was an influential figure.', { image: 'img:weishaupt', alt: 'Portrait of Adam Weishaupt', fr: { title: "Naissance d'Adam Weishaupt", date_label: '6 février 1748', summary: "Johann Adam Weishaupt naît à Ingolstadt, en Bavière. Orphelin jeune, il est élevé sous la tutelle de son parrain, le juriste Johann Adam von Ickstatt." }, sources: '- van Dülmen (1975).' }),
  ev('suppression-of-the-jesuits', 1773, '21 July 1773', 'pre', 'The Jesuits are suppressed', 'Pope Clement XIV dissolves the Society of Jesus. At Ingolstadt, Weishaupt takes the chair of canon law, a post previously held by Jesuits.', 'The papal brief *Dominus ac Redemptor* suppressed the Jesuit order, which had dominated higher education in Bavaria. The resulting vacancies opened academic posts to lay scholars such as Weishaupt, and fuelled lasting tensions between former Jesuits and reformers at the university.', { fr: { title: 'Suppression des jésuites', date_label: '21 juillet 1773' }, sources: '- van Dülmen (1975); Agethen (1984).' }),
  ev('founding-of-the-order', 1776, '1 May 1776', 'order', 'Founding of the order', 'Weishaupt and a small group of students found the "Bund der Perfektibilisten", soon to be known as the Order of the Illuminati.', 'The founding meeting took place in Ingolstadt. The society began very small and recruited cautiously among students and young officials. Members adopted classical code names; Weishaupt was "Spartacus".', { image: 'img:ingolstadt', alt: 'The former university building (Hohe Schule) in Ingolstadt', fr: { title: "Fondation de l'ordre", date_label: '1er mai 1776', summary: "Weishaupt et quelques étudiants fondent le « Bund der Perfektibilisten », bientôt appelé Ordre des Illuminés." }, sources: SOURCES_CORE }),
  ev('weishaupt-becomes-a-freemason', 1777, '1777', 'order', 'Weishaupt becomes a Freemason', 'Weishaupt is initiated into Freemasonry in Munich, beginning the long, uneasy relationship between the order and Masonic lodges.', 'Weishaupt hoped that Masonic lodges would provide cover and recruits. Later the order would systematically recruit within lodges.', { fr: { title: 'Weishaupt devient franc-maçon', date_label: '1777' }, sources: '- Agethen (1984).' }),
  ev('knigge-joins', 1780, '1780', 'order', 'Adolph Knigge joins', 'The writer and Freemason Adolph Freiherr Knigge ("Philo") joins and begins reorganising the order’s grades and recruiting widely.', 'Knigge brought energy, Masonic contacts and a systematic structure of grades. His reforms of 1781–82 greatly expanded the order.', { image: 'img:knigge', alt: 'Portrait of Adolph Freiherr Knigge', fr: { title: "Adhésion d'Adolph Knigge", date_label: '1780' }, sources: '- van Dülmen (1975).' }),
  ev('convent-of-wilhelmsbad', 1782, 'July–September 1782', 'order', 'Convent of Wilhelmsbad', 'A major congress of German Freemasonry meets at Wilhelmsbad near Hanau. The Illuminati use the period to extend their influence among lodges.', 'The convent addressed the future of the Strict Observance rite. Illuminati recruiters, Knigge above all, used the upheaval to win members.', { fr: { title: 'Convent de Wilhelmsbad', date_label: 'juillet–septembre 1782' }, sources: '- Le Forestier (1914); Agethen (1984).' }),
  ev('goethe-and-herder-join', 1783, '1783', 'order', 'Goethe and Herder join in Weimar', 'Johann Wolfgang von Goethe (as "Abaris") and Johann Gottfried Herder join the order in Weimar.', 'Their membership is documented in the order’s records. Historians debate how active either man was; neither played a leading role.', { image: 'img:goethe', alt: 'Portrait of Johann Wolfgang von Goethe', fr: { title: 'Goethe et Herder rejoignent l’ordre à Weimar', date_label: '1783' }, sources: '- Schüttler (1991); W. Daniel Wilson, *Geheimräte gegen Geheimbünde* (Stuttgart: Metzler, 1991).' }),
  ev('first-edict', 1784, '22 June 1784', 'supp', 'First edict against secret societies', 'Elector Karl Theodor prohibits all societies formed without official authorisation.', 'The edict did not name the Illuminati, but it signalled growing official hostility to clandestine associations in Bavaria.', { image: 'img:karl-theodor', alt: 'Portrait of Elector Karl Theodor', sort: 1, fr: { title: 'Premier édit contre les sociétés secrètes', date_label: '22 juin 1784' }, sources: '- van Dülmen (1975).' }),
  ev('knigge-leaves', 1784, '1784', 'order', 'Knigge leaves the order', 'After bitter disputes with Weishaupt over leadership and direction, Knigge withdraws from the order.', 'The quarrel concerned authority within the order and the content of its higher grades.', { sort: 2, fr: { title: "Knigge quitte l'ordre", date_label: '1784' }, sources: '- van Dülmen (1975).' }),
  ev('second-edict', 1785, '2 March 1785', 'supp', 'The Illuminati are banned by name', 'A second edict explicitly prohibits the Freemasons and the Illuminati in Bavaria. Weishaupt has already lost his post and left Ingolstadt.', 'Weishaupt fled in February 1785, first to Regensburg and later to Gotha. Members in state service faced dismissal.', { fr: { title: 'Les Illuminés interdits nommément', date_label: '2 mars 1785' }, sources: '- van Dülmen (1975).' }),
  ev('the-courier-and-the-lightning', 1785, '1785', 'supp', 'The courier struck by lightning', 'A popular story holds that a courier carrying the order’s papers was killed by lightning near Regensburg, exposing its secrets.', 'A cleric named Lanz is reported to have died after a lightning strike in 1785. The claim that papers found on him exposed the order is a later tradition, and it is poorly supported. The decisive documents were seized in the 1786 search of Zwackh’s house.', { certainty: 'legend', sort: 2, fr: { title: 'Le courrier foudroyé', date_label: '1785' } }),
  ev('search-of-zwackhs-house', 1786, '11–12 October 1786', 'supp', 'Search of Zwackh’s house', 'Authorities search the house of Franz Xaver von Zwackh in Landshut and seize the order’s correspondence and documents.', 'The seized papers included letters, statutes and lists. They gave the government material to discredit the order.', { fr: { title: 'Perquisition chez Zwackh', date_label: '11–12 octobre 1786' }, sources: '- *Einige Originalschriften des Illuminatenordens* (Munich, 1787).' }),
  ev('publication-of-the-original-writings', 1787, '1787', 'supp', 'The order’s papers are published', 'The Bavarian government prints the seized documents as *Einige Originalschriften des Illuminatenordens*. A third edict (16 August 1787) renews the ban.', 'Publication was meant to expose the order publicly. It also preserved the order’s papers, which became key sources for historians.', { image: 'img:minerval', alt: 'Title page of Das verbesserte System der Illuminaten (1788)', fr: { title: "Publication des écrits de l'ordre", date_label: '1787' }, sources: '- *Einige Originalschriften des Illuminatenordens* (Munich, 1787).' }),
  ev('barruel-and-robison', 1797, '1797–1798', 'after', 'Barruel and Robison', 'Augustin Barruel and John Robison publish books claiming the Illuminati survived and caused the French Revolution.', 'These works shaped the conspiracy-theory image of the Illuminati for two centuries. Historians find no evidence that the suppressed order survived or directed the Revolution.', { image: '', alt: 'Title page of John Robison’s Proofs of a Conspiracy', fr: { title: 'Barruel et Robison', date_label: '1797–1798' }, sources: '- John Robison, *Proofs of a Conspiracy* (Edinburgh, 1797).\n- Augustin Barruel, *Mémoires pour servir à l’histoire du Jacobinisme* (London, 1797–98).' }),
  ev('new-england-illuminati-scare', 1798, '1798', 'after', 'The New England "Illuminati scare"', 'Sermons by Jedidiah Morse spread fears of Illuminati subversion in the United States.', 'The episode is the subject of Vernon Stauffer’s classic study. It shows how quickly the claim travelled and how it was used in partisan politics.', { fr: { title: 'La « peur des Illuminés » en Nouvelle-Angleterre', date_label: '1798' }, sources: '- Stauffer (1918).' }),
  ev('death-of-weishaupt', 1830, '18 November 1830', 'after', 'Death of Adam Weishaupt', 'Weishaupt dies in Gotha, where he had lived since the 1780s under the protection of Duke Ernst II.', 'In exile he published several works defending himself and the order’s intentions.', { fr: { title: "Mort d'Adam Weishaupt", date_label: '18 novembre 1830' }, sources: '- van Dülmen (1975).' }),
  ev('later-revivals', 1896, '1890s', 'after', 'Revivals in name only', 'Groups in Germany, including Leopold Engel’s Illuminatenorden, adopt the name. None has any organisational continuity with the original order.', 'Such revivals show the enduring attraction of the name. They should not be confused with the eighteenth-century order.', { fr: { title: 'Des renaissances de nom seulement', date_label: 'années 1890' } }),
  ev('illuminatus-trilogy', 1975, '1975', 'after', '"The Illuminatus! Trilogy"', 'Robert Shea and Robert Anton Wilson publish satirical novels that help turn the Illuminati into a fixture of popular culture.', 'The trilogy parodied conspiracy thinking, yet it did much to spread Illuminati imagery in the late twentieth century.', { fr: { title: '« The Illuminatus! Trilogy »', date_label: '1975' } }),
];

// ───────────────────────── Figures ─────────────────────────
export const figures = [
  { slug: 'adam-weishaupt', name: 'Adam Weishaupt', role_title: 'Founder of the Order of the Illuminati', dates_label: '1748–1830', portrait: 'img:weishaupt', portrait_alt: 'Engraved portrait of Adam Weishaupt',
    summary: 'Professor of canon law at Ingolstadt who founded the order on 1 May 1776 under the code name "Spartacus".',
    background: 'Born in Ingolstadt and educated by Jesuits, Weishaupt became professor of canon law at the university there after the suppression of the Jesuits in 1773.',
    body: `Weishaupt's ambition was to create a society of educated, morally disciplined men who would spread Enlightenment values and gradually reform society from within. He directed the order closely, often in conflict with other leaders, most notably Adolph Knigge.

After the Bavarian edicts, Weishaupt was dismissed from his professorship and left Bavaria in 1785. He settled in Gotha under the protection of Duke Ernst II, published several apologias for the order, and died there on 18 November 1830.`,
    sources: SOURCES_CORE, i18n: { fr: { role_title: "Fondateur de l'Ordre des Illuminés", summary: "Professeur de droit canon à Ingolstadt, il fonde l'ordre le 1er mai 1776 sous le nom de code « Spartacus »." } } },
  { slug: 'adolph-knigge', name: 'Adolph Freiherr Knigge', role_title: 'Writer, Freemason and reorganiser of the order', dates_label: '1752–1796', portrait: 'img:knigge', portrait_alt: 'Engraved portrait of Adolph Freiherr Knigge',
    summary: 'Joined in 1780 as "Philo", reorganised the order’s grades and led its expansion before leaving in 1784.',
    background: 'A Hanoverian nobleman and Freemason, Knigge is best known today for his book *Über den Umgang mit Menschen* ("On Human Relations", 1788).',
    body: 'Knigge used his Masonic network to recruit widely and drafted much of the expanded grade system adopted in 1781–82. Disputes with Weishaupt over authority and the content of the higher grades led to his departure in 1784. He died in Bremen in 1796.',
    sources: '- van Dülmen (1975).\n- Agethen (1984).', i18n: { fr: { role_title: "Écrivain, franc-maçon et réorganisateur de l'ordre" } } },
  { slug: 'franz-xaver-von-zwackh', name: 'Franz Xaver von Zwackh', role_title: 'Early member and Bavarian official', dates_label: '1756–1843', portrait: '', portrait_alt: '',
    summary: 'One of the earliest members ("Cato"). The 1786 search of his house in Landshut exposed the order’s papers.',
    background: 'Zwackh was a law student and later a government official in Bavaria.',
    body: 'As one of Weishaupt’s closest early collaborators, Zwackh kept much of the order’s correspondence. When authorities searched his house in Landshut on 11–12 October 1786, these papers were seized and published the following year.',
    sources: '- *Einige Originalschriften des Illuminatenordens* (Munich, 1787).\n- van Dülmen (1975).', i18n: {} },
  { slug: 'johann-joachim-christoph-bode', name: 'Johann Joachim Christoph Bode', role_title: 'Publisher, translator and Freemason', dates_label: '1731–1793', portrait: 'img:bode', portrait_alt: 'Portrait of Johann Joachim Christoph Bode',
    summary: 'A Weimar publisher and translator who joined in 1782 and tried to sustain the order’s networks after its suppression.',
    background: 'Bode was a musician, publisher and celebrated translator of English and French literature into German, including Sterne and Montaigne.',
    body: 'A prominent Freemason, Bode joined the Illuminati in 1782 and became one of its leading figures outside Bavaria. After the Bavarian ban he worked to preserve contacts among former members, but without lasting success. He died in Weimar in 1793.',
    sources: '- Schüttler (1991).\n- Agethen (1984).', i18n: {} },
  { slug: 'ernst-ii-of-saxe-gotha-altenburg', name: 'Ernst II, Duke of Saxe-Gotha-Altenburg', role_title: 'Reigning duke, patron of science, member of the order', dates_label: '1745–1804', portrait: 'img:ernst-ii', portrait_alt: 'Portrait of Duke Ernst II of Saxe-Gotha-Altenburg',
    summary: 'An enlightened ruler and patron of astronomy who joined the order and gave Weishaupt refuge in Gotha.',
    background: 'Duke from 1772, Ernst II promoted science and education and founded the Seeberg observatory near Gotha.',
    body: 'Ernst II joined the order in 1783. After Weishaupt left Bavaria, the duke offered him protection and a position in Gotha, where Weishaupt lived for the rest of his life.',
    sources: '- Schüttler (1991).\n- van Dülmen (1975).', i18n: {} },
  { slug: 'johann-wolfgang-von-goethe', name: 'Johann Wolfgang von Goethe', role_title: 'Poet and Weimar statesman; member from 1783', dates_label: '1749–1832', portrait: 'img:goethe', portrait_alt: 'Portrait of Goethe by Joseph Karl Stieler, 1828',
    summary: 'Joined the order in Weimar in 1783 under the name "Abaris". His involvement appears to have been limited.',
    background: 'Already a celebrated author and a minister in the Duchy of Saxe-Weimar, Goethe was also a Freemason.',
    body: 'Goethe’s membership is documented, but historians have long debated its significance. Research by W. Daniel Wilson suggests that leading Weimar officials may have joined partly to keep the order under observation. There is no evidence that Goethe played a leading role.',
    sources: '- W. Daniel Wilson, *Geheimräte gegen Geheimbünde* (Stuttgart: Metzler, 1991).\n- Schüttler (1991).', i18n: { fr: { role_title: "Poète et homme d'État de Weimar ; membre à partir de 1783" } } },
  { slug: 'karl-theodor-elector-of-bavaria', name: 'Karl Theodor, Elector of Bavaria', role_title: 'Ruler who banned the order', dates_label: '1724–1799', portrait: 'img:karl-theodor', portrait_alt: 'Portrait of Elector Karl Theodor by Pompeo Batoni',
    summary: 'Elector Palatine and, from 1777, Elector of Bavaria. His edicts of 1784, 1785 and 1787 suppressed the Illuminati.',
    background: 'Karl Theodor inherited Bavaria in 1777. He was a patron of the arts and sciences but suspicious of secret associations.',
    body: 'Through three edicts, Karl Theodor first banned unauthorised societies (1784), then named and prohibited the Freemasons and the Illuminati (1785), and finally renewed the ban with severe penalties (1787).',
    sources: '- van Dülmen (1975).', i18n: {} },
];

// ───────────────────────── Principles ─────────────────────────
export const principles = [
  ['knowledge-and-education', 'Knowledge and Education', 'We value careful learning over easy certainty, and study as a lifelong practice.', 'Members commit to reading widely, citing sources, and sharing what they learn. We prefer primary sources and serious scholarship to rumour, and we treat education as something that continues throughout life.', 'Savoir et éducation', "Nous préférons l'apprentissage patient aux certitudes faciles, et l'étude comme pratique de toute une vie."],
  ['independent-thinking', 'Independent Thinking', 'We test claims against evidence, including our own.', 'Independent thinking means being willing to question authority, popular opinion and our own assumptions, and to change our minds when the evidence requires it. It does not mean contrarianism: we follow the evidence wherever it leads.', 'Pensée indépendante', 'Nous confrontons les affirmations aux preuves, y compris les nôtres.'],
  ['discipline-and-character', 'Discipline and Character', 'Good intentions become good work through steady habits.', 'Discipline turns curiosity into knowledge. We encourage members to set goals for their study, keep commitments to one another, and build character through consistent effort rather than display.', 'Discipline et caractère', 'Les bonnes intentions deviennent du bon travail grâce à des habitudes régulières.'],
  ['integrity-and-responsibility', 'Integrity and Responsibility', 'We say what we know, admit what we do not, and keep our promises.', 'Integrity is central to an organisation whose subject attracts myth and fraud. We never claim powers, connections or benefits we do not have, and we hold ourselves responsible for the accuracy of what we publish and the way we treat others.', 'Intégrité et responsabilité', "Nous disons ce que nous savons, reconnaissons ce que nous ignorons, et tenons nos promesses."],
  ['personal-development', 'Personal Development', 'Each of us can become wiser, kinder and more capable than we were.', 'Inspired by the Enlightenment idea of human perfectibility, we see personal development as patient, practical work: reflection, study, conversation and service.', 'Développement personnel', 'Chacun peut devenir plus sage, plus bienveillant et plus capable.'],
  ['service-to-society', 'Service to Society', 'Knowledge is worth most when it is shared for the common good.', 'We aim to contribute to public understanding of history and philosophy: through accurate publications, open resources, and members’ service in their own communities.', 'Service à la société', 'Le savoir vaut davantage lorsqu’il est partagé pour le bien commun.'],
].map(([slug, title, summary, body, frTitle, frSummary], i) => ({ slug, title, summary, body, sort: i, i18n: { fr: { title: frTitle, summary: frSummary } } }));

// ───────────────────────── Symbols ─────────────────────────
export const symbols = [
  { slug: 'owl-of-minerva', name: 'The Owl of Minerva', image: 'img:minerval', image_alt: 'Owl of Minerva emblem on the title page of Das verbesserte System der Illuminaten (1788)',
    origin: 'Classical antiquity; used by the Bavarian Illuminati (documented)',
    summary: 'The owl of Athena/Minerva symbolised wisdom in the ancient world. The Bavarian Illuminati used it on the insignia of their Minerval grade, the order’s core student-like rank.',
    body: `**Documented use.** The owl appears on the insignia of the Minerval grade. Members of that grade were called "Minervals" and met in "Minerval churches".

**Later interpretations.** In philosophy the owl is often associated with Hegel's remark (1820) that "the owl of Minerva spreads its wings only with the falling of the dusk", meaning that understanding comes after events. Modern claims that hidden owls in public designs reveal secret Illuminati influence have **no historical support**.`,
    sources: '- *Einige Originalschriften des Illuminatenordens* (Munich, 1787).\n- G. W. F. Hegel, *Grundlinien der Philosophie des Rechts* (1820), preface.', i18n: { fr: { name: 'La chouette de Minerve', origin: 'Antiquité classique ; utilisée par les Illuminés de Bavière (documenté)' } } },
  { slug: 'eye-of-providence', name: 'The Eye of Providence', image: '', image_alt: '',
    origin: 'Christian art, from the Renaissance onward',
    summary: 'An eye within a triangle, representing the watchful care of God (the triangle evoking the Trinity). It appears in Christian art from the sixteenth century.',
    body: `**Documented history.** The motif appears in European religious art from the Renaissance. It was adopted in Freemasonry in the late eighteenth century, and in 1782 it was placed above the unfinished pyramid on the reverse of the Great Seal of the United States.

**What is not documented.** There is **no evidence** that the Bavarian Illuminati used the Eye of Providence as their emblem. Its popular association with the "Illuminati" is a modern idea.`,
    sources: '- Department of State, *The Great Seal of the United States* (Washington, 2003).', i18n: { fr: { name: "L'œil de la Providence", origin: "Art chrétien, à partir de la Renaissance" } } },
  { slug: 'unfinished-pyramid', name: 'The Unfinished Pyramid', image: 'img:great-seal', image_alt: 'Obverse and reverse of the Great Seal of the United States',
    origin: 'Great Seal of the United States, reverse (1782)',
    summary: 'A thirteen-step unfinished pyramid beneath the Eye of Providence, with the date MDCCLXXVI (1776) and the mottoes Annuit Coeptis and Novus Ordo Seclorum.',
    body: `**Documented history.** The reverse of the Great Seal was adopted by Congress in 1782. The date 1776 refers to the Declaration of Independence. The mottoes come from Virgil, and the thirteen steps represent the original states. The design has appeared on the one-dollar bill since 1935.

**Popular claim.** Because the order was also founded in 1776, conspiracy theorists have presented the pyramid as an Illuminati emblem. The coincidence of dates is real. The connection is **unsupported** by any historical evidence.`,
    sources: '- Department of State, *The Great Seal of the United States* (Washington, 2003).', i18n: { fr: { name: 'La pyramide inachevée', origin: 'Grand sceau des États-Unis, revers (1782)' } } },
  { slug: 'light-and-illumination', name: 'Light and Illumination', image: 'img:orrery', image_alt: 'Joseph Wright of Derby, A Philosopher Lecturing on the Orrery',
    origin: 'Enlightenment metaphor (Aufklärung, Lumières)',
    summary: 'Light as a metaphor for knowledge runs through the eighteenth century and gives the "Illuminati" (the enlightened ones) their name.',
    body: `**Documented history.** The German *Aufklärung*, the French *Lumières* and the English *Enlightenment* all draw on the image of light dispelling darkness. Long before 1776, the Latin word *illuminati* had been applied to various religious and mystical groups, for example the Spanish *alumbrados* of the sixteenth century.

**Interpretation.** For the Bavarian order, the name expressed an aspiration to education and reason, not a claim to secret supernatural knowledge.`,
    sources: '- Immanuel Kant, "Beantwortung der Frage: Was ist Aufklärung?", *Berlinische Monatsschrift* (December 1784).', i18n: { fr: { name: 'Lumière et illumination', origin: 'Métaphore des Lumières' } } },
].map((s, i) => ({ ...s, sort: i }));

// ───────────────────────── FAQs ─────────────────────────
export const faqs = [
  ['are-you-the-bavarian-illuminati', 'general', 'Are you the Bavarian Illuminati?', 'No. The Bavarian Illuminati were founded in 1776 and suppressed in the 1780s. The Eternal Illuminati Covenant is an independent, modern organisation that studies that history. It claims no historical continuity with the original order.', 'Êtes-vous les Illuminés de Bavière ?', "Non. Les Illuminés de Bavière ont été fondés en 1776 et réprimés dans les années 1780. L'Eternal Illuminati Covenant est une organisation moderne et indépendante qui étudie cette histoire, sans revendiquer de continuité historique."],
  ['does-membership-bring-wealth-or-power', 'membership', 'Will membership bring me wealth, power or protection?', 'No. Membership offers study, discussion and fellowship. It brings no financial, political or professional advantage. Anyone who promises otherwise in our name is not acting for us. Please [report it](/report).', "L'adhésion apporte-t-elle richesse, pouvoir ou protection ?", "Non. L'adhésion offre l'étude, la discussion et la fraternité, sans aucun avantage financier, politique ou professionnel. Toute personne promettant le contraire en notre nom n'agit pas pour nous : [signalez-le](/report)."],
  ['someone-asked-me-for-money', 'membership', 'Someone contacted me offering membership in exchange for money. Is it real?', 'Applications are made only through this website, and applying is free. We never ask for money transfers, gift cards, cryptocurrency or banking details by email, phone or social media. Please do not pay, and [report the contact](/report).', "Quelqu'un m'a proposé une adhésion contre de l'argent. Est-ce réel ?", "Les candidatures se font uniquement sur ce site et sont gratuites. Nous ne demandons jamais de virement, carte cadeau, cryptomonnaie ou coordonnées bancaires. Ne payez pas et [signalez ce contact](/report)."],
  ['is-there-a-fee-to-apply', 'membership', 'Is there a fee to apply?', 'No. Submitting an application is free.', 'Faut-il payer pour candidater ?', 'Non. Le dépôt de candidature est gratuit.'],
  ['how-is-my-data-used', 'privacy', 'Who can see my application?', 'Only authorised administrators. Applications are never published or shared for marketing. See our [Privacy Policy](/privacy).', 'Qui peut voir ma candidature ?', 'Uniquement les administrateurs autorisés. Les candidatures ne sont jamais publiées ni partagées à des fins commerciales. Voir notre [politique de confidentialité](/privacy).'],
  ['can-i-withdraw', 'membership', 'Can I withdraw my application?', 'Yes, at any time. Use the withdrawal form on our [contact page](/contact) with your reference number and email address. We will email you a link to confirm.', 'Puis-je retirer ma candidature ?', 'Oui, à tout moment, via le formulaire de retrait de la [page contact](/contact), avec votre référence et votre adresse e-mail.'],
  ['how-long-does-review-take', 'membership', 'How long does the review take?', 'It varies with the number of applications. You will receive an email at each important stage, and we may contact you if we need more information.', "Combien de temps dure l'examen ?", "Cela dépend du nombre de candidatures. Vous recevrez un e-mail à chaque étape importante."],
  ['did-the-illuminati-cause-the-french-revolution', 'history', 'Did the Illuminati cause the French Revolution?', 'No evidence supports this. The claim was popularised in 1797–98 by Augustin Barruel and John Robison, after the order had already been suppressed. Historians reject it.', 'Les Illuminés ont-ils causé la Révolution française ?', "Aucune preuve ne l'atteste. Cette thèse a été popularisée en 1797–1798 par Barruel et Robison, après la répression de l'ordre ; les historiens la rejettent."],
  ['is-the-dollar-pyramid-an-illuminati-symbol', 'history', 'Is the pyramid on the dollar bill an Illuminati symbol?', 'No. The pyramid and the Eye of Providence come from the reverse of the Great Seal of the United States, adopted in 1782. The date 1776 refers to the Declaration of Independence. See [The Unfinished Pyramid](/symbols/unfinished-pyramid).', 'La pyramide du dollar est-elle un symbole des Illuminés ?', "Non. La pyramide et l'œil de la Providence proviennent du revers du grand sceau des États-Unis (1782) ; la date 1776 renvoie à la Déclaration d'indépendance."],
  ['does-the-illuminati-still-exist', 'history', 'Does the original order still exist?', 'There is no evidence that the Bavarian order survived beyond the late 1780s or early 1790s. Later groups that used the name had no organisational continuity with it.', "L'ordre originel existe-t-il encore ?", "Rien n'indique que l'ordre bavarois ait survécu au-delà de la fin des années 1780 ou du début des années 1790."],
].map(([slug, category, question, answer, frQ, frA], i) => ({ slug, category, question, answer, sort: i, i18n: { fr: { question: frQ, answer: frA } } }));

// ───────────────────────── Archive ─────────────────────────
export const archives = [
  { slug: 'einige-originalschriften-1787', title: 'Einige Originalschriften des Illuminatenordens (1787)', kind: 'document', category: 'Primary sources', date_label: '1787', image: '', image_alt: 'Title page, 1787',
    description: 'The order’s papers seized at Zwackh’s house in Landshut in October 1786 and published by the Bavarian government to expose the order.',
    body: 'This volume is the single most important primary source for the inner workings of the order: letters, statutes and plans. Read it critically. It was published by the order’s opponents, who chose what to print.',
    external_url: 'commons:originalschriften', license: 'Public domain', source: 'Internet Archive scan, via Wikimedia Commons' },
  { slug: 'nachtrag-von-weitern-originalschriften-1787', title: 'Nachtrag von weitern Originalschriften (1787)', kind: 'document', category: 'Primary sources', date_label: '1787',
    description: 'A supplementary volume of documents published in 1787, continuing the government’s exposure of the order.',
    body: 'Published as a sequel to the *Originalschriften*, with further correspondence and documents.', external_url: 'https://archive.org/details/nachtragvonweite121duke', license: 'Public domain', source: 'Duke University Libraries, via Internet Archive' },
  { slug: 'robison-proofs-of-a-conspiracy-1797', title: 'John Robison, Proofs of a Conspiracy (1797)', kind: 'reference', category: 'Conspiracy literature', date_label: '1797', image: '', image_alt: 'Title page of Proofs of a Conspiracy',
    description: 'An influential work claiming that Freemasons, the Illuminati and reading societies conspired against the religions and governments of Europe.',
    body: 'Robison was a respected professor of natural philosophy at Edinburgh. His book is important evidence of how the Illuminati myth spread, but it is **not** a reliable account of the order itself.', external_url: 'https://archive.org/details/proofsofconspira00robi', license: 'Public domain', source: 'Internet Archive' },
  { slug: 'barruel-memoires-jacobinisme', title: 'Augustin Barruel, Mémoires pour servir à l’histoire du Jacobinisme (1797–98)', kind: 'reference', category: 'Conspiracy literature', date_label: '1797–1798',
    description: 'Four volumes arguing that the French Revolution resulted from a conspiracy of philosophes, Freemasons and Illuminati.',
    body: 'Together with Robison, Barruel created the template for later Illuminati conspiracy theories. Historians regard his central thesis as unsupported.', license: 'Public domain', source: '' },
  { slug: 'das-verbesserte-system-der-illuminaten-1788', title: 'Adam Weishaupt, Das verbesserte System der Illuminaten (1788)', kind: 'document', category: 'Primary sources', date_label: '1788', image: 'img:minerval', image_alt: 'Title page with the owl of Minerva emblem',
    description: 'Weishaupt’s own account of the order’s “improved system” with all its grades, published in exile. The title page carries the owl of Minerva emblem.', body: 'A key apologetic source: Weishaupt presents the order as he wished it to be understood after its suppression. Read it alongside the government’s *Originalschriften*.', external_url: 'commons:minerval', license: 'Public domain', source: 'Wikimedia Commons' },
  { slug: 'great-seal-of-the-united-states', title: 'Great Seal of the United States (obverse and reverse)', kind: 'photograph', category: 'Images', date_label: '1782', image: 'img:great-seal', image_alt: 'Great Seal obverse and reverse',
    description: 'The seal whose reverse shows the unfinished pyramid and the Eye of Providence, a design often wrongly attributed to the Illuminati.', body: 'See our essay on [the unfinished pyramid](/symbols/unfinished-pyramid).', external_url: 'commons:great-seal', license: 'Public domain', source: 'Wikimedia Commons' },
  { slug: 'kant-was-ist-aufklarung-1784', title: 'Kant, “Beantwortung der Frage: Was ist Aufklärung?” (1784)', kind: 'research', category: 'Philosophy', date_label: 'December 1784', image: 'img:kant', image_alt: 'Portrait of Immanuel Kant',
    description: 'Kant’s famous essay defining Enlightenment, published in the Berlinische Monatsschrift.', body: 'Published the same year as Moses Mendelssohn’s essay on the same question. Both are essential context for understanding what "enlightenment" meant to contemporaries of the Illuminati.', license: 'Public domain (text)', source: 'Berlinische Monatsschrift, December 1784' },
  { slug: 'select-bibliography', title: 'Select bibliography', kind: 'research', category: 'Research notes', date_label: '',
    description: 'Scholarly works we rely on for the history of the Bavarian Illuminati.',
    body: SOURCES_CORE + '\n- W. Daniel Wilson, *Geheimräte gegen Geheimbünde. Ein unbekanntes Kapitel der klassisch-romantischen Geschichte Weimars* (Stuttgart: Metzler, 1991).', license: 'Bibliographic reference', source: 'Compiled by the Covenant' },
].map((a, i) => ({ ...a, sort: i, downloadable: 0 }));

// ───────────────────────── Articles ─────────────────────────
export const categories = [
  { slug: 'history', name: { en: 'History', fr: 'Histoire' } },
  { slug: 'research', name: { en: 'Research', fr: 'Recherche' } },
  { slug: 'philosophy', name: { en: 'Philosophy', fr: 'Philosophie' } },
  { slug: 'announcements', name: { en: 'Announcements', fr: 'Annonces' } },
];

export const articles = [
  { slug: 'ingolstadt-1776', category: 'history', title: 'Ingolstadt, 1776: how a professor founded a secret society', cover_image: 'img:ingolstadt', cover_alt: 'The Hohe Schule in Ingolstadt', tags: 'Weishaupt, Ingolstadt, founding', featured: 1, days_ago: 21,
    excerpt: 'Why would a 28-year-old professor of canon law found a secret society? The answer lies in the university politics of Enlightenment Bavaria.',
    body: `In the spring of 1776 Adam Weishaupt was 28 and already professor of canon law at the University of Ingolstadt. The post had become available because Pope Clement XIV had suppressed the Jesuits three years earlier. It also made Weishaupt enemies among the former Jesuits who remained influential at the university.

## A society for self-improvement

Weishaupt's plan was not, at first, a political conspiracy. It was a disciplined reading society. Its members would study works the official curriculum ignored, report on their reading and conduct, and gradually form a network of educated, morally serious men.

## Secrecy as method

Why secrecy? In a state with strict censorship and powerful clerical opponents, openly promoting Enlightenment authors could cost a young man his career. Secrecy also suited Weishaupt's own tendency to control. Code names, a private calendar and a hierarchy of grades were meant to protect members and to keep authority in the founder's hands.

## What came next

Within a few years the small student circle had become an order with Masonic connections across the Empire. Within ten years it had been banned. Ingolstadt in 1776 is a reminder of how ordinary, and how local, the origins of a later legend were.

*Further reading: Richard van Dülmen, Der Geheimbund der Illuminaten (1975).*` },
  { slug: 'reading-the-sources-critically', category: 'research', title: 'Fact, rumour and myth: reading the Illuminati sources critically', cover_image: '', cover_alt: 'Title page of Einige Originalschriften des Illuminatenordens', tags: 'sources, method, Barruel, Robison', featured: 0, days_ago: 14,
    excerpt: 'Almost everything we know about the Illuminati was published by their enemies. Here is how historians deal with that problem.',
    body: `Historians of the Bavarian Illuminati face an unusual problem. Many of the most detailed sources were printed by people who wanted to destroy the order.

## The government's evidence

In 1787 the Bavarian government published the papers seized from Franz Xaver von Zwackh as *Einige Originalschriften des Illuminatenordens*. The documents appear genuine, but they were **selected** to shock readers. Passages about secrecy, control and radical plans were included precisely because they were damaging.

## The conspiracy books

Ten years later, Augustin Barruel and John Robison used these and other sources to argue that the order had survived underground and caused the French Revolution. Their books are valuable evidence of how the myth was built. They are not evidence that the myth is true.

## Three questions for any source

1. **Who produced it, and why?**
2. **What would we expect to find if the claim were false?**
3. **Is the claim supported by independent evidence?**

Applied consistently, these questions separate the documented history of a short-lived Enlightenment society from two centuries of legend.` },
  { slug: 'what-did-enlightenment-mean-in-1784', category: 'philosophy', title: 'What did “Enlightenment” mean in 1784?', cover_image: 'img:orrery', cover_alt: 'A Philosopher Lecturing on the Orrery', tags: 'Kant, Mendelssohn, Enlightenment', featured: 0, days_ago: 7,
    excerpt: 'In the same year that Bavaria began to move against secret societies, Berlin’s leading journal asked: what is enlightenment?',
    body: `In December 1784 the *Berlinische Monatsschrift* published Immanuel Kant's answer to a question that had been circulating in its pages: *What is enlightenment?* Moses Mendelssohn had published his own answer in the same journal a few months earlier.

## Kant's answer

Kant defined enlightenment as humanity's emergence from a self-imposed immaturity, an inability to think for oneself that comes from a lack of courage rather than a lack of intelligence. His motto was *Sapere aude!*: have the courage to use your own understanding.

## A public use of reason

Crucially, Kant distinguished the *public* use of reason (writing as a scholar for the reading public, which should be free) from the *private* use of reason in one's office, where obedience may be required.

## Why it matters for the Illuminati

The Illuminati chose secrecy; Kant argued for publicity. The contrast helps explain both the appeal of the order to frustrated reformers and the suspicion it aroused. It is a tension still worth thinking about.` },
  { slug: 'welcome-to-our-website', category: 'announcements', title: 'Welcome to the Eternal Illuminati Covenant website', cover_image: 'img:hero-library', cover_alt: 'A historic library hall', tags: 'announcement', featured: 0, is_announcement: 1, days_ago: 2,
    excerpt: 'Our new website brings together our historical research, our archive and our membership application in one place.',
    body: `We are pleased to welcome you to the new website of the Eternal Illuminati Covenant.

Here you will find our account of the [history of the Bavarian Illuminati](/history), an interactive [timeline](/timeline), profiles of [historical figures](/figures), our [research archive](/archive), and information about [membership](/membership).

**A note on safety.** Membership applications are made only through this website, and applying is free. We never ask for money, gift cards or banking details by email or social media. If anyone contacts you claiming to represent the Covenant and asks for money, please [report it](/report).` },
];

// ───────────────────────── Application fields ─────────────────────────
const f = (key, step, type, en, fr, opts = {}) => ({ key, step, type, label: { en, fr }, help: opts.help ?? {}, options: opts.options ?? [], required: opts.required ? 1 : 0, core: opts.core ? 1 : 0, max_length: opts.max ?? (type === 'textarea' ? 2000 : 200), sort: opts.sort ?? 0 });
export const applicationFields = [
  f('full_name', 1, 'text', 'Full legal name', 'Nom légal complet', { required: true, core: true, max: 150, sort: 1 }),
  f('email', 1, 'email', 'Email address', 'Adresse e-mail', { required: true, core: true, max: 200, sort: 2, help: { en: 'We will send a confirmation link to this address.', fr: 'Nous enverrons un lien de confirmation à cette adresse.' } }),
  f('country', 1, 'country', 'Country of residence', 'Pays de résidence', { required: true, core: true, sort: 3 }),
  f('phone', 1, 'tel', 'Phone number', 'Numéro de téléphone', { max: 40, sort: 4, help: { en: 'Only if you would like us to be able to call you.', fr: 'Uniquement si vous souhaitez que nous puissions vous appeler.' } }),
  f('age_confirmation', 1, 'checkbox', 'I confirm that I am 18 years of age or older.', "Je confirme avoir 18 ans ou plus.", { required: true, sort: 5 }),
  f('occupation', 2, 'text', 'Occupation', 'Profession', { required: true, max: 150, sort: 1 }),
  f('experience', 2, 'textarea', 'Relevant experience', 'Expérience pertinente', { required: true, sort: 2, help: { en: 'Study, reading, professional or voluntary experience relevant to history, philosophy or education.', fr: "Études, lectures, expérience professionnelle ou bénévole en lien avec l'histoire, la philosophie ou l'éducation." } }),
  f('education', 2, 'textarea', 'Educational background', 'Formation', { max: 1500, sort: 3, help: { en: 'Optional. Formal qualifications are not required.', fr: 'Facultatif. Aucun diplôme n’est exigé.' } }),
  f('interests', 2, 'textarea', 'Personal and intellectual interests', 'Centres d’intérêt personnels et intellectuels', { required: true, max: 1500, sort: 4 }),
  f('motivation', 3, 'textarea', 'Why do you wish to apply?', 'Pourquoi souhaitez-vous candidater ?', { required: true, max: 3000, sort: 1 }),
  f('understanding', 3, 'textarea', 'What do you understand about the Eternal Illuminati Covenant?', "Que savez-vous de l'Eternal Illuminati Covenant ?", { required: true, sort: 2 }),
  f('contribution', 3, 'textarea', 'What do you hope to contribute?', 'Que souhaitez-vous apporter ?', { required: true, sort: 3 }),
  f('additional', 3, 'textarea', 'Anything else you would like us to know', 'Autres informations utiles', { sort: 4 }),
  f('referral', 3, 'select', 'How did you hear about us?', 'Comment nous avez-vous connus ?', { sort: 5, options: [
    { value: 'search', label: { en: 'Search engine', fr: 'Moteur de recherche' } }, { value: 'social', label: { en: 'Social media', fr: 'Réseaux sociaux' } },
    { value: 'friend', label: { en: 'Friend or member', fr: 'Ami ou membre' } }, { value: 'publication', label: { en: 'An article or publication', fr: 'Un article ou une publication' } },
    { value: 'other', label: { en: 'Other', fr: 'Autre' } },
  ] }),
];
