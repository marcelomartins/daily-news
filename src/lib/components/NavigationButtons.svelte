<script lang="ts">
	let {
		user,
		category,
		currentPage,
		totalPages,
		isMobile = false
	}: {
		user: string;
		category: string;
		currentPage: number;
		totalPages: number;
		isMobile?: boolean;
	} = $props();
</script>

<div class="nav-buttons" class:mobile-nav-buttons={isMobile}>
	{#if currentPage > 1}
		<a href="/{user}/{category}/{currentPage - 1}" class="nav-btn nav-prev">
			<span class="nav-icon">‹</span>
			<span class="nav-text">Anterior</span>
		</a>
	{:else}
		<div class="nav-btn nav-disabled">
			<span class="nav-icon">‹</span>
			<span class="nav-text">Anterior</span>
		</div>
	{/if}

	{#if currentPage < totalPages}
		<a href="/{user}/{category}/{currentPage + 1}" class="nav-btn nav-next">
			<span class="nav-text">Próxima</span>
			<span class="nav-icon">›</span>
		</a>
	{:else}
		<div class="nav-btn nav-disabled">
			<span class="nav-text">Próxima</span>
			<span class="nav-icon">›</span>
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
		padding: 12px 18px;
		background: #f0f0f0;
		border: none;
		border-radius: 20px;
		text-decoration: none;
		color: #333;
		font-size: 16px;
		font-weight: 500;
		min-width: 90px;
		justify-content: center;
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
			padding: 8px 12px;
			font-size: 13px;
			min-width: 65px;
		}
		
		.nav-text {
			display: none;
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
