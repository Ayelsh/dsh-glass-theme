/**
 * Model catalog — the data the skin adds on top of what the app knows.
 *
 * The app (and the Codex plugin) expose a model's id and label and nothing
 * else: a grep for `offPeak|pricePerM|description|icon` across every shipped
 * bundle finds no pricing, no description and no per-model icon. The reference
 * the user liked shows all three, so the skin has to own them. This file is
 * that ownership, kept separate so the decorator stays logic-only.
 *
 * THIS FILE IS A BARE OBJECT EXPRESSION, not a module: tools/build.mjs splices
 * it over the `/*__CATALOG__*\/null` literal in src/client.js, which keeps the
 * regular expressions below verbatim (a JSON round-trip would not).
 *
 * Two rules for editing:
 *
 *   1. Model keys are matched case-insensitively after stripping spaces, dots,
 *      dashes and the workbuddy ` · xN.NN` suffix, so `GPT-6-Luna`,
 *      `gpt 6 luna` and `GPT6Luna` all reach one entry.
 *
 *   2. Nothing here may claim to be official. `mark` is a monogram, not a logo;
 *      `tone` picks a decorative tint, not a trademark colour.
 */
{
  /**
   * Provider identity: the monogram tile, its tint, and the one-line summary in
   * the quick-provider row. `tone` resolves to `--lg-tint-<tone>` in model.css,
   * so a new provider needs one CSS variable, not a new rule.
   */
  providers: {
    'DeepSeek Account': { key: 'deepseek', mark: 'DS', tone: 'deepseek', label: 'DeepSeek', note: '官方账号' },
    workbuddy: { key: 'workbuddy', mark: 'WB', tone: 'workbuddy', label: 'WorkBuddy', note: '按倍率计费' },
    'zai-coding-cn': { key: 'zai', mark: 'Z', tone: 'zai', label: '智谱', note: '编码套餐' },
    Gemini: { key: 'gemini', mark: 'G', tone: 'gemini', label: 'Gemini', note: '订阅' },
    Grok: { key: 'grok', mark: 'X', tone: 'grok', label: 'Grok', note: '订阅' },
    'ChatGPT subscription': { key: 'openai', mark: 'AI', tone: 'openai', label: 'ChatGPT', note: '订阅' },
  },

  /**
   * Model families — which icon a row gets, independent of who resells it
   * (workbuddy serves GPT, Gemini, Kimi and GLM under one account). Matched
   * against the row label; FIRST HIT WINS, so specific names come before
   * generic ones.
   */
  families: [
    { key: 'deepseek', mark: 'DS', tone: 'deepseek', test: /deepseek/i },
    { key: 'gpt', mark: 'GP', tone: 'openai', test: /gpt|sol|terra|luna|astra|reserve/i },
    { key: 'gemini', mark: 'GE', tone: 'gemini', test: /gemini/i },
    { key: 'grok', mark: 'GR', tone: 'grok', test: /grok/i },
    { key: 'kimi', mark: 'KM', tone: 'kimi', test: /kimi|moonshot/i },
    { key: 'glm', mark: 'GL', tone: 'zai', test: /glm|zhipu|z\.ai/i },
    { key: 'minimax', mark: 'MM', tone: 'minimax', test: /minimax/i },
    { key: 'step', mark: 'ST', tone: 'step', test: /step/i },
    { key: 'hunyuan', mark: 'HY', tone: 'hunyuan', test: /^hy\d|hunyuan/i },
    { key: 'router', mark: 'AU', tone: 'router', test: /^auto$/i },
    { key: 'tier', mark: 'WB', tone: 'workbuddy', test: /^(fast|balanced|primary)$/i },
  ],

  /**
   * Description RULES, tried in order after the exact-name table above.
   *
   * The exact table only covers the models on screen today; a reseller adds
   * rows without asking, and a row with no line reads as an unfinished menu.
   * These are the same two-stage rules the reference implementation ships
   * (family first, then tier), so a model nobody hand-described still gets a
   * truthful sentence about what its line is for.
   *
   * FAMILY rules describe a MODEL LINE and are deliberately version-agnostic:
   * a retired Flash and a future one say the same thing. Order matters — the
   * anchored `deepseek.*flash` must come before the bare `deepseek`, or every
   * DeepSeek row inherits the generic line.
   */
  descriptionRules: [
    { test: "deepseek.*flash", text: "非对称模型结构，小成本大智能。" },
    { test: "deepseek.*pro", text: "性能比肩顶级闭源模型。" },
    { test: "deepseek", text: "更强、更快、更普惠。" },
    { test: "claude.*fable", text: "新一代智能，专为解决最艰深的知识工作和编程难题。" },
    { test: "claude.*mythos", text: "面向网络安全与生物学研究的可靠模型。" },
    { test: "claude.*opus", text: "面向复杂编程与 AI 智能体的混合推理模型。" },
    { test: "claude.*sonnet", text: "面向实时智能体与高吞吐的混合推理模型。" },
    { test: "claude.*haiku", text: "面向速度敏感的高吞吐场景，响应快、成本低。" },
    { test: "claude", text: "Anthropic Claude 模型。" },
    { test: "codex", text: "为 Codex 智能体编程优化，可并行处理多项软件工程任务。" },
    { test: "gpt[._-]?5[._-]?4(?!\\d)", text: "面向编程与专业工作的长上下文模型。" },
    { test: "gpt-?5", text: "内置思考、可配置推理强度，面向编程与智能体任务。" },
    { test: "(^|[/-])o[1-9](-|$)", text: "作答前深入思考，从 o1 到 o3 与 o4-mini。" },
    { test: "gpt-oss|oss-\\d", text: "OpenAI 开发的开放权重推理模型。" },
    { test: "gpt", text: "支持文本与图像输入、多语言。" },
    { test: "gemini.*(pro|ultra|Argon)", text: "面向复杂任务、深度推理与多模态理解。" },
    { test: "gemini.*flash", text: "速度与成本优先，面向规模化智能体任务与高频低延迟场景。" },
    { test: "gemini", text: "原生理解文本、图像、视频与音频。" },
    { test: "gemma", text: "源自 Gemini 研究，从云端服务器到手机都能运行。" },
    { test: "nano-?banana", text: "Gemini 图像生成与编辑模型，支持自然语言对话式创建与修改。" },
    { test: "glm[._-]?5[._-]?3.*flashx", text: "GLM 5.3 flash的高吞吐版本。" },
    { test: "glm[._-]?5[._-]?3.*flash", text: "GLM-5系列的首个原生多模态模型。" },
    { test: "glm[._-]?5[._-]?3(?!\\d)", text: "最强开放权重编程模型之一，拓展智能上界的可及边界。" },
    { test: "glm.*flash", text: "更快更省的多模态推理，兼顾长上下文与日常编程。" },
    { test: "glm", text: "覆盖对话、编程与智能体，支持思考模式与函数调用。" },
    { test: "kimi.*(k3|k-?3)|(^|[^a-z0-9])k-?3", text: "面向编程与知识工作的 2.8T 开放权重模型。" },
    { test: "kimi.*(cod(e|ing)|k2[._-]?7).*highspeed", text: "面向长程编程的开放权重智能体模型高速版。" },
    { test: "kimi.*(cod(e|ing)|k2[._-]?7)", text: "面向长程编程的开放权重智能体模型。" },
    { test: "kimi", text: "原生支持文本、图像与视频输入，含思考模式与工具调用。" },
    { test: "qwen[._-]?3[._-]?8.*max", text: "面向编程与办公，2.4 万亿参数 MoE，1M 上下文、思考模式与内置工具。" },
    { test: "qwen.*(coder|code)", text: "开放权重 MoE，面向补全、生成与仓库级修改。" },
    { test: "qwen.*(flash|turbo)", text: "响应快、成本低，工具调用与长上下文支持完整。" },
    { test: "qwen.*plus", text: "能力与成本均衡，完整工具调用支持。" },
    { test: "qwen.*a\\d+b", text: "总参大、激活参数少，单位成本低于同规模稠密模型。" },
    { test: "qwen.*[-_]\\d+b($|[^a-z])", text: "可本地或低成本部署。" },
    { test: "qwen", text: "开放权重与云端 API 并行，覆盖文本、图像、音频与视频。" },
    { test: "step[._-]?5(?!\\d)", text: "面向编程与专业知识工作，原生图文视频输入，1M 上下文。" },
    { test: "step[._-]?3[._-]?7.*flash", text: "面向智能体与代码任务，198B/11B 稀疏 MoE，图像与视频理解，256K 上下文，最高 400 tokens/s。" },
    { test: "step", text: "覆盖文本推理、多模态与语音，经官方开放平台提供。" },
    { test: "minimax.*m3|(^|[^a-z0-9])m3($|-)", text: "首个集前沿编程、1M 上下文与原生多模态于一身的开放权重模型。" },
    { test: "minimax|(^|[^a-z0-9])m2[-.]?\\d", text: "主打智能体推理、工具调用、编程与多模态输入，面向长上下文任务。" },
    { test: "muse-spark", text: "小而快、原生多模态推理，驱动 Meta AI。" },
    { test: "celeris[._-]?1(-|$)", text: "生成速度 1,664 tokens/s，超过 Mercury 2 的 5 倍，MMLU-Pro 75.9%。" },
    { test: "celeris", text: "扩散架构大语言模型，主打超低延迟生成。" },
    { test: "mercury-?\\d|inception", text: "面向代码生成，H100 上超 1,000 tokens/s，速度最高为同类模型的 10 倍。" },
    { test: "apodex", text: "面向复杂专业工作、金融与科研，1.1 mini 为 35B、可本地部署。" },
    { test: "motif", text: "MIT 许可，314B 总参 / 13.2B 激活，256K 上下文。" },
    { test: "grok[._-]?4(?!\\d)", text: "全球最智能的模型之一，支持原生工具使用以及实时搜索功能。" },
    { test: "grok", text: "覆盖编程、智能体与知识工作，API 支持多模态输入。" },
    { test: "doubao.*2[._-]?1(?!\\d)|seed[._-]?2[._-]?1(?!\\d)", text: "分 Pro 与 Turbo 两档的新一代生产力智能体，以通用任务与代码见长。" },
    { test: "doubao|seed-?\\d|volc", text: "经 50+ 内部业务场景验证，每日千亿级 token 用量打磨，支持多模态。" },
    { test: "ernie[._-]?5([._-]?0)?(-|$)", text: "2.4 万亿参数的原生全模态大模型。" },
    { test: "ernie", text: "产业级知识增强，支持中文理解与多模态生成。" },
    { test: "hunyuan|(^|[^a-z0-9])hy\\d", text: "中文理解与智能体场景表现均衡。" },
    { test: "codestral", text: "面向补全、FIM 与生成，128K 上下文。" },
    { test: "mistral.*large[._-]?3(?!\\d)", text: "Apache 2.0 开放权重多模态模型，细粒度 MoE，675B 总参 / 41B 激活，256K 上下文。" },
    { test: "mistral|magistral", text: "从云端到边缘的前沿模型，开放权重与商用并行，可 API 调用或自托管。" },
    { test: "llama", text: "可自由微调、蒸馏并部署到任何环境。" },
    { test: "north", text: "整合大模型、搜索与自动化成一个企业级安全工作空间。" },
    { test: "command-?[ar]|cohere", text: "面向工具调用、RAG 与多语言，Command A 为 111B/256K。" },
    { test: "phi-?\\d", text: "面向边缘与本地部署，Phi-4 以 14B 专注推理、数学与代码。" },
    { test: "(^|[^a-z0-9])nova(-|$)", text: "Micro/Lite/Pro/Premier 四档，支持文本、图像与视频输入。" },
    { test: "sonar|perplexity", text: "结合实时网络信息与引用的搜索 API，从轻量 Sonar 到多步深研 Sonar Pro。" },
  ],

  /**
   * TIER rules run only when no family matched. They read the SIZE/VARIANT
   * suffix of the name, which is the one thing every vendor spells the same
   * way. The two parameter-count rules come last and are anchored so that a
   * sparse-MoE suffix is not mistaken for a small dense model.
   */
  tierRules: [
    { test: "flash|mini|lite|nano|turbo|air|small|swift|highspeed|fast|instant", text: "响应快、成本低，适合简单或高频任务。" },
    { test: "pro|max|ultra|opus|thinking|reasoner|plus|large|advanced|heavy|frontier", text: "适合复杂或质量优先的任务，成本更高。" },
    { test: "a\\d+b", text: "总参大、激活参数少，单位成本低于同规模稠密模型。" },
    { test: "(^|[-_])\\d+b($|[^a-z])", text: "可本地或低成本部署。" },
  ],

  /**
   * One line per model, in the voice a person uses when choosing: what it is
   * FOR, not what it is. Kept short so it never truncates at the menu's 240px
   * floor. Keys are normalised (see the header).
   */
  descriptions: {
    'DeepSeek-V4.1-Flash': '日常对话与代码，速度优先',
    'DeepSeek-V4-Pro': '复杂推理与长任务',
    'DeepSeek-V3.2': '上一代通用模型',
    Auto: '按任务自动选择模型',
    Fast: '最快响应，适合简单任务',
    Balanced: '速度与质量的平衡点',
    Primary: '最强推理，适合难题',
    'Kimi-K2.8-Preview': '长上下文与中文写作',
    'Kimi-K3': '长文档与深度阅读',
    'Kimi-K2.6': '稳定版长上下文',
    'GLM-5.3-Flash': '智谱快速版，响应敏捷',
    'GLM-5.3': '智谱主力，综合均衡',
    'GLM-5.3 Highspeed': '极速版，适合轻量任务',
    'GLM-5.2': '上一代智谱主力',
    'GLM-4.6V': '支持图像理解',
    'GPT-6-Astra': '最新旗舰，最强通用能力',
    'GPT-6-Sol': '旗舰推理，擅长复杂代码',
    'GPT-6-Luna': '轻量旗舰，性价比高',
    'GPT-6.1-Sol': '旗舰推理的迭代版本',
    'GPT-5.6-Sol': '高难度代码与推理',
    'GPT-5.6-Terra': '均衡型主力模型',
    'GPT-5.6-Luna': '快速响应，日常首选',
    'GPT-5.5': '成熟稳定的通用模型',
    'GPT-5.4': '上一代通用模型',
    'GPT-Reserve': '实验性备用模型',
    'GPT-Reserve (Experimental)': '实验性备用模型，能力未定',
    'Gemini-3.5-Flash': '谷歌快速模型，多模态',
    'Gemini-3.8-Flash': '谷歌新一代快速模型',
    'Gemini 3.8 flash': '谷歌新一代快速模型',
    'Grok-4.7': '实时信息与推理',
    'Grok 4.7': '实时信息与推理',
    'MiniMax-M3.1-Flash': '长文本与语音场景',
    'Hy4 preview': '腾讯混元预览版',
    Hy3: '腾讯混元上一代',
    'Step-5-Preview': '阶跃星辰预览版',
  },

  /**
   * Peak / off-peak schedules. The chip in the picker reflects the SELECTED
   * model's provider, so the clock is per provider, not global:
   *
   *   deepseek — https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
   *     高峰 = 北京时间 周一至周五（不含法定节假日）9:00–12:00、14:00–18:00
   *     空闲时段价格 = 高峰时段价格的一半。Factors are stated from the CHEAPER
   *     baseline (高峰 ≈2×, 空闲 ≈1×) — the convention the reference used.
   *
   *   zai — 智谱 GLM (told by the user, 2026-10):
   *     高峰 = 工作日 14:00–18:00（北京时间，节假日除外），计费 ≈2×；
   *     空闲时段价格为高峰的一半 (≈1×)。
   *
   * Providers with no entry here (workbuddy, Gemini, Grok, ChatGPT) have no
   * published clock: the picker shows no chip for them rather than a borrowed
   * one. workbuddy rows reuse DeepSeek names but are billed by the reseller's
   * own `· xN.NN` multiplier, which is a different quantity and must not be
   * mixed in.
   *
   * The calendar facts every Beijing-clock schedule shares live at the top
   * level: the UTC offset and the holiday table.
   *
   * The holiday list is the part worth being careful about. 中国法定节假日 are
   * declared by the State Council each year and the 调休 (make-up work days)
   * that go with them move actual weekdays around, so a rule that only looks
   * at the weekday is wrong on roughly a dozen days a year — and those are
   * exactly the days a reader checks the chip. The dates below are the 2026
   * holiday days only; they are NOT recomputed, and the year is therefore part
   * of the data rather than of the logic. When the year rolls over the chip
   * stops claiming holiday accuracy for dates it has no table for: `holidays`
   * is keyed by year and a missing year simply falls back to the weekday rule.
   */
  pricing: {
    /** Beijing time, regardless of where the reader happens to be. */
    utcOffsetMinutes: 8 * 60,
    /** 中国法定节假日 (rest days), by Beijing calendar date, shared by every
     *  schedule below. 调休 work days are NOT included: they are ordinary
     *  weekdays and the weekday rule already treats them as peak, which is
     *  what every published schedule says. */
    holidays: {
      2026: [
        '01-01', '01-02', '01-03',
        '02-15', '02-16', '02-17', '02-18', '02-19', '02-20', '02-21', '02-22', '02-23',
        '04-04', '04-05', '04-06',
        '05-01', '05-02', '05-03', '05-04', '05-05',
        '06-19', '06-20', '06-21',
        '09-25', '09-26', '09-27',
        '10-01', '10-02', '10-03', '10-04', '10-05', '10-06', '10-07',
      ],
    },
    /** Keyed by the `key` in `providers` above. */
    providers: {
      deepseek: {
        windows: [
          [9 * 60, 12 * 60],
          [14 * 60, 18 * 60],
        ],
        weekdaysOnly: true,
        peakFactor: 2,
        offPeakFactor: 1,
        note: 'DeepSeek 高峰：北京时间周一至周五 9:00–12:00、14:00–18:00（中国法定节假日除外）；空闲时段价格为高峰的一半。',
      },
      zai: {
        windows: [
          [14 * 60, 18 * 60],
        ],
        weekdaysOnly: true,
        peakFactor: 2,
        offPeakFactor: 1,
        note: '智谱高峰：北京时间工作日 14:00–18:00（中国法定节假日除外）；空闲时段价格为高峰的一半。',
      },
    },
  },
}
