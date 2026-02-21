<script lang="ts">
	import NavigationButtons from "$lib/components/NavigationButtons.svelte";

	let {
		user,
		category,
		currentPage,
		totalPages,
		onToggleTheme,
		themeToggleHref,
		showReaderBack = false,
		onReaderBack,
		readerBackHref,
	}: {
		user: string;
		category: string;
		currentPage: number;
		totalPages: number;
		onToggleTheme?: () => void;
		themeToggleHref?: string;
		showReaderBack?: boolean;
		onReaderBack?: () => void;
		readerBackHref?: string;
	} = $props();

	function handleTitleClick(event: MouseEvent) {
		if (!onToggleTheme) {
			return;
		}

		event.preventDefault();
		onToggleTheme();
	}
</script>

<header class="theme-header">
	<div class="header-content">
		<a
			class="app-title app-title-link"
			href={themeToggleHref || "/"}
			onclick={handleTitleClick}>Daily News</a
		>

		<div class="page-info">
			<span class="current-page">{currentPage}</span>
			<span class="page-separator"> / </span>
			<span class="total-pages">{totalPages}</span>
		</div>

		{#if showReaderBack}
			{#if onReaderBack}
				<button
					type="button"
					class="reader-nav-back"
					onclick={onReaderBack}
				>
					<span class="reader-nav-icon">↶</span>
				</button>
			{:else}
				<a href={readerBackHref || "/"} class="reader-nav-back">
					<span class="reader-nav-icon">↶</span>
				</a>
			{/if}
		{:else}
			<NavigationButtons {user} {category} {currentPage} {totalPages} />
		{/if}
	</div>
</header>

<style>
	.theme-header {
		background: #fff;
		border-bottom: 1px solid #e0e0e0;
		padding: 16px 20px;
	}

	.header-content {
		display: flex;
		justify-content: space-between;
		align-items: center;
		max-width: 800px;
		margin: 0 auto;
		gap: 20px;
	}

	.app-title {
		display: inline-flex;
		align-items: center;
		height: 48px;
		margin: 0;
		padding: 0;
		font-family: inherit;
		font-size: 26px;
		font-weight: 700;
		line-height: 1;
		color: #1a1a1a;
		letter-spacing: -0.5px;
		background: none;
		border: none;
		cursor: pointer;
	}

	.app-title-link {
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}

	.page-info {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 17px;
		color: #666;
		font-weight: 500;
	}

	.current-page {
		font-weight: 700;
		color: #000;
		font-size: 19px;
	}

	.page-separator {
		color: #999;
		font-size: 15px;
	}

	.reader-nav-back {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 48px;
		padding: 0 18px;
		background: #f0f0f0;
		border: none;
		border-radius: 20px;
		color: #333;
		font-size: 16px;
		line-height: 1;
		font-weight: 500;
		min-width: 65px;
		justify-content: center;
		cursor: pointer;
		box-sizing: border-box;
		appearance: none;
		-webkit-appearance: none;
		text-decoration: none;
	}

	.reader-nav-icon {
		font-size: 18px;
		font-weight: 300;
	}

	:global(.dark-mode) .theme-header {
		background: #1a1a1a;
		border-bottom-color: #333;
	}

	:global(.dark-mode) .app-title {
		color: #e0e0e0;
	}

	:global(.dark-mode) .page-info {
		color: #999;
	}

	:global(.dark-mode) .current-page {
		color: #e0e0e0;
	}

	:global(.dark-mode) .page-separator {
		color: #666;
	}

	:global(.dark-mode) .reader-nav-back {
		background: #333;
		color: #e0e0e0;
	}

	:global(.dark-mode) .total-pages {
		color: #999;
	}

	@media (min-width: 1024px) {
		.header-content {
			max-width: 1200px;
		}
	}

	@media (max-width: 600px) {
		.theme-header {
			padding: 14px 16px;
		}

		.header-content {
			gap: 10px;
		}

		.app-title {
			height: 40px;
			font-size: 18px;
		}

		.page-info {
			font-size: 15px;
		}

		.current-page {
			font-size: 17px;
		}

		.reader-nav-back {
			height: 40px;
			padding: 0 12px;
			font-size: 13px;
			min-width: 65px;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.theme-header {
			padding: 16px;
		}

		.app-title {
			height: 48px;
			font-size: 24px;
		}

		.page-info {
			font-size: 18px;
		}

		.current-page {
			font-size: 21px;
		}

		.reader-nav-back {
			height: 48px;
			padding: 0 16px;
			font-size: 16px;
			min-width: 110px;
		}

		.reader-nav-icon {
			font-size: 20px;
		}
	}
</style>
