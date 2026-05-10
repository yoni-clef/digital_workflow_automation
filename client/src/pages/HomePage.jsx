import { Link } from 'react-router-dom';
import { Inbox, Paperclip, GitBranch, LogIn, UserPlus, Sparkles } from 'lucide-react';

const features = [
  {
    icon: Inbox,
    title: 'Inbox & approvals',
    body:
      'Act on items pending manager or department review, delegate when needed, and move work forward without losing context.',
  },
  {
    icon: GitBranch,
    title: 'Audit-ready history',
    body:
      'Every transition is recorded with a clear timeline so teams can see who acted and when.',
  },
  {
    icon: Paperclip,
    title: 'Attachments',
    body:
      'Upload supporting files with new requests so approvers have everything in one thread.',
  },
];

export default function HomePage() {
  return (
    <div className="landing-page">
      <div className="landing-page__grid" aria-hidden />
      <div className="landing-page__orb landing-page__orb--a" aria-hidden />
      <div className="landing-page__orb landing-page__orb--b" aria-hidden />

      <header className="landing-page__header">
        <Link to="/" className="landing-page__brand">
          <span className="landing-page__brand-mark" aria-hidden>
            W
          </span>
          <div>
            <span className="font-bold text-base tracking-tight leading-tight block">Workflow</span>
            <span className="block text-xs text-[var(--text-3)] leading-snug">
              Digital request automation
            </span>
          </div>
        </Link>
        <nav className="landing-nav" aria-label="Account actions">
          <Link to="/login" className="landing-nav__link">
            Sign in
          </Link>
          <Link to="/register" className="landing-nav__link landing-nav__link--primary">
            Register
          </Link>
        </nav>
      </header>

      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-6 pb-16 md:pb-24">
        <section className="text-center pt-6 md:pt-10">
          <p className="landing-fade-up landing-fade-up--d1 landing-eyebrow inline-flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 opacity-90" aria-hidden />
            Enterprise workflow
          </p>
          <div className="landing-fade-up landing-fade-up--d2 mt-6 flex justify-center">
            <div className="landing-page__accent-line" aria-hidden />
          </div>
          <h1 className="landing-fade-up landing-fade-up--d3 landing-hero-title mt-6">
            Submit, route, and track internal requests in one place
          </h1>
          <p className="landing-fade-up landing-fade-up--d4 mt-6 text-lg md:text-xl leading-relaxed text-[var(--text-2)] max-w-2xl mx-auto">
            From manager review to department approval—keep every workflow visible, with history,
            attachments, and clear status at every step.
          </p>
          <div className="landing-fade-up landing-fade-up--d5 mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link to="/login" className="landing-cta-primary">
              <LogIn className="w-4 h-4 shrink-0" aria-hidden />
              Sign in
            </Link>
            <Link to="/register" className="landing-cta-secondary">
              <UserPlus className="w-4 h-4 shrink-0" aria-hidden />
              Create account
            </Link>
          </div>
        </section>

        <section
          className="mt-16 md:mt-20 grid grid-cols-1 md:grid-cols-3 gap-6"
          aria-labelledby="landing-features-heading"
        >
          <h2 id="landing-features-heading" className="sr-only">
            Product capabilities
          </h2>
          {features.map((item, i) => {
            const Icon = item.icon;
            const delayClass = `landing-fade-up--d${7 + i}`;
            return (
              <article
                key={item.title}
                className={`landing-fade-up ${delayClass} landing-feature`}
              >
                <div className="landing-feature__icon-wrap">
                  <Icon className="w-5 h-5" aria-hidden />
                </div>
                <h3 className="text-base font-semibold tracking-tight text-[var(--text-1)]">{item.title}</h3>
                <p className="mt-2.5 text-sm text-[var(--text-2)] leading-relaxed">{item.body}</p>
              </article>
            );
          })}
        </section>
      </main>

      <footer className="landing-page__footer landing-fade-up landing-fade-up--d9">
        <p>Workflow automation demo — sign in to access your dashboard.</p>
      </footer>
    </div>
  );
}
