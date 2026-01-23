export interface PaletteColor {
    notionColor: string;
    hex: string;
}

export const NOTION_COLORS: PaletteColor[] = [
    { notionColor: 'red', hex: '#E03131' },
    { notionColor: 'blue', hex: '#1971C2' },
    { notionColor: 'green', hex: '#2F9E44' },
    { notionColor: 'orange', hex: '#D9480F' },
    { notionColor: 'pink', hex: '#D6336C' },
    { notionColor: 'purple', hex: '#7048E8' },
    { notionColor: 'yellow', hex: '#E67700' },
    { notionColor: 'brown', hex: '#795548' },
];

export const getColorForIndex = (index: number) => {
    return NOTION_COLORS[index % NOTION_COLORS.length];
};
