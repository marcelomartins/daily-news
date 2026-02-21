<script lang="ts">
	import Article from "$lib/components/Article.svelte";
	import NavigationButtons from "$lib/components/NavigationButtons.svelte";
	import type { NewsData } from "$lib/types/news";

	let {
		news,
		user,
	}: {
		news: NewsData;
		user: string;
	} = $props();
</script>

<div class="articles-list">
	<div class="mobile-layout">
		{#each news.items as item}
			<Article
				{item}
				{user}
				className="mobile-article"
			/>
		{/each}

		<div class="mobile-nav-footer">
			<NavigationButtons
				{user}
				category={news.category}
				currentPage={news.page}
				totalPages={news.totalPages}
				isMobile={true}
			/>
		</div>
	</div>

	{#if news.page === 1}
		<div class="desktop-first-page">
			<div class="first-page-top">
				<div class="main-column">
					{#each news.items.slice(0, 2) as item}
						<Article
							{item}
							{user}
							className="featured-article"
						/>
					{/each}
				</div>
				<div class="sidebar-column">
					{#each news.items.slice(2, 6) as item}
						<Article
							{item}
							{user}
							showExcerpt={false}
							className="sidebar-article"
						/>
					{/each}
				</div>
			</div>

			<div class="first-page-bottom">
				<div class="bottom-column">
					{#each news.items.slice(6, 8) as item}
						<Article
							{item}
							{user}
							showExcerpt={false}
							className="compact-article"
						/>
					{/each}
				</div>
				<div class="bottom-column">
					{#each news.items.slice(8, 10) as item}
						<Article
							{item}
							{user}
							showExcerpt={false}
							className="compact-article"
						/>
					{/each}
				</div>
			</div>
		</div>
	{:else}
		<div class="desktop-columns">
			<div class="column">
				{#each news.items.slice(0, 6) as item}
					<Article
						{item}
						{user}
						className="compact-article"
					/>
				{/each}
			</div>
			<div class="column">
				{#each news.items.slice(6, 12) as item}
					<Article
						{item}
						{user}
						className="compact-article"
					/>
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.articles-list {
		max-width: 800px;
		margin: 0 auto;
		background: #fff;
	}

	.mobile-layout {
		display: none;
	}

	.desktop-columns {
		display: block;
	}

	.desktop-first-page {
		display: none;
	}

	.mobile-nav-footer {
		display: none;
		padding: 20px;
		border-top: 1px solid #b8b8b8;
		background: #fff;
	}

	@media (min-width: 1024px) {
		.articles-list {
			max-width: 1200px;
		}

		.desktop-columns {
			display: flex;
			gap: 20px;
		}

		.column {
			flex: 1;
			display: flex;
			flex-direction: column;
		}

		:global(.compact-article .article-excerpt) {
			display: none;
		}

		.desktop-first-page {
			display: block;
		}

		.first-page-top {
			display: flex;
			gap: 30px;
			border-bottom: 1px solid #b8b8b8;
			padding-bottom: 10px;
			margin-bottom: 10px;
		}

		.main-column {
			flex: 6;
			display: flex;
			flex-direction: column;
			padding-right: 20px;
		}

		.sidebar-column {
			flex: 4;
			display: flex;
			flex-direction: column;
		}

		.first-page-bottom {
			display: flex;
			gap: 20px;
		}

		.bottom-column {
			flex: 1;
			display: flex;
			flex-direction: column;
		}

		:global(.featured-article) {
			padding: 24px 0;
			border-bottom: 1px solid #b8b8b8;
		}

		:global(.featured-article:last-child) {
			border-bottom: none;
		}

		:global(.featured-article .article-headline) {
			font-size: 20px;
			margin-bottom: 8px;
		}

		:global(.featured-article .article-excerpt) {
			display: block;
		}

		:global(.sidebar-article) {
			padding: 16px 0;
		}

		:global(.sidebar-article .article-headline) {
			font-size: 17px;
		}
	}

	@media (max-width: 1023px) {
		.desktop-columns,
		.desktop-first-page {
			display: none;
		}

		.mobile-layout {
			display: block;
		}

		.mobile-nav-footer {
			display: block;
		}

		@media (min-width: 769px) and (max-width: 1023px) {
			:global(.full-article .article-excerpt) {
				display: block;
			}
		}
	}

	@media (max-width: 600px) {
		.mobile-nav-footer {
			padding: 15px 16px;
		}

		:global(.article-excerpt) {
			display: none;
		}

		:global(.article-headline) {
			margin-bottom: 4px;
		}

		:global(.article-headline a) {
			text-decoration: none !important;
		}

		:global(.article-source),
		:global(.article-time) {
			font-size: 15px;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.mobile-nav-footer {
			padding: 15px 16px;
		}

		:global(.article-excerpt) {
			display: none !important;
		}

		:global(.article-headline) {
			margin-bottom: 4px;
		}

		:global(.article-source),
		:global(.article-time) {
			font-size: 17px;
		}

		:global(.article-headline a),
		:global(.article-headline a:link),
		:global(.article-headline a:visited),
		:global(.article-headline a:hover),
		:global(.article-headline a:focus),
		:global(.article-headline a:active) {
			text-decoration: none !important;
			text-decoration-line: none !important;
			text-decoration-style: none !important;
			text-decoration-color: transparent !important;
			border-bottom: none !important;
			-webkit-text-decoration: none !important;
			-moz-text-decoration: none !important;
		}
	}

	@media screen and (max-device-width: 758px) {
		:global(.article-headline a) {
			text-decoration: none !important;
			text-decoration-line: none !important;
			text-decoration-style: none !important;
			text-decoration-color: transparent !important;
			border-bottom: none !important;
			-webkit-text-decoration: none !important;
			-moz-text-decoration: none !important;
		}
	}

	:global(.article-row),
	:global(.nav-btn) {
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}

	:global(.dark-mode) .articles-list {
		background: #1a1a1a;
	}

	:global(.dark-mode) .mobile-nav-footer {
		border-top-color: #333;
		background: #1a1a1a;
	}

	:global(.dark-mode) .first-page-top {
		border-color: #333;
	}

	:global(.dark-mode .featured-article) {
		border-bottom-color: #333;
	}
</style>
