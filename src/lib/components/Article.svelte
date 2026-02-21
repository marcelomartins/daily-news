<script lang="ts">
	import { resolveNewsLink } from "$lib/utils/news-links";

	interface ArticleData {
		source?: string;
		sourceUrl?: string;
		pubDate: string;
		title: string;
		link: string;
		fullContent?: string;
		localReaderHref?: string;
		flag?: boolean;
		description: string;
		headline?: boolean;
		headlineSource?: string;
	}

	let {
		item,
		user,
		showExcerpt = true,
		className = "",
	}: {
		item: ArticleData;
		user: string;
		showExcerpt?: boolean;
		className?: string;
	} = $props();

	function formatSource(source: string) {
		return source.length > 45 ? source.substring(0, 45) + "..." : source;
	}

	function formatTime(pubDate: string) {
		return new Date(pubDate).toLocaleTimeString("pt-BR", {
			hour: "2-digit",
			minute: "2-digit",
		});
	}

	function cleanDescription(description: string) {
		return description
			.replace(/<[^>]*>/g, "")
			.replace(/&[^;]+;/g, " ")
			.replace(/\[…\]/g, "")
			.trim();
	}

	const articleHref = $derived(resolveNewsLink(item.link, item.sourceUrl));
	const sourceFallbackHref = $derived(resolveNewsLink(item.sourceUrl));
	const hasFullContent = $derived(Boolean(item.fullContent?.trim()));
	const localReaderHref = $derived(hasFullContent ? (item.localReaderHref || "") : "");
	const hasLocalReaderHref = $derived(Boolean(localReaderHref));
	const externalHref = $derived(articleHref || sourceFallbackHref);
	const navigationHref = $derived(localReaderHref || externalHref);
	const hasNavigationHref = $derived(Boolean(navigationHref));
	const openInNewTab = $derived(!hasLocalReaderHref && Boolean(item.flag));
	const usingSourceFallback = $derived(!hasLocalReaderHref && !articleHref && Boolean(sourceFallbackHref));
</script>

{#if hasNavigationHref}
	<a
		class="article-row article-row-link {className}"
		href={navigationHref}
		target={openInNewTab ? "_blank" : undefined}
		rel={openInNewTab ? "noopener noreferrer" : "noopener"}
	>
		<div class="article-header">
			<div class="article-source">
				{formatSource(item.source || "")}
			</div>
			<div class="article-time">
				{formatTime(item.pubDate)}
			</div>
		</div>
		<h2 class="article-headline">
			<span class="article-title-main" class:has-full-content={hasFullContent}>{item.title}</span>
		</h2>
		{#if usingSourceFallback}
			<span class="article-link-missing">Link da materia indisponivel, abrindo fonte.</span>
		{/if}
		{#if showExcerpt}
			<p class="article-excerpt">
				{cleanDescription(item.description)}
			</p>
		{/if}
	</a>
{:else}
	<div class="article-row {className}">
		<div class="article-header">
			<div class="article-source">
				{formatSource(item.source || "")}
			</div>
			<div class="article-time">
				{formatTime(item.pubDate)}
			</div>
		</div>
		<h2 class="article-headline">
			<span class="article-headline-disabled article-title-main" class:has-full-content={hasFullContent}
				>{item.title}</span
			>
		</h2>
		<span class="article-link-missing">Sem link original</span>
		{#if showExcerpt}
			<p class="article-excerpt">
				{cleanDescription(item.description)}
			</p>
		{/if}
	</div>
{/if}

<style>
	/* Cada artigo como linha simples sem box */
	.article-row {
		display: flex;
		flex-direction: column;
		padding: 24px 20px;
		border-bottom: 1px solid #b8b8b8;
		cursor: default;
		transition: none;
	}

	.article-row-link {
		text-decoration: none;
		color: inherit;
		cursor: pointer;
	}

	.article-row-link:focus-visible {
		outline: 2px solid #4d4d4d;
		outline-offset: -2px;
	}

	.article-row:last-child {
		border-bottom: none;
	}

	.article-row:active {
		background: #f8f8f8;
	}

	/* Header do artigo com fonte e horário alinhados */
	.article-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 4px;
	}

	.article-source {
		font-size: 15px;
		color: #999;
		font-weight: 500;
		letter-spacing: 0.5px;
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 6px;
	}

	.article-time {
		font-size: 15px;
		color: #999;
		font-weight: 500;
	}

	.article-headline {
		font-weight: 600;
		line-height: 1.4;
		color: #1a1a1a;
		margin: 0px 0px;
		font-size: 18px;
	}

	.article-title-main {
		display: inline;
	}

	.article-title-main.has-full-content::after {
		content: "\00a0★";
		color: #f59e0b;
		font-size: 0.8em;
		line-height: 1;
		white-space: nowrap;
		vertical-align: baseline;
	}

	.article-headline-disabled {
		color: inherit;
	}

	.article-link-missing {
		display: block;
		margin-top: 6px;
		font-size: 13px;
		font-weight: 500;
		color: #999;
	}

	/* Resumo da notícia */
	.article-excerpt {
		font-size: 17px;
		line-height: 1.5;
		color: #444;
		text-align: justify;
		font-weight: 400;
	}

	/* Variações específicas dos artigos */
	.sidebar-article {
		padding: 24px 0;
		border-bottom: 1px solid #b8b8b8;
	}

	.sidebar-article:last-child {
		border-bottom: none;
	}

	.mobile-article {
		padding: 24px 20px;
		border-bottom: 1px solid #b8b8b8;
	}

	.mobile-article:last-child {
		border-bottom: none;
	}

	.mobile-article:active {
		background: #f8f8f8;
	}

	.compact-article {
		padding: 10px 0px 12px 0px;
		margin: 0px 25px;
		border-bottom: 1px solid #b8b8b8;
		height: auto;
	}

	.compact-article .article-headline {
		font-size: 19px;
		margin-bottom: 8px;
	}

	.compact-article .article-header {
		margin-bottom: 4px;
	}

	.compact-article .article-source,
	.compact-article .article-time {
		font-size: 15px;
	}

	/* Mobile responsiveness */
	@media (max-width: 600px) {
		.article-row,
		.mobile-article {
			padding: 15px 16px;
		}

		.article-headline {
			font-size: 20px;
		}

		.article-source,
		.article-time {
			font-size: 14px;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.article-row,
		.mobile-article {
			padding: 15px 16px;
		}

		.article-headline {
			font-size: 22px;
			line-height: 1.45;
			margin-bottom: 4px;
		}

		.article-source,
		.article-time {
			font-size: 16px;
		}

		.article-link-missing {
			font-size: 15px;
		}
	}

	/* Tema escuro */
	:global(.dark-mode) .article-row {
		border-bottom-color: #333;
	}

	:global(.dark-mode) .article-row:active,
	:global(.dark-mode) .mobile-article:active {
		background: #2a2a2a;
	}

	:global(.dark-mode) .article-source,
	:global(.dark-mode) .article-time {
		color: #888;
	}

	:global(.dark-mode) .article-headline {
		color: #e0e0e0;
	}

	:global(.dark-mode) .article-row-link:focus-visible {
		outline-color: #bdbdbd;
	}

	:global(.dark-mode) .article-link-missing {
		color: #777;
	}

	:global(.dark-mode) .article-excerpt {
		color: #b0b0b0;
	}

	:global(.dark-mode) .sidebar-article,
	:global(.dark-mode) .compact-article {
		border-bottom-color: #333;
	}

	/* Dark mode para estrela de headline */
	:global(.dark-mode) .article-title-main.has-full-content::after {
		color: #fbbf24;
	}
</style>
