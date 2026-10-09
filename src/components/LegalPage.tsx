import { Banner, PageHeader } from "./ui";

/** Renders admin-entered legal text: blank lines split paragraphs, "## " starts a heading. */
export function LegalPage({ title, text, updated }: { title: string; text: string; updated?: string }) {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={title} subtitle={updated} />
      {blocks.length === 0 ? (
        <Banner inline tone="info">This page is being prepared. Please check back soon.</Banner>
      ) : (
        <article className="card space-y-4 text-[15px] leading-relaxed text-slate-700">
          {blocks.map((b, i) =>
            b.startsWith("## ") ? (
              <h2 key={i} className="pt-2 text-lg font-semibold text-slate-900">{b.slice(3)}</h2>
            ) : (
              <p key={i} className="whitespace-pre-line">{b}</p>
            ),
          )}
        </article>
      )}
    </div>
  );
}
