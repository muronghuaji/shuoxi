export const GENRE_GROUPS = [
  {
    name: '幻想',
    genres: ['玄幻', '奇幻', '武侠', '仙侠', '修真', '洪荒', '克苏鲁', '赛博朋克'],
  },
  {
    name: '都市',
    genres: ['都市', '现实', '职场', '商战', '官场', '乡村', '娱乐', '美食', '校园'],
  },
  {
    name: '历史 · 军事',
    genres: ['历史', '军事', '战争', '古代权谋', '宫斗', '宅斗', '种田'],
  },
  {
    name: '科幻 · 末世',
    genres: ['科幻', '星际', '末世', '无限流', '系统', '诸天', '时空'],
  },
  {
    name: '悬疑 · 灵异',
    genres: ['悬疑', '推理', '犯罪', '惊悚', '恐怖', '灵异', '盗墓', '刑侦'],
  },
  {
    name: '言情',
    genres: ['言情', '古言', '现言', '幻言', '青春', '豪门', '纯爱', '百合', '无CP'],
  },
  {
    name: '次元',
    genres: ['游戏', '体育', '竞技', '轻小说', '二次元', '同人', '短篇'],
  },
  {
    name: '热门流派',
    genres: ['重生', '穿越', '快穿', '穿书', '女强', '群像', '甜宠', '虐恋'],
  },
  {
    name: '其他',
    genres: ['其他'],
  },
] as const

export type Genre = (typeof GENRE_GROUPS)[number]['genres'][number]

export interface GenreCategory {
  name: string
  genres: readonly Genre[]
}

export const GENRE_CATEGORIES: readonly GenreCategory[] = GENRE_GROUPS

export const GENRES: Genre[] = GENRE_GROUPS.flatMap((group) => [...group.genres])

export const QUICK_GENRES: Genre[] = ['玄幻', '都市', '悬疑', '言情', '科幻', '历史']

const GENRE_SET: ReadonlySet<string> = new Set(GENRES)

export function isGenre(value: unknown): value is Genre {
  return typeof value === 'string' && GENRE_SET.has(value)
}
