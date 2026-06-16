/**
 * 本地SQLite数据库初始化与CRUD接口
 * 所有数据均存储于设备本地，不上传服务器
 */
import * as SQLite from 'expo-sqlite';

// Web 环境无法使用 OPFS（navigator.storage.getDirectory 需要 HTTPS 安全上下文）
// Web 下注入 mock DB，所有接口返回空数据，避免崩溃
const _mockDb = {
  execAsync: async () => {},
  runAsync: async () => ({ changes: 0, lastInsertRowId: 0 }),
  getAllAsync: async () => [] as any[],
  getFirstAsync: async () => null,
};

// ── API Key 编码/解码（避免明文存储） ──
const B64_PREFIX = 'b64:';

/** 将明文 API Key 编码为 Base64（跨平台兼容） */
function encodeApiKey(key: string): string {
  if (!key) return '';
  // 已经编码过的不重复编码
  if (key.startsWith(B64_PREFIX)) return key;
  try {
    return B64_PREFIX + btoa(unescape(encodeURIComponent(key)));
  } catch {
    return key;
  }
}

/** 将 Base64 编码的 API Key 解码回明文 */
function decodeApiKey(encoded: string): string {
  if (!encoded) return '';
  // 兼容旧版明文存储
  if (!encoded.startsWith(B64_PREFIX)) return encoded;
  try {
    return decodeURIComponent(escape(atob(encoded.slice(B64_PREFIX.length))));
  } catch {
    return encoded;
  }
}

// 单例数据库promise，只初始化一次
// Web 环境直接 resolve mock，跳过 OPFS 初始化
const dbReady = process.env.EXPO_OS === 'web'
  ? Promise.resolve(_mockDb as unknown as SQLite.SQLiteDatabase)
  : SQLite.openDatabaseAsync('aiprivatetutor.db').then(async (db) => {
  await db.execAsync(`PRAGMA journal_mode = WAL;`);
  await db.execAsync(`PRAGMA foreign_keys = ON;`);
  await db.execAsync(`
    -- 词本表
    CREATE TABLE IF NOT EXISTS wordbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- 单词表
    CREATE TABLE IF NOT EXISTS words (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wordbook_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      phonetic TEXT DEFAULT '',
      meaning TEXT DEFAULT '',
      example TEXT DEFAULT '',
      language TEXT NOT NULL DEFAULT 'en',
      mastered INTEGER NOT NULL DEFAULT 0,
      review_stage INTEGER NOT NULL DEFAULT 0,
      next_review_at INTEGER NOT NULL DEFAULT 0,
      review_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (wordbook_id) REFERENCES wordbooks(id) ON DELETE CASCADE
    );

    -- 试卷表
    CREATE TABLE IF NOT EXISTS exampaper (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      language TEXT NOT NULL DEFAULT 'en',
      total_count INTEGER NOT NULL DEFAULT 0,
      progress INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- 题目表
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      options TEXT DEFAULT '[]',
      answer TEXT DEFAULT '',
      explanation TEXT DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (paper_id) REFERENCES exampaper(id) ON DELETE CASCADE
    );

    -- 答题记录表
    CREATE TABLE IF NOT EXISTS answer_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      user_answer TEXT DEFAULT '',
      is_correct INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (paper_id) REFERENCES exampaper(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    -- 错题强化相似题表
    CREATE TABLE IF NOT EXISTS similar_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_question_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'single',
      options TEXT DEFAULT '[]',
      answer TEXT DEFAULT '',
      content_hash TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (original_question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    -- 练习进度表
    CREATE TABLE IF NOT EXISTS practice_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      paper_id INTEGER NOT NULL UNIQUE,
      current_index INTEGER NOT NULL DEFAULT 0,
      answers TEXT DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      FOREIGN KEY (paper_id) REFERENCES exampaper(id) ON DELETE CASCADE
    );

    -- 每日学习统计表
    CREATE TABLE IF NOT EXISTS daily_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL UNIQUE,
      study_minutes INTEGER NOT NULL DEFAULT 0,
      new_words INTEGER NOT NULL DEFAULT 0,
      accuracy REAL NOT NULL DEFAULT 0,
      question_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- 学习时段记录表（用于精准计时）
    CREATE TABLE IF NOT EXISTS study_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module TEXT NOT NULL,
      start_at INTEGER NOT NULL,
      end_at INTEGER,
      date TEXT NOT NULL
    );

    -- 设置表（key-value存储）
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );

    -- AI服务配置表
    CREATE TABLE IF NOT EXISTS ai_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      model TEXT NOT NULL,
      api_key_enc TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- 操作日志表
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL DEFAULT 'info',
      message TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    -- 励志文案表
    CREATE TABLE IF NOT EXISTS mottos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    -- 索引：提升高频查询性能
    CREATE INDEX IF NOT EXISTS idx_words_wordbook_id ON words(wordbook_id);
    CREATE INDEX IF NOT EXISTS idx_words_next_review ON words(next_review_at);
    CREATE INDEX IF NOT EXISTS idx_questions_paper_id ON questions(paper_id);
    CREATE INDEX IF NOT EXISTS idx_answer_records_paper_id ON answer_records(paper_id);
    CREATE INDEX IF NOT EXISTS idx_answer_records_question_id ON answer_records(question_id);
    CREATE INDEX IF NOT EXISTS idx_similar_questions_original ON similar_questions(original_question_id);
    CREATE INDEX IF NOT EXISTS idx_study_sessions_date ON study_sessions(date);
  `);

  // 插入默认励志文案
  const mottoCount = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) as cnt FROM mottos');
  if (mottoCount && mottoCount.cnt === 0) {
    await db.execAsync(`
      INSERT INTO mottos (content, is_custom) VALUES
      ('知识是打开未来大门的钥匙。', 0),
      ('学习是一场没有终点的旅行。', 0),
      ('今日努力，明日辉煌。', 0),
      ('积累每一个单词，构筑你的语言大厦。', 0),
      ('坚持是成功最重要的因素。', 0),
      ('每天进步一点点，终究收获大不同。', 0),
      ('语言是通往世界的窗口。', 0),
      ('学无止境，思无涯际。', 0),
      ('勤学如春起之苗，不见其增，日有所长。', 0),
      ('专注当下，收获未来。', 0);
    `);
  }

  return db;
}); // Native SQLite 初始化结束

export async function getDb() {
  return dbReady;
}

// ============ 词本相关 ============

export interface Wordbook {
  id: number;
  name: string;
  language: string;
  created_at: number;
  updated_at: number;
  word_count?: number;
  mastered_count?: number;
}

export async function getWordbooks(language?: string): Promise<Wordbook[]> {
  const db = await getDb();
  // 使用参数化查询避免 SQL 注入
  const rows = language
    ? await db.getAllAsync<Wordbook>(`
        SELECT wb.*,
          COUNT(w.id) as word_count,
          SUM(CASE WHEN w.mastered = 1 THEN 1 ELSE 0 END) as mastered_count
        FROM wordbooks wb
        LEFT JOIN words w ON w.wordbook_id = wb.id
        WHERE wb.language = ?
        GROUP BY wb.id
        ORDER BY wb.updated_at DESC
      `, [language])
    : await db.getAllAsync<Wordbook>(`
        SELECT wb.*,
          COUNT(w.id) as word_count,
          SUM(CASE WHEN w.mastered = 1 THEN 1 ELSE 0 END) as mastered_count
        FROM wordbooks wb
        LEFT JOIN words w ON w.wordbook_id = wb.id
        GROUP BY wb.id
        ORDER BY wb.updated_at DESC
      `);
  return rows;
}

export async function createWordbook(name: string, language: string = 'en'): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO wordbooks (name, language, updated_at) VALUES (?, ?, ?)',
    [name, language, Math.floor(Date.now() / 1000)]
  );
  return result.lastInsertRowId;
}

export async function updateWordbook(id: number, name: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE wordbooks SET name = ?, updated_at = ? WHERE id = ?',
    [name, Math.floor(Date.now() / 1000), id]
  );
}

export async function deleteWordbook(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM wordbooks WHERE id = ?', [id]);
}

// ============ 单词相关 ============

export interface Word {
  id: number;
  wordbook_id: number;
  word: string;
  phonetic: string;
  meaning: string;
  example: string;
  language: string;
  mastered: number;
  review_stage: number;
  next_review_at: number;
  review_count: number;
  created_at: number;
}

// 艾宾浩斯遗忘曲线复习间隔（天）
const REVIEW_INTERVALS = [1, 2, 4, 7, 15];

export async function getWords(wordbookId: number): Promise<Word[]> {
  const db = await getDb();
  return db.getAllAsync<Word>('SELECT * FROM words WHERE wordbook_id = ? ORDER BY created_at ASC', [wordbookId]);
}

/** 在词本内按关键词搜索单词（word/meaning/example 三字段模糊匹配） */
export async function searchWords(wordbookId: number, query: string): Promise<Word[]> {
  const db = await getDb();
  const q = `%${query}%`;
  return db.getAllAsync<Word>(
    `SELECT * FROM words WHERE wordbook_id = ? AND (word LIKE ? OR meaning LIKE ? OR example LIKE ?) ORDER BY word ASC`,
    [wordbookId, q, q, q]
  );
}

export async function getWordsForReview(wordbookId?: number): Promise<Word[]> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const filter = wordbookId ? 'AND wordbook_id = ?' : '';
  const params: any[] = [now];
  if (wordbookId) params.push(wordbookId);
  return db.getAllAsync<Word>(
    `SELECT * FROM words WHERE next_review_at <= ? AND review_stage < 5 ${filter} ORDER BY next_review_at ASC`,
    params
  );
}

export async function addWord(data: Omit<Word, 'id' | 'created_at' | 'mastered' | 'review_stage' | 'next_review_at' | 'review_count'>): Promise<number> {
  const db = await getDb();
  // 新导入的单词 next_review_at 设为30天后，避免立即进入复习名单
  const thirtyDaysLater = Math.floor(Date.now() / 1000) + 30 * 86400;
  const result = await db.runAsync(
    'INSERT INTO words (wordbook_id, word, phonetic, meaning, example, language, next_review_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [data.wordbook_id, data.word, data.phonetic || '', data.meaning || '', data.example || '', data.language || 'en', thirtyDaysLater]
  );
  // 更新词本时间戳
  await db.runAsync('UPDATE wordbooks SET updated_at = ? WHERE id = ?', [Math.floor(Date.now() / 1000), data.wordbook_id]);
  return result.lastInsertRowId;
}

export async function updateWord(id: number, data: Partial<Pick<Word, 'word' | 'phonetic' | 'meaning' | 'example'>>): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.word !== undefined) { sets.push('word = ?'); vals.push(data.word); }
  if (data.phonetic !== undefined) { sets.push('phonetic = ?'); vals.push(data.phonetic); }
  if (data.meaning !== undefined) { sets.push('meaning = ?'); vals.push(data.meaning); }
  if (data.example !== undefined) { sets.push('example = ?'); vals.push(data.example); }
  if (sets.length === 0) return;
  vals.push(id);
  await db.runAsync(`UPDATE words SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function deleteWord(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM words WHERE id = ?', [id]);
}

export async function markWordMastered(id: number, mastered: boolean): Promise<void> {
  const db = await getDb();
  const word = await db.getFirstAsync<Word>('SELECT * FROM words WHERE id = ?', [id]);
  if (!word) return;
  const now = Math.floor(Date.now() / 1000);
  if (mastered) {
    const nextStage = Math.min(word.review_stage + 1, REVIEW_INTERVALS.length);
    const nextInterval = REVIEW_INTERVALS[nextStage - 1] || 15;
    const nextReviewAt = now + nextInterval * 86400;
    await db.runAsync(
      'UPDATE words SET mastered = 1, review_stage = ?, next_review_at = ?, review_count = review_count + 1 WHERE id = ?',
      [nextStage, nextReviewAt, id]
    );
  } else {
    // 未掌握：重置为第1天
    const nextReviewAt = now + 86400;
    await db.runAsync(
      'UPDATE words SET mastered = 0, review_stage = 0, next_review_at = ?, review_count = review_count + 1 WHERE id = ?',
      [nextReviewAt, id]
    );
  }
}

// ============ 试卷相关 ============

export interface ExamPaper {
  id: number;
  title: string;
  language: string;
  total_count: number;
  progress: number;
  created_at: number;
}

export interface Question {
  id: number;
  paper_id: number;
  content: string;
  type: string;
  options: string;
  answer: string;
  explanation: string;
  sort_order: number;
}

export async function getExamPapers(): Promise<ExamPaper[]> {
  const db = await getDb();
  return db.getAllAsync<ExamPaper>('SELECT * FROM exampaper ORDER BY created_at DESC');
}

export async function createExamPaper(title: string, language: string = 'en'): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO exampaper (title, language) VALUES (?, ?)',
    [title, language]
  );
  return result.lastInsertRowId;
}

export async function deleteExamPaper(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM exampaper WHERE id = ?', [id]);
}

export async function getQuestions(paperId: number): Promise<Question[]> {
  const db = await getDb();
  return db.getAllAsync<Question>('SELECT * FROM questions WHERE paper_id = ? ORDER BY sort_order ASC', [paperId]);
}

export async function addQuestions(paperId: number, questions: Omit<Question, 'id' | 'paper_id'>[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const q of questions) {
      await db.runAsync(
        'INSERT INTO questions (paper_id, content, type, options, answer, explanation, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [paperId, q.content, q.type, q.options || '[]', q.answer || '', q.explanation || '', q.sort_order]
      );
    }
  });
  // 查询实际题目数，避免多次调用时覆盖
  const countRow = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM questions WHERE paper_id = ?', [paperId]);
  await db.runAsync('UPDATE exampaper SET total_count = ? WHERE id = ?', [countRow?.cnt ?? questions.length, paperId]);
}

export async function updateQuestion(id: number, data: Partial<Question>): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.content !== undefined) { sets.push('content = ?'); vals.push(data.content); }
  if (data.type !== undefined) { sets.push('type = ?'); vals.push(data.type); }
  if (data.options !== undefined) { sets.push('options = ?'); vals.push(data.options); }
  if (data.answer !== undefined) { sets.push('answer = ?'); vals.push(data.answer); }
  if (data.explanation !== undefined) { sets.push('explanation = ?'); vals.push(data.explanation); }
  if (sets.length === 0) return;
  vals.push(id);
  await db.runAsync(`UPDATE questions SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// ============ 答题记录 ============

export interface AnswerRecord {
  id: number;
  paper_id: number;
  question_id: number;
  user_answer: string;
  is_correct: number;
  created_at: number;
}

export async function saveAnswerRecord(paperId: number, questionId: number, userAnswer: string, isCorrect: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO answer_records (paper_id, question_id, user_answer, is_correct) VALUES (?, ?, ?, ?)',
    [paperId, questionId, userAnswer, isCorrect ? 1 : 0]
  );
}

export async function getWrongAnswers(paperId: number): Promise<(AnswerRecord & { question: Question })[]> {
  const db = await getDb();
  const records = await db.getAllAsync<AnswerRecord & { q_content: string; q_type: string; q_options: string; q_answer: string }>(
    `SELECT ar.*, q.content as q_content, q.type as q_type, q.options as q_options, q.answer as q_answer
     FROM answer_records ar
     JOIN questions q ON q.id = ar.question_id
     WHERE ar.paper_id = ? AND ar.is_correct = 0
     ORDER BY ar.created_at DESC`,
    [paperId]
  );
  return records.map(r => ({
    ...r,
    question: { id: r.question_id, paper_id: paperId, content: r.q_content, type: r.q_type, options: r.q_options, answer: r.q_answer, explanation: '', sort_order: 0 }
  }));
}

export async function getAllWrongAnswers(): Promise<(AnswerRecord & { question: Question; paper_title: string })[]> {
  const db = await getDb();
  return db.getAllAsync<any>(
    `SELECT ar.*, q.content as q_content, q.type as q_type, q.options as q_options, q.answer as q_answer,
     ep.title as paper_title
     FROM answer_records ar
     JOIN questions q ON q.id = ar.question_id
     JOIN exampaper ep ON ep.id = ar.paper_id
     WHERE ar.is_correct = 0
     ORDER BY ar.created_at DESC`
  );
}

// ============ 练习进度 ============

export async function savePracticeProgress(paperId: number, currentIndex: number, answers: Record<string, string>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT OR REPLACE INTO practice_progress (paper_id, current_index, answers, updated_at) VALUES (?, ?, ?, ?)',
    [paperId, currentIndex, JSON.stringify(answers), Math.floor(Date.now() / 1000)]
  );
}

export async function getPracticeProgress(paperId: number): Promise<{ current_index: number; answers: Record<string, string> } | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ current_index: number; answers: string }>(
    'SELECT current_index, answers FROM practice_progress WHERE paper_id = ?', [paperId]
  );
  if (!row) return null;
  try {
    return { current_index: row.current_index, answers: JSON.parse(row.answers) };
  } catch {
    return null;
  }
}

export async function clearPracticeProgress(paperId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM practice_progress WHERE paper_id = ?', [paperId]);
}

// ============ 每日统计 ============

export interface DailyStat {
  date: string;
  study_minutes: number;
  new_words: number;
  accuracy: number;
  question_count: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getTodayStat(): Promise<DailyStat> {
  const db = await getDb();
  const row = await db.getFirstAsync<DailyStat>('SELECT * FROM daily_stats WHERE date = ?', [today()]);
  return row || { date: today(), study_minutes: 0, new_words: 0, accuracy: 0, question_count: 0 };
}

export async function updateTodayStat(delta: Partial<Omit<DailyStat, 'date'>>): Promise<void> {
  const db = await getDb();
  const d = today();
  const incMinutes = delta.study_minutes || 0;
  const incWords = delta.new_words || 0;
  const incQCount = delta.question_count || 0;
  // 加权平均正确率需要读取当前值
  let newAccuracy: number | null = null;
  if (delta.accuracy !== undefined && delta.question_count) {
    const cur = await getTodayStat();
    const totalQ = (cur.question_count || 0) + delta.question_count;
    newAccuracy = totalQ > 0
      ? ((cur.accuracy * (cur.question_count || 0)) + (delta.accuracy * delta.question_count)) / totalQ
      : 0;
  }
  if (newAccuracy !== null) {
    await db.runAsync(
      `INSERT INTO daily_stats (date, study_minutes, new_words, accuracy, question_count)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         study_minutes = study_minutes + ?, new_words = new_words + ?,
         accuracy = ?, question_count = question_count + ?,
         updated_at = strftime('%s','now')`,
      [d, incMinutes, incWords, newAccuracy ?? 0, incQCount,
       incMinutes, incWords, newAccuracy, incQCount]
    );
  } else {
    await db.runAsync(
      `INSERT INTO daily_stats (date, study_minutes, new_words, accuracy, question_count)
       VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(date) DO UPDATE SET
         study_minutes = study_minutes + ?, new_words = new_words + ?,
         question_count = question_count + ?, updated_at = strftime('%s','now')`,
      [d, incMinutes, incWords, incQCount, incMinutes, incWords, incQCount]
    );
  }
}

export async function resetTodayStat(): Promise<void> {
  const db = await getDb();
  const todayDate = today();
  await db.runAsync(
    `INSERT INTO daily_stats (date, study_minutes, new_words, accuracy, question_count)
     VALUES (?, 0, 0, 0, 0)
     ON CONFLICT(date) DO UPDATE SET
       study_minutes = 0, new_words = 0, accuracy = 0, question_count = 0, updated_at = strftime('%s','now')`,
    [todayDate]
  );
}

export async function getDailyStats(days: number = 30): Promise<DailyStat[]> {
  const db = await getDb();
  return db.getAllAsync<DailyStat>(
    `SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?`, [days]
  );
}

// ============ 设置 ============

export async function getSetting(key: string, defaultVal: string = ''): Promise<string> {
  // Web 下 SQLite 为 mock，用 localStorage 持久化
  if (process.env.EXPO_OS === 'web') {
    try { return localStorage.getItem(`setting_${key}`) ?? defaultVal; } catch { return defaultVal; }
  }
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : defaultVal;
}

export async function setSetting(key: string, value: string): Promise<void> {
  // Web 下 SQLite 为 mock，用 localStorage 持久化
  if (process.env.EXPO_OS === 'web') {
    try { localStorage.setItem(`setting_${key}`, value); } catch { /* ignore */ }
    return;
  }
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
}

// ============ AI配置 ============

export interface AiConfig {
  id: number;
  name: string;
  endpoint: string;
  model: string;
  api_key_enc: string;
  is_active: number;
  created_at: number;
}

export async function getAiConfigs(): Promise<AiConfig[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AiConfig>('SELECT * FROM ai_configs ORDER BY created_at DESC');
  return rows.map(r => ({ ...r, api_key_enc: decodeApiKey(r.api_key_enc) }));
}

export async function saveAiConfig(config: Omit<AiConfig, 'id' | 'created_at'>): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    'INSERT INTO ai_configs (name, endpoint, model, api_key_enc, is_active) VALUES (?, ?, ?, ?, ?)',
    [config.name, config.endpoint, config.model, encodeApiKey(config.api_key_enc), config.is_active]
  );
  return result.lastInsertRowId;
}

export async function updateAiConfig(id: number, data: Partial<Omit<AiConfig, 'id' | 'created_at'>>): Promise<void> {
  const db = await getDb();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push('name = ?'); vals.push(data.name); }
  if (data.endpoint !== undefined) { sets.push('endpoint = ?'); vals.push(data.endpoint); }
  if (data.model !== undefined) { sets.push('model = ?'); vals.push(data.model); }
  if (data.api_key_enc !== undefined) { sets.push('api_key_enc = ?'); vals.push(encodeApiKey(data.api_key_enc)); }
  if (data.is_active !== undefined) { sets.push('is_active = ?'); vals.push(data.is_active); }
  if (sets.length === 0) return;
  vals.push(id);
  await db.runAsync(`UPDATE ai_configs SET ${sets.join(', ')} WHERE id = ?`, vals);
}

export async function setActiveAiConfig(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('UPDATE ai_configs SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END', [id]);
}

export async function deleteAiConfig(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM ai_configs WHERE id = ?', [id]);
}

export async function getActiveAiConfig(): Promise<AiConfig | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AiConfig>('SELECT * FROM ai_configs WHERE is_active = 1 LIMIT 1');
  return row ? { ...row, api_key_enc: decodeApiKey(row.api_key_enc) } : null;
}

// ============ 日志 ============

export async function addLog(level: string, message: string, detail: string = ''): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO operation_logs (level, message, detail) VALUES (?, ?, ?)', [level, message, detail]);
  // 仅当日志总数超过 600 时才清理，避免每条写入都执行 DELETE
  const count = await db.getFirstAsync<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM operation_logs');
  if (count && count.cnt > 600) {
    await db.runAsync('DELETE FROM operation_logs WHERE id NOT IN (SELECT id FROM operation_logs ORDER BY created_at DESC LIMIT 500)');
  }
}

export async function getLogs(): Promise<{ id: number; level: string; message: string; detail: string; created_at: number }[]> {
  const db = await getDb();
  return db.getAllAsync('SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT 500');
}

// ============ 励志文案 ============

export interface Motto {
  id: number;
  content: string;
  is_custom: number;
}

export async function getMottos(): Promise<Motto[]> {
  const db = await getDb();
  return db.getAllAsync<Motto>('SELECT * FROM mottos ORDER BY id ASC');
}

export async function addMotto(content: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('INSERT INTO mottos (content, is_custom) VALUES (?, 1)', [content]);
}

export async function deleteMotto(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM mottos WHERE id = ? AND is_custom = 1', [id]);
}

// ============ 导出词本为CSV ============

function escapeCsvField(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return `"${escaped}"`;
}

export async function exportWordbookCsv(wordbookId: number): Promise<string> {
  const words = await getWords(wordbookId);
  const lines = ['单词,音标,释义,例句,已掌握'];
  for (const w of words) {
    lines.push(`${escapeCsvField(w.word)},${escapeCsvField(w.phonetic)},${escapeCsvField(w.meaning)},${escapeCsvField(w.example)},${w.mastered ? '是' : '否'}`);
  }
  return lines.join('\n');
}

// ============ 相似题 ============

export interface SimilarQuestion {
  id: number;
  original_question_id: number;
  content: string;
  type: string;
  options: string;
  answer: string;
  content_hash: string;
  created_at: number;
}

export async function getSimilarQuestions(originalId: number): Promise<SimilarQuestion[]> {
  const db = await getDb();
  return db.getAllAsync<SimilarQuestion>('SELECT * FROM similar_questions WHERE original_question_id = ? ORDER BY created_at ASC', [originalId]);
}

export async function saveSimilarQuestion(data: Omit<SimilarQuestion, 'id' | 'created_at'>): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO similar_questions (original_question_id, content, type, options, answer, content_hash) VALUES (?, ?, ?, ?, ?, ?)',
    [data.original_question_id, data.content, data.type, data.options, data.answer, data.content_hash]
  );
}

// 简单哈希函数
export function simpleHash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h.toString(16);
}

// ============ 周统计 ============

export async function getWeekStats(days: number = 7): Promise<DailyStat[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<DailyStat>(
    `SELECT * FROM daily_stats ORDER BY date DESC LIMIT ?`, [days]
  );
  // 补全缺失日期，确保返回完整 N 天
  const rowsByDate = new Map(rows.map(r => [r.date, r]));
  const result: DailyStat[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    const found = rowsByDate.get(dateStr);
    result.push(found || { date: dateStr, study_minutes: 0, new_words: 0, accuracy: 0, question_count: 0 });
  }
  return result;
}

// ============ 词本统计 ============

export interface WordStats {
  total: number;
  mastered: number;
}

export async function getWordStats(wordbookId: number): Promise<WordStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total: number; mastered: number }>(
    `SELECT COUNT(*) as total, SUM(CASE WHEN mastered = 1 THEN 1 ELSE 0 END) as mastered FROM words WHERE wordbook_id = ?`,
    [wordbookId]
  );
  return { total: row?.total ?? 0, mastered: row?.mastered ?? 0 };
}

// ============ 成就统计 ============

export interface AchievementStats {
  streakDays: number;
  totalMinutes: number;
  totalWords: number;
  totalQuestions: number;
}

/** 连续打卡天数：从今天向前数，统计连续有学习记录（study_minutes > 0 或 new_words > 0 或 question_count > 0）的天数 */
export async function getStreakDays(): Promise<number> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM daily_stats WHERE (study_minutes > 0 OR new_words > 0 OR question_count > 0) ORDER BY date DESC`
  );
  if (!rows.length) return 0;
  // 使用 Set 提升查找效率 O(1)
  const activeDates = new Set(rows.map(r => r.date));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    if (activeDates.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export async function getCumulativeStats(): Promise<AchievementStats> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ total_minutes: number; total_words: number; total_questions: number }>(
    `SELECT COALESCE(SUM(study_minutes),0) as total_minutes, COALESCE(SUM(new_words),0) as total_words, COALESCE(SUM(question_count),0) as total_questions FROM daily_stats`
  );
  const streak = await getStreakDays();
  return {
    streakDays: streak,
    totalMinutes: row?.total_minutes ?? 0,
    totalWords: row?.total_words ?? 0,
    totalQuestions: row?.total_questions ?? 0,
  };
}

/** 获取热力图所需的学习天数数据（最多支持 N 天） */
export async function getDailyStatsHeatmap(days: number = 90): Promise<{ date: string; value: number }[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ date: string; study_minutes: number; new_words: number; question_count: number }>(
    `SELECT date, study_minutes, new_words, question_count FROM daily_stats ORDER BY date DESC LIMIT ?`,
    [days]
  );
  // 将活跃程度归一化到 0-4（用于热力图颜色深度）
  const map = new Map<string, number>();
  for (const r of rows) {
    const total = (r.study_minutes || 0) + (r.new_words || 0) + (r.question_count || 0);
    let level = 0;
    if (total > 0) level = 1;
    if (total >= 10) level = 2;
    if (total >= 30) level = 3;
    if (total >= 60) level = 4;
    map.set(r.date, level);
  }
  // 补全完整 N 天数据（从今天倒推）
  const result: { date: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    result.push({ date: dateStr, value: map.get(dateStr) ?? 0 });
  }
  return result;
}

/** 复习预测：未来 N 天每天到期需要复习的单词数 */
export async function getReviewForecast(days: number = 7): Promise<{ date: string; count: number }[]> {
  const db = await getDb();
  const now = Math.floor(Date.now() / 1000);
  const result: { date: string; count: number }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const dayStart = Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 1000);
    const dayEnd = dayStart + 86400;
    const row = await db.getFirstAsync<{ cnt: number }>(
      `SELECT COUNT(*) as cnt FROM words WHERE next_review_at >= ? AND next_review_at < ?`,
      [dayStart, dayEnd]
    );
    // 第0天（今天）同时包含已逾期（next_review_at < now）的词
    if (i === 0) {
      const overdue = await db.getFirstAsync<{ cnt: number }>(
        `SELECT COUNT(*) as cnt FROM words WHERE next_review_at > 0 AND next_review_at < ? AND mastered = 0`,
        [dayStart]
      );
      result.push({ date: dateStr, count: (row?.cnt ?? 0) + (overdue?.cnt ?? 0) });
    } else {
      result.push({ date: dateStr, count: row?.cnt ?? 0 });
    }
  }
  return result;
}

// ============ 今日计划 ============

export interface TodayPlan {
  wordGoal: number;
  questionGoal: number;
}

export async function getTodayPlan(): Promise<TodayPlan> {
  const raw = await getSetting('today_plan', '');
  if (!raw) return { wordGoal: 20, questionGoal: 10 };
  try { return JSON.parse(raw); } catch { return { wordGoal: 20, questionGoal: 10 }; }
}

export async function saveTodayPlan(plan: TodayPlan): Promise<void> {
  await setSetting('today_plan', JSON.stringify(plan));
}

// ============ 励志文案设置 ============

export interface MottoSettings {
  customMotto: string;
  remoteUrl: string;
  intervalMin: number;
  /** 从 API JSON 响应中提取文案的字段路径，如 "yiyan"、"data.content"、"list[0].text" */
  contentField?: string;
  /** 从 API JSON 响应中提取作者/来源的字段路径，如 "nick"、"data.author"（可选） */
  authorField?: string;
}

export async function getMottoSettings(): Promise<MottoSettings | null> {
  const raw = await getSetting('motto_settings', '');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveMottoSettings(s: MottoSettings): Promise<void> {
  await setSetting('motto_settings', JSON.stringify(s));
  // 同步将自定义文案写入 mottos 表（is_custom=2 标识来自配置页），首页 getMottos 可直接读取
  const db = await getDb();
  const lines = s.customMotto.split('\n').map(l => l.trim()).filter(Boolean);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM mottos WHERE is_custom = 2');
    for (const line of lines) {
      await db.runAsync('INSERT INTO mottos (content, is_custom) VALUES (?, 2)', [line]);
    }
  });
}

// ============ 应用日志（别名） ============

export async function getAppLogs(): Promise<{ id: number; level: string; message: string; detail: string; created_at: number }[]> {
  return getLogs();
}

// ============ 数据库备份与恢复 ============

export interface BackupSummary {
  wordbooks: number;
  words: number;
  papers: number;
  questions: number;
  answers: number;
  stats: number;
  mottos: number;
}

/** 查询各表数据条数，供备份页面展示"将备份哪些数据" */
export async function getBackupSummary(): Promise<BackupSummary> {
  const db = await getDb();
  const row = (tbl: string) =>
    db.getFirstAsync<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM ${tbl}`);
  const [wb, wd, pp, qq, ar, ds, mo] = await Promise.all([
    row('wordbooks'), row('words'), row('exampaper'),
    row('questions'), row('answer_records'), row('daily_stats'), row('mottos'),
  ]);
  return {
    wordbooks: wb?.cnt ?? 0,
    words: wd?.cnt ?? 0,
    papers: pp?.cnt ?? 0,
    questions: qq?.cnt ?? 0,
    answers: ar?.cnt ?? 0,
    stats: ds?.cnt ?? 0,
    mottos: mo?.cnt ?? 0,
  };
}

export async function exportDatabaseBackup(): Promise<Record<string, unknown>> {
  const db = await getDb();
  const wordbooks = await db.getAllAsync('SELECT * FROM wordbooks');
  const words = await db.getAllAsync('SELECT * FROM words');
  const papers = await db.getAllAsync('SELECT * FROM exampaper');
  const questions = await db.getAllAsync('SELECT * FROM questions');
  const answers = await db.getAllAsync('SELECT * FROM answer_records');
  const stats = await db.getAllAsync('SELECT * FROM daily_stats');
  const mottos = await db.getAllAsync('SELECT * FROM mottos');
  const settings = await db.getAllAsync('SELECT * FROM settings');
  const aiConfigs = await db.getAllAsync('SELECT * FROM ai_configs');
  return { wordbooks, words, papers, questions, answers, stats, mottos, settings, aiConfigs, exportedAt: new Date().toISOString() };
}

export async function importDatabaseBackup(data: Record<string, unknown>): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    // 清空现有数据
    await db.execAsync(`
      DELETE FROM words; DELETE FROM wordbooks;
      DELETE FROM questions; DELETE FROM exampaper;
      DELETE FROM answer_records; DELETE FROM daily_stats;
      DELETE FROM mottos WHERE is_custom = 1;
      DELETE FROM settings; DELETE FROM ai_configs;
    `);
    // 恢复词本
    for (const row of (data.wordbooks as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO wordbooks (id, name, language, created_at) VALUES (?, ?, ?, ?)', [row.id, row.name, row.language, row.created_at]);
    }
    // 恢复单词
    for (const row of (data.words as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO words (id, wordbook_id, word, phonetic, meaning, example, mastered, review_stage, next_review_at, review_count, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [row.id, row.wordbook_id, row.word, row.phonetic, row.meaning, row.example, row.mastered, row.review_stage, row.next_review_at, row.review_count, row.created_at]);
    }
    // 恢复试卷（兼容旧备份中的 papers 键名）
    for (const row of (data.papers as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO exampaper (id, title, language, created_at) VALUES (?, ?, ?, ?)', [row.id, row.title, row.language, row.created_at]);
    }
    // 恢复题目
    for (const row of (data.questions as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO questions (id, paper_id, content, type, options, answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.id, row.paper_id, row.content, row.type, row.options, row.answer, row.explanation]);
    }
    // 恢复答题记录
    for (const row of (data.answers as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO answer_records (id, paper_id, question_id, user_answer, is_correct, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [row.id, row.paper_id, row.question_id, row.user_answer, row.is_correct, row.created_at || row.answered_at]);
    }
    // 恢复统计
    for (const row of (data.stats as any[] || [])) {
      await db.runAsync('INSERT OR IGNORE INTO daily_stats (date, study_minutes, new_words, accuracy, question_count) VALUES (?, ?, ?, ?, ?)',
        [row.date, row.study_minutes, row.new_words, row.accuracy, row.question_count]);
    }
    // 恢复文案（仅自定义）
    for (const row of ((data.mottos as any[] || []).filter((r: any) => r.is_custom))) {
      await db.runAsync('INSERT OR IGNORE INTO mottos (id, content, is_custom) VALUES (?, ?, ?)',
        [row.id, row.content, row.is_custom]);
    }
    // 恢复设置
    for (const row of (data.settings as any[] || [])) {
      await db.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [row.key, row.value]);
    }
    // 恢复AI配置（兼容 api_key 旧字段名）
    for (const row of (data.aiConfigs as any[] || [])) {
      const keyEnc = row.api_key_enc ?? row.api_key ?? '';
      await db.runAsync('INSERT OR IGNORE INTO ai_configs (id, name, endpoint, model, api_key_enc, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [row.id, row.name, row.endpoint, row.model, keyEnc, row.is_active, row.created_at]);
    }
  });
}
