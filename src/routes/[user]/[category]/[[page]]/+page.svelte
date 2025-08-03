<script lang="ts">
	import type { PageProps } from './$types';
	import { onMount } from 'svelte';
	import Article from '$lib/components/Article.svelte';
	import NavigationButtons from '$lib/components/NavigationButtons.svelte';

	let { data }: PageProps = $props();
	let isDarkMode = $state(data.isDarkMode || false);

	function toggleTheme() {
		isDarkMode = !isDarkMode;
		document.documentElement.classList[isDarkMode ? 'add' : 'remove']('dark-theme');
		
		// Salva preferência no cookie
		document.cookie = `theme=${isDarkMode ? 'dark' : 'light'}; path=/; max-age=31536000`; // 1 ano
	}

	onMount(() => {
		// Sincroniza com o estado atual do DOM
		const hasThemeClass = document.documentElement.classList.contains('dark-theme');
		if (hasThemeClass !== isDarkMode) {
			isDarkMode = hasThemeClass;
		}
	});
</script>


	<div class="theme-app" class:dark-mode={isDarkMode}>
		<!-- Header com navegação no topo -->
		<header class="theme-header">
			<div class="header-content">
				<!-- Título à esquerda -->
				<button class="app-title" onclick={toggleTheme} type="button">
					Daily News
				</button>
				
				<!-- Informação de página no centro -->
				<div class="page-info">
					<span class="current-page">{data.news.page}</span>
					<span class="page-separator"> / </span>
					<span class="total-pages">{data.news.totalPages}</span>
				</div>
				
				<!-- Botões de navegação à direita -->
				<NavigationButtons 
					user={data.user} 
					category={data.news.category} 
					currentPage={data.news.page} 
					totalPages={data.news.totalPages} 
				/>
			</div>
		</header>

		<!-- Barra de categorias -->
		{#if data.news.allCategories && data.news.allCategories.length > 0}
			<div class="categories-bar">
				<div class="categories-content">
					{#each data.news.allCategories as category}
						<a href="/{data.user}/{category}/1" class="category-pill" class:current={category === data.news.category}>{category}</a>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Área principal - lista simples sem limites -->
		<main class="main-content">
			<div class="articles-list">
				<!-- Layout para desktop: área principal + sidebar -->
				<div class="desktop-layout">
					<!-- Seção principal - 2/3 da largura -->
					<div class="main-section">
						<!-- Primeiras 2 notícias - layout completo -->
						{#each data.news.items.slice(0, 2) as item}
							<Article {item} user={data.user} className="full-article" />
						{/each}
					</div>

					<!-- Sidebar - 1/3 da largura (apenas desktop) -->
					{#if data.news.items.length > 2}
						<aside class="sidebar-section">
							{#each data.news.items.slice(2, 6) as item}
								<Article {item} user={data.user} showExcerpt={false} className="sidebar-article" />
							{/each}
						</aside>
					{/if}
				</div>

				<!-- Layout mobile: todas as notícias em sequência simples -->
				<div class="mobile-layout">
					{#each data.news.items as item}
						<Article {item} user={data.user} className="mobile-article" />
					{/each}
					
					<!-- Botões de navegação no final - apenas mobile -->
					<div class="mobile-nav-footer">
						<NavigationButtons 
							user={data.user} 
							category={data.news.category} 
							currentPage={data.news.page} 
							totalPages={data.news.totalPages} 
							isMobile={true}
						/>
					</div>
				</div>

				<!-- Notícias restantes em grid (abaixo das principais no desktop) -->
				{#if data.news.items.length > 6}
					<div class="remaining-articles">
						<div class="column">
							{#each data.news.items.slice(6).filter((_: any, index: number) => index % 2 === 0) as item}
								<Article {item} user={data.user} className="compact-article" />
							{/each}
						</div>
						<div class="column">
							{#each data.news.items.slice(6).filter((_: any, index: number) => index % 2 === 1) as item}
								<Article {item} user={data.user} className="compact-article" />
							{/each}
						</div>
					</div>
				{:else if data.news.items.length > 2}
					<div class="remaining-articles">
						<div class="column">
							{#each data.news.items.slice(2).filter((_: any, index: number) => index % 2 === 0) as item}
								<Article {item} user={data.user} className="compact-article" />
							{/each}
						</div>
						<div class="column">
							{#each data.news.items.slice(2).filter((_: any, index: number) => index % 2 === 1) as item}
								<Article {item} user={data.user} className="compact-article" />
							{/each}
						</div>
					</div>
				{/if}
			</div>
		</main>
	</div>

<style>
	/* Reset e base */
	* {
		margin: 0;
		padding: 0;
		box-sizing: border-box;
	}

	/* Garantir que html e body sigam o tema */
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
	}

	:global(html.dark-theme),
	:global(html.dark-theme body) {
		background: #1a1a1a !important;
		color: #e0e0e0 !important;
		overflow-x: hidden;
	}

	:global(html),
	:global(body) {
		overflow-x: hidden;
	}

	/* Layout principal - design limpo e simples */
	.theme-app {
		min-height: 100vh;
		background: #fff;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
		color: #2c2c2c;
	}

	/* Header simples com navegação */
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
		font-size: 26px;
		font-weight: 700;
		color: #1a1a1a;
		letter-spacing: -0.5px;
		background: none;
		border: none;
		cursor: pointer;
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

	/* Barra de categorias */
	.categories-bar {
		background: #fff;
		border-bottom: 1px solid #e0e0e0;
		padding: 16px 20px;
		overflow-x: auto;
		scrollbar-width: none; /* Firefox */
		-ms-overflow-style: none; /* IE/Edge */
	}

	.categories-bar::-webkit-scrollbar {
		display: none; /* Chrome/Safari */
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

	/* Container dos botões de navegação - movido para componente */
	:global(.nav-buttons) {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	:global(.mobile-nav-buttons) {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 12px;
	}

	/* Área principal - sem limitação de altura */
	.main-content {
		padding: 0;
		background: #fff;
		width: 100%;
		overflow-x: hidden;
	}

	.articles-list {
		max-width: 800px;
		margin: 0 auto;
		background: #fff;
	}

	/* Layout mobile escondido por padrão */
	.mobile-layout {
		display: none;
	}

	/* Layout desktop visível por padrão */
	.desktop-layout {
		display: block;
	}

	/* Footer de navegação mobile - escondido por padrão */
	.mobile-nav-footer {
		display: none;
		padding: 20px;
		border-top: 1px solid #b8b8b8;
		background: #fff;
	}

	/* Layout Desktop - 1200px com colunas */
	@media (min-width: 1024px) {
		.header-content {
			max-width: 1200px;
		}
		
		.categories-content {
			max-width: 1200px;
			padding: 0 20px;
		}
		
		.articles-list {
			max-width: 1200px;
		}

		/* Layout principal desktop: 2/3 + 1/3 */
		.desktop-layout {
			display: flex;
			gap: 20px;
			margin-bottom: 0px;
		}

		/* Seção principal - 2/3 da largura */
		.main-section {
			flex: 2;
		}

		/* Sidebar - 1/3 da largura */
		.sidebar-section {
			flex: 1;
			padding: 0;
		}

		/* Artigos restantes em 2 colunas independentes */
		.remaining-articles {
			display: flex;
			gap: 40px;
			border-top: 1px solid #b8b8b8;
			margin-top: 20px;
		}

		.column {
			flex: 1;
			display: flex;
			flex-direction: column;
		}

		/* Remove descrição nos artigos compactos no desktop */
		:global(.compact-article .article-excerpt) {
			display: none;
		}
	}

	/* Mobile e Tablet - layout original */
	@media (max-width: 1023px) {
		/* Esconder layout desktop no mobile/tablet */
		.desktop-layout {
			display: none;
		}

		/* Esconder remaining articles no mobile/tablet */
		.remaining-articles {
			display: none;
		}

		/* Mostrar layout mobile no mobile/tablet */
		.mobile-layout {
			display: block;
		}

		/* Mostrar footer de navegação no mobile */
		.mobile-nav-footer {
			display: block;
		}
		
		/* Mostrar resumo apenas nas primeiras 2 notícias principais em tablets maiores */
		@media (min-width: 769px) and (max-width: 1023px) {
			:global(.full-article .article-excerpt) {
				display: block;
			}
		}
	}

	/* Responsividade */
	@media (max-width: 600px) {
		.theme-header {
			padding: 14px 16px;
		}
		
		.header-content {
			gap: 10px;
		}
		
		.app-title {
			font-size: 18px;
		}
		
		.page-info {
			font-size: 15px;
		}
		
		.current-page {
			font-size: 17px;
		}
		
		/* Ajustar padding do footer mobile */
		.mobile-nav-footer {
			padding: 15px 16px;
		}
		
		/* Ocultar resumo em celulares */
		:global(.article-excerpt) {
			display: none;
		}
		
		/* Ajustar espaçamento e remover underline dos títulos em celulares */
		:global(.article-headline) {
			margin-bottom: 4px;
		}
		
		:global(.article-headline a) {
			text-decoration: none !important;
		}
		
		:global(.article-source),
		:global(.article-time) {
			font-size: 13px;
		}
	}

	/* Media query específica para Kindle e e-readers */
	@media screen and (max-device-width: 758px),
		   screen and (max-width: 758px),
		   (pointer: coarse) and (max-width: 1023px) {
		
		/* Ajustar padding do footer mobile no Kindle */
		.mobile-nav-footer {
			padding: 15px 16px;
		}
		
		/* Ocultar resumo em Kindle e dispositivos similares */
		:global(.article-excerpt) {
			display: none !important;
		}
		
		/* Ajustar espaçamento e remover underline dos títulos */
		:global(.article-headline) {
			margin-bottom: 4px;
		}
		
		/* Remoção agressiva de underline para Kindle experimental browser */
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

	/* Remover animações para e-ink */
	* {
		transition: none !important;
		animation: none !important;
		box-shadow: none !important;
		text-shadow: none !important;
	}

	/* Regras específicas para Kindle experimental browser */
	@media screen and (max-device-width: 758px) {
		/* Específico para headlines */
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

	/* Otimizações para touch */
	:global(.article-row),
	:global(.nav-btn) {
		-webkit-tap-highlight-color: transparent;
		user-select: none;
	}

	/* TEMA ESCURO - Simples */
	.theme-app.dark-mode {
		background: #1a1a1a;
		color: #e0e0e0;
	}

	.dark-mode .theme-header {
		background: #1a1a1a;
		border-bottom-color: #333;
	}

	.dark-mode .main-content {
		background: #1a1a1a;
	}

	.dark-mode .articles-list {
		background: #1a1a1a;
	}

	.dark-mode .app-title {
		color: #e0e0e0;
	}

	.dark-mode .page-info {
		color: #999;
	}

	.dark-mode .current-page {
		color: #e0e0e0;
	}

	.dark-mode .page-separator {
		color: #666;
	}

	.dark-mode .total-pages {
		color: #999;
	}

	.dark-mode .categories-bar {
		background: #1a1a1a;
		border-bottom-color: #333;
	}

	.dark-mode .category-pill {
		background: #2a2a2a;
		color: #ccc;
		border-color: #444;
		text-decoration: none;
	}

	.dark-mode .category-pill.current {
		border: 3px solid #fff;
		font-weight: 700;
	}

	.dark-mode .remaining-articles {
		border-top-color: #333;
	}

	.dark-mode .mobile-nav-footer {
		border-top-color: #333;
		background: #1a1a1a;
	}

	/* Responsividade para mobile */
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
</style>
