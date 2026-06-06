"use client";

import Image from "next/image";
import type { NewsArticle } from "@/lib/newsArticle";
import { formatNewsTime, newsExcerpt } from "@/lib/newsArticle";

interface NewsArticleCardProps {
  article: NewsArticle;
}

export function NewsArticleCard({ article }: NewsArticleCardProps) {
  const excerpt = newsExcerpt(article.body);
  const byline = [article.authors, article.sourceName].filter(Boolean).join(" · ");

  return (
    <article className="border-b border-[var(--border)] px-3 py-3 hover:bg-[var(--surface-hover)]/60 transition-colors">
      <a
        href={article.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block group"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {article.sourceName && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)] mb-1">
                {article.sourceName}
              </p>
            )}
            <h3 className="text-sm font-semibold text-[var(--foreground)] leading-snug group-hover:text-[var(--accent)] transition-colors line-clamp-3">
              {article.title}
            </h3>
            {article.subtitle && (
              <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{article.subtitle}</p>
            )}
          </div>
          <span className="text-[10px] text-[var(--muted)] shrink-0 pt-0.5">
            {formatNewsTime(article.publishedAt)}
          </span>
        </div>

        {article.imageUrl && (
          <div className="relative w-full h-36 mt-2.5 rounded-lg overflow-hidden bg-black/30">
            <Image
              src={article.imageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="320px"
              unoptimized
            />
          </div>
        )}

        {excerpt && (
          <p className="text-xs text-[var(--muted)] mt-2 leading-relaxed line-clamp-4">
            {excerpt}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2">
          {byline && (
            <span className="text-[10px] text-[var(--muted)] truncate max-w-full">{byline}</span>
          )}
          {(article.categories ?? []).slice(0, 3).map((cat) => (
            <span
              key={cat}
              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-hover)] text-[var(--muted)]"
            >
              {cat}
            </span>
          ))}
        </div>
      </a>
    </article>
  );
}
