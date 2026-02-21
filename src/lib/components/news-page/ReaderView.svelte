<script lang="ts">
	import { resolveNewsLink } from "$lib/utils/news-links";
	import type { NewsItem } from "$lib/types/news";

	let {
		article,
		paragraphs,
	}: {
		article: NewsItem;
		paragraphs: string[];
	} = $props();

	const originalHref = $derived(resolveNewsLink(article.link, article.sourceUrl) || resolveNewsLink(article.sourceUrl));
	const hasOriginalHref = $derived(Boolean(originalHref));
</script>

<div class="reader-shell">
	<article class="reader-article">
		<div class="reader-source">{article.source || ""}</div>
		<h1 class="reader-title">
			{#if hasOriginalHref && article.flag}
				<a
					href={originalHref}
					target="_blank"
					rel="noopener noreferrer"
					class="reader-title-link"
				>{article.title}</a
				>
			{:else if hasOriginalHref}
				<a href={originalHref} rel="noopener" class="reader-title-link">{article.title}</a>
			{:else}
				{article.title}
			{/if}
		</h1>
		{#if !article.link && hasOriginalHref}
			<p class="reader-link-note">Link da materia indisponivel; abrindo pagina da fonte.</p>
		{/if}
		{#if paragraphs.length > 0}
			{#each paragraphs as paragraph}
				<p class="reader-paragraph">{paragraph}</p>
			{/each}
		{:else}
			<p class="reader-paragraph">{article.description || ""}</p>
		{/if}
	</article>
</div>

<style>
	.reader-shell {
		max-width: 860px;
		margin: 0 auto;
		padding: 18px 20px 32px;
	}

	.reader-article {
		background: #fff;
	}

	.reader-source {
		font-size: 14px;
		color: #7a7a7a;
		margin-bottom: 8px;
	}

	.reader-title {
		font-size: 30px;
		line-height: 1.2;
		font-weight: 700;
		color: #151515;
		margin-bottom: 18px;
	}

	.reader-title-link {
		color: inherit;
		text-decoration: none;
		cursor: pointer;
	}

	.reader-title-link:hover,
	.reader-title-link:focus-visible {
		text-decoration: underline;
		text-underline-offset: 3px;
	}

	.reader-paragraph {
		font-size: 18px;
		line-height: 1.75;
		color: #2f2f2f;
		margin-bottom: 16px;
		text-align: left;
	}

	.reader-link-note {
		margin-top: -8px;
		margin-bottom: 14px;
		font-size: 14px;
		color: #7a7a7a;
	}

	:global(.dark-mode) .reader-article {
		background: #1a1a1a;
	}

	:global(.dark-mode) .reader-source {
		color: #a0a0a0;
	}

	:global(.dark-mode) .reader-title {
		color: #f0f0f0;
	}

	:global(.dark-mode) .reader-title-link {
		color: #f0f0f0;
	}

	:global(.dark-mode) .reader-paragraph {
		color: #d0d0d0;
	}

	:global(.dark-mode) .reader-link-note {
		color: #a0a0a0;
	}

	@media (max-width: 768px) {
		.reader-shell {
			padding: 14px 16px 24px;
		}

		.reader-title {
			font-size: 24px;
		}

		.reader-paragraph {
			font-size: 17px;
			line-height: 1.7;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.reader-source {
			font-size: 17px;
		}

		.reader-title {
			font-size: 28px;
			line-height: 1.25;
		}

		.reader-link-note {
			font-size: 16px;
		}

		.reader-paragraph {
			font-size: 21px;
			line-height: 1.75;
		}
	}
</style>
