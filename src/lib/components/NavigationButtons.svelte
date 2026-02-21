<script lang="ts">
	let {
		user,
		category,
		currentPage,
		totalPages,
		isMobile = false,
	}: {
		user: string;
		category: string;
		currentPage: number;
		totalPages: number;
		isMobile?: boolean;
	} = $props();

	const encodedUser = $derived(encodeURIComponent(user));
	const encodedCategory = $derived(encodeURIComponent(category));
	const previousPageHref = $derived(
		`/${encodedUser}/${encodedCategory}/${currentPage - 1}`,
	);
	const nextPageHref = $derived(
		`/${encodedUser}/${encodedCategory}/${currentPage + 1}`,
	);
</script>

<div class="nav-buttons" class:mobile-nav-buttons={isMobile}>
	{#if currentPage > 1}
		<a href={previousPageHref} class="nav-btn nav-prev">
			<span class="nav-icon">«</span>
		</a>
	{:else}
		<div class="nav-btn nav-disabled">
			<span class="nav-icon">«</span>
		</div>
	{/if}

	{#if currentPage < totalPages}
		<a href={nextPageHref} class="nav-btn nav-next">
			<span class="nav-icon">»</span>
		</a>
	{:else}
		<div class="nav-btn nav-disabled">
			<span class="nav-icon">»</span>
		</div>
	{/if}
</div>

<style>
	.nav-buttons {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.mobile-nav-buttons {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 12px;
	}

	.nav-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 48px;
		padding: 0 18px;
		background: #f0f0f0;
		border: none;
		border-radius: 20px;
		text-decoration: none;
		color: #333;
		font-size: 16px;
		line-height: 1;
		font-weight: 500;
		min-width: 65px;
		justify-content: center;
		box-sizing: border-box;
	}

	.nav-btn.nav-disabled {
		background: #f8f8f8;
		color: #bbb;
	}

	.nav-icon {
		font-size: 18px;
		font-weight: 300;
	}

	/* Mobile responsiveness */
	@media (max-width: 600px) {
		.nav-buttons {
			gap: 8px;
		}

		.nav-btn {
			height: 40px;
			padding: 0 12px;
			font-size: 13px;
			min-width: 65px;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.nav-btn {
			height: 48px;
			padding: 0 16px;
			font-size: 16px;
			min-width: 110px;
		}

		.nav-icon {
			font-size: 20px;
		}
	}

	/* Tema escuro */
	:global(.dark-mode) .nav-btn {
		background: #333;
		color: #e0e0e0;
	}

	:global(.dark-mode) .nav-btn:active {
		background: #555;
	}

	:global(.dark-mode) .nav-btn.nav-disabled {
		background: #222;
		color: #666;
	}
</style>
