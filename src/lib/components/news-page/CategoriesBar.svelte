<script lang="ts">
	let {
		user,
		categories,
		currentCategory,
	}: {
		user: string;
		categories: string[];
		currentCategory: string;
	} = $props();

	function getCategoryHref(category: string) {
		return `/${encodeURIComponent(user)}/${encodeURIComponent(category)}/1`;
	}
</script>

{#if categories.length > 0}
	<div class="categories-bar">
		<div class="categories-content">
			{#each categories as category}
				<a
					href={getCategoryHref(category)}
					class="category-pill"
					class:current={category === currentCategory}>{category}</a
				>
			{/each}
		</div>
	</div>
{/if}

<style>
	.categories-bar {
		background: #fff;
		border-bottom: 1px solid #e0e0e0;
		padding: 16px 20px;
		margin-bottom: 10px;
		overflow-x: auto;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}

	.categories-bar::-webkit-scrollbar {
		display: none;
	}

	.categories-content {
		display: flex;
		gap: 12px;
		max-width: 800px;
		margin: 0 auto;
		align-items: center;
		flex-wrap: nowrap;
		justify-content: flex-start;
		padding: 0 20px;
	}

	.category-pill {
		background: #f8f9fa;
		color: #555;
		padding: 8px 20px;
		border-radius: 20px;
		font-size: 15px;
		font-weight: 500;
		border: 1px solid #e0e0e0;
		white-space: nowrap;
		cursor: pointer;
		text-decoration: none;
	}

	.category-pill.current {
		border: 2px solid #616161;
		font-weight: 700;
	}

	:global(.dark-mode) .categories-bar {
		background: #1a1a1a;
		border-bottom-color: #333;
	}

	:global(.dark-mode) .category-pill {
		background: #2a2a2a;
		color: #ccc;
		border-color: #444;
		text-decoration: none;
	}

	:global(.dark-mode) .category-pill.current {
		border: 3px solid #fff;
		font-weight: 700;
	}

	@media (min-width: 1024px) {
		.categories-content {
			max-width: 1200px;
			padding: 0 20px;
		}
	}

	@media (max-width: 768px) {
		.categories-bar {
			padding: 16px 16px;
		}

		.categories-content {
			gap: 10px;
			padding: 0;
		}

		.category-pill {
			padding: 7px 14px;
			font-size: 15px;
		}
	}

	@media screen and (max-device-width: 758px),
		screen and (max-width: 758px),
		(pointer: coarse) and (max-width: 1023px) {
		.categories-bar {
			padding: 16px;
		}

		.categories-content {
			gap: 12px;
		}

		.category-pill {
			font-size: 18px;
			padding: 10px 16px;
		}
	}
</style>
