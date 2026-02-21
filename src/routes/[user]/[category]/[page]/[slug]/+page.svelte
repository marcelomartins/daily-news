<script lang="ts">
	import type { PageProps } from "./$types";
	import NewsHeader from "$lib/components/news-page/NewsHeader.svelte";
	import ReaderView from "$lib/components/news-page/ReaderView.svelte";

	let { data }: PageProps = $props();
	let isDarkModeOverride = $state<boolean | null>(null);

	let isDarkMode = $derived(
		isDarkModeOverride !== null ? isDarkModeOverride : data.isDarkMode || false,
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
		category={data.category}
		currentPage={data.page}
		totalPages={data.totalPages}
		onToggleTheme={toggleTheme}
		themeToggleHref={data.themeToggleHref}
		showReaderBack={true}
		readerBackHref={data.backHref}
	/>

	<main class="main-content">
		<ReaderView article={data.article} paragraphs={data.paragraphs} />
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
