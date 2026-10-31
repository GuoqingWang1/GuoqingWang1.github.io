export const locales = ['zh-CN', 'en'] as const;
export type Locale = typeof locales[number];

export function localizedPath(path: string, lang: Locale) {
  const unprefixed = path.replace(/^\/en(?=\/|$)/, '') || '/';
  return lang === 'en' ? `/en${unprefixed}` : unprefixed;
}

export const copy = {
  'zh-CN': {
    about: '关于', publications: '论文', blog: '博客',
    description: '研究大语言模型智能体、智能体强化学习与深度研究。',
    interests: '我的研究方向包括大语言模型、大语言模型智能体、智能体强化学习与深度研究。',
    affiliation: '华东师范大学',
    selectedPublications: '代表论文', allPublications: '更多论文',
    conferencePapers: '会议论文', technicalReports: '技术报告与预印本',
    publicationsDescription: 'Guoqing Wang 的部分论文，涉及语言模型、智能体、评测与检索。',
    blogDescription: 'Guoqing Wang 的技术笔记与研究随笔。',
    technical: '技术', reflection: '随笔', technicalReport: '技术报告', code: '代码',
    noPosts: '暂无文章。', noCategoryPosts: '该分类暂无文章。',
    contents: '目录', allPosts: '全部文章', rss: 'RSS 订阅',
    notFound: '页面未找到', home: '返回首页',
    skip: '跳至正文', navigation: '主导航', openNavigation: '打开导航', closeNavigation: '关闭导航',
    profiles: '学术主页', scholar: '谷歌学术',
    pauseMotion: '暂停背景动画', playMotion: '播放背景动画',
    switchLabel: 'English', switchTitle: 'Switch to English', otherBlog: 'English blog',
  },
  en: {
    about: 'About', publications: 'Publications', blog: 'Blog',
    description: 'Research on LLM agents, agentic reinforcement learning, and deep research.',
    interests: 'My research interests are large language models, LLM agents, agentic reinforcement learning, and deep research.',
    affiliation: 'East China Normal University',
    selectedPublications: 'Selected publications', allPublications: 'More publications',
    conferencePapers: 'Conference papers', technicalReports: 'Technical reports & preprints',
    publicationsDescription: 'Selected publications by Guoqing Wang on language models, agents, evaluation, and retrieval.',
    blogDescription: 'Technical notes and reflections by Guoqing Wang.',
    technical: 'Technical', reflection: 'Reflection', technicalReport: 'Technical report', code: 'Code',
    noPosts: 'No posts yet.', noCategoryPosts: 'No posts in this category.',
    contents: 'Contents', allPosts: 'All posts', rss: 'RSS',
    notFound: 'Page not found', home: 'Home',
    skip: 'Skip to content', navigation: 'Main navigation', openNavigation: 'Open navigation', closeNavigation: 'Close navigation',
    profiles: 'Academic profiles', scholar: 'Google Scholar',
    pauseMotion: 'Pause background motion', playMotion: 'Play background motion',
    switchLabel: '中文', switchTitle: '切换为中文', otherBlog: '中文博客',
  },
} as const;
