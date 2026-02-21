<script lang="ts">
	import type { PageProps } from "./$types";
	import CategoriesBar from "$lib/components/news-page/CategoriesBar.svelte";
	import NewsArticlesLayout from "$lib/components/news-page/NewsArticlesLayout.svelte";
	import NewsHeader from "$lib/components/news-page/NewsHeader.svelte";

	let { data }: PageProps = $props();
	let isDarkModeOverride = $state<boolean | null>(null);

	let isDarkMode = $derived(
		isDarkModeOverride !== null ? isDarkModeOverride : data.isDarkMode || false,
	);
	const themeToggleHref = $derived(
		`/${encodeURIComponent(data.user)}/${encodeURIComponent(data.news.category)}/${data.news.page}?theme=toggle`,
	);

	function toggleTheme() {
		isDarkModeOverride = !isDarkMode;
		document.documentElement.classList[
			isDarkModeOverride ? "add" : "remove"
		]("dark-theme");

		document.cookie = `theme=${isDarkModeOverride ? "dark" : "light"}; path=/; max-age=31536000; SameSite=Lax`;
	}
</script>

<div class="theme-app" class:dark-mode={isDarkMode}>
	<NewsHeader
		user={data.user}
		category={data.news.category}
		currentPage={data.news.page}
		totalPages={data.news.totalPages}
		onToggleTheme={toggleTheme}
		themeToggleHref={themeToggleHref}
	/>

	<CategoriesBar
		user={data.user}
		categories={data.news.allCategories || []}
		currentCategory={data.news.category}
	/>

	<main class="main-content">
		<NewsArticlesLayout
			news={data.news}
			user={data.user}
		/>
	</main>
</div>

<style>
	* {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		overflow-x: hidden;
	}

	:global(html.dark-theme),
	:global(html.dark-theme body) {
		background: #1a1a1a !important;
		color: #e0e0e0 !important;
		overflow-x: hidden;
	}

	.theme-app {
		min-height: 100vh;
		background: #fff;
		font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
		color: #2c2c2c;
	}

	.main-content {
		padding: 0;
		background: #fff;
		width: 100%;
		overflow-x: hidden;
	}

	* {
		transition: none !important;
		animation: none !important;
		box-shadow: none !important;
		text-shadow: none !important;
	}

	.theme-app.dark-mode {
		background: #1a1a1a;
		color: #e0e0e0;
	}

	.dark-mode .main-content {
		background: #1a1a1a;
	}
</style>
