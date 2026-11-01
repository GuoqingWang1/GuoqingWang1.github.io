export const locales = ['en', 'zh-CN'] as const;
export type Locale = typeof locales[number];

export function localizedPath(path: string, lang: Locale) {
  const unprefixed = path.replace(/^\/(?:en|zh)(?=\/|$)/, '') || '/';
  return lang === 'zh-CN' ? `/zh${unprefixed}` : unprefixed;
}

export const copy = {
  'zh-CN': {
    about: '关于', publications: '论文', blog: '博客',
    description: '研究大语言模型智能体、智能体强化学习与深度研究。',
    interests: '我的研究聚焦大语言模型与智能体，重点关注智能体强化学习和深度研究。我探索智能体如何获取与利用证据、从交互中学习，并完成复杂任务。我的研究兴趣也包括记忆与评测。',
    affiliation: '华东师范大学 · PhD',
    news: '动态', moreNews: '更多动态', lessNews: '收起动态', earlierNews: '较早动态',
    selectedPublications: '代表论文', allPublications: '更多论文',
    selectedWork: '精选工作', paperCollection: '论文资料合集',
    conferencePapers: '会议论文', technicalReports: '技术报告与预印本',
    leadWorkAndReports: '一作、共同一作与技术报告', otherPublications: '其他论文',
    firstAuthor: '第一作者', coFirstAuthor: '共同第一作者', coreContributor: '核心贡献者',
    publicationsDescription: 'Guoqing Wang 的论文，涉及语言模型、智能体、评测与检索。',
    blogDescription: 'Guoqing Wang 的技术笔记与研究随笔。',
    technical: '技术', reflection: '随笔', technicalReport: '技术报告', preprint: '预印本', code: '代码',
    allTopics: '全部', modelTopic: '模型计算', trainingTopic: '训练工程', runtimeTopic: '工具与运行时',
    noPosts: '暂无文章。', noCategoryPosts: '该分类暂无文章。',
    draftLabel: '初稿', otherLanguagePosts: '目前已有英文文章。',
    contents: '目录', allPosts: '全部文章', rss: 'RSS 订阅',
    copyCode: '复制', codeCopied: '已复制', copyFailed: '请选中代码手动复制', copyCodeLabel: '复制此代码块',
    notFound: '页面未找到', home: '返回首页',
    skip: '跳至正文', navigation: '主导航', openNavigation: '打开导航', closeNavigation: '关闭导航',
    profiles: '学术主页与联系', scholar: '谷歌学术', email: '邮箱',
    pauseMotion: '暂停背景动画', playMotion: '播放背景动画',
    switchLabel: 'EN', switchTitle: 'Switch to English', switchArticleTitle: 'Read this article in English', otherBlog: 'English blog',
  },
  en: {
    about: 'About', publications: 'Publications', blog: 'Blog',
    description: 'Research on LLM agents, agentic reinforcement learning, and deep research.',
    interests: 'My research focuses on large language models and agents, with an emphasis on agentic reinforcement learning and deep research. I study how agents gather and use evidence, learn from interaction, and tackle complex tasks. My broader interests include memory and evaluation.',
    affiliation: 'East China Normal University · PhD',
    news: 'News', moreNews: 'More news', lessNews: 'Less news', earlierNews: 'Earlier news',
    selectedPublications: 'Selected publications', allPublications: 'More publications',
    selectedWork: 'Selected work', paperCollection: 'Paper collection',
    conferencePapers: 'Conference papers', technicalReports: 'Technical reports & preprints',
    leadWorkAndReports: 'First / co-first author & reports', otherPublications: 'Other publications',
    firstAuthor: 'First author', coFirstAuthor: 'Co-first author', coreContributor: 'Core contributor',
    publicationsDescription: 'Publications by Guoqing Wang on language models, agents, evaluation, and retrieval.',
    blogDescription: 'Technical notes and reflections by Guoqing Wang.',
    technical: 'Technical', reflection: 'Reflection', technicalReport: 'Technical report', preprint: 'Preprint', code: 'Code',
    allTopics: 'All posts', modelTopic: 'Model computation', trainingTopic: 'Training engineering', runtimeTopic: 'Agent runtime',
    noPosts: 'No posts yet.', noCategoryPosts: 'No posts in this category.',
    draftLabel: 'Draft', otherLanguagePosts: 'Posts are currently available in Chinese.',
    contents: 'Contents', allPosts: 'All posts', rss: 'RSS',
    copyCode: 'Copy', codeCopied: 'Copied', copyFailed: 'Select and copy manually', copyCodeLabel: 'Copy this code block',
    notFound: 'Page not found', home: 'Home',
    skip: 'Skip to content', navigation: 'Main navigation', openNavigation: 'Open navigation', closeNavigation: 'Close navigation',
    profiles: 'Profiles and contact', scholar: 'Google Scholar', email: 'Email',
    pauseMotion: 'Pause background motion', playMotion: 'Play background motion',
    switchLabel: '中文', switchTitle: '切换为中文', switchArticleTitle: '阅读本文中文版', otherBlog: '中文博客',
  },
} as const;
