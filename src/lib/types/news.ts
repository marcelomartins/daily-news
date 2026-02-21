export interface NewsItem {
	title: string;
	link: string;
	description: string;
	pubDate: string;
	fullContent?: string;
	source?: string;
	sourceUrl?: string;
	flag?: boolean;
	headline?: boolean;
	headlineSource?: string;
	localReaderHref?: string;
}

export interface NewsData {
	category: string;
	page: number;
	totalPages: number;
	allCategories: string[];
	items: NewsItem[];
}
