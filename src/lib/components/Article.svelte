<script lang="ts">
	interface ArticleData {
		source?: string;
		pubDate: string;
		title: string;
		link: string;
		flag?: boolean;
		description: string;
	}

	let { 
		item,
		user,
		showExcerpt = true,
		className = ""
	}: {
		item: ArticleData;
		user: string;
		showExcerpt?: boolean;
		className?: string;
	} = $props();

	function formatSource(source: string) {
		return source.length > 45 ? source.substring(0, 45) + '...' : source;
	}

	function formatTime(pubDate: string) {
		return new Date(pubDate).toLocaleTimeString('pt-BR', {hour: '2-digit', minute: '2-digit'});
	}

	function cleanDescription(description: string) {
		return description.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').replace(/\[…\]/g, '').trim();
	}
</script>

<article class="article-row {className}">
	<div class="article-header">
		<div class="article-source">
			{formatSource(item.source || '')}
		</div>
		<div class="article-time">
			{formatTime(item.pubDate)}
		</div>
	</div>
	<h2 class="article-headline">
		{#if item.flag}
			<a href={item.link} target="_blank" rel="noopener noreferrer">
				{item.title}
			</a>
		{:else}
			<a href={item.link} rel="noopener">
				{item.title}
			</a>
		{/if}
	</h2>
	{#if showExcerpt}
		<p class="article-excerpt">
			{cleanDescription(item.description)}
		</p>
	{/if}
</article>

<style>
	/* Cada artigo como linha simples sem box */
	.article-row {
		display: flex;
		flex-direction: column;
		padding: 24px 20px;
		border-bottom: 1px solid #b8b8b8;
		cursor: pointer;
		transition: none;
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
		margin-bottom: 12px;
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
		font-size: 21px;
	}

	.article-headline a {
		color: inherit;
		text-decoration: none;
		display: block;
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
		padding: 20px 0;
		border-bottom: 1px solid #b8b8b8;
		height: auto;
	}

	.compact-article .article-headline {
		font-size: 21px;
		margin-bottom: 8px;
	}

	.compact-article .article-header {
		margin-bottom: 12px;
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
	}

	@media screen and (max-device-width: 758px),
		   screen and (max-width: 758px),
		   (pointer: coarse) and (max-width: 1023px) {
		.article-row,
		.mobile-article {
			padding: 15px 16px;
		}
		
		.article-headline {
			margin-bottom: 4px;
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

	:global(.dark-mode) .article-headline a {
		color: #e0e0e0;
	}
	
	:global(.dark-mode) .article-excerpt {
		color: #b0b0b0;
	}

	:global(.dark-mode) .sidebar-article,
	:global(.dark-mode) .compact-article {
		border-bottom-color: #333;
	}
</style>
