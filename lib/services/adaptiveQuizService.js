const DEFAULT_LOOKBACK_DAYS = 14;
const DEFAULT_QUESTION_COUNT = 12;
const MAX_QUESTION_COUNT = 30;

const TYPE_ALIASES = {
  multiple_choice: 'abcd',
  true_false: 'truefalse',
  fill_blank: 'number'
};

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeQuestionText(value) {
  return String(value || '')
    .replace(/\s*\[\s*\d+(?:[.,]\d+)?\s*pts?\s*\]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

function normalizeAnswerText(value) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('vi');
}

function normalizeType(value) {
  const normalized = TYPE_ALIASES[value] || value || 'abcd';
  return ['abcd', 'truefalse', 'number'].includes(normalized) ? normalized : null;
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((option) => {
      if (typeof option === 'string' || typeof option === 'number') {
        return { text: String(option) };
      }

      if (!option || typeof option !== 'object') return null;

      const text = option.text ?? option.label ?? option.value;
      if (text === undefined || text === null) return null;
      return { ...option, text: String(text) };
    })
    .filter((option) => option && option.text.trim().length > 0);
}

function findChoiceLetter(answer, options) {
  if (typeof answer === 'number' && answer >= 0 && answer < options.length) {
    return String.fromCharCode(65 + answer);
  }

  if (typeof answer === 'string') {
    const letterMatch = answer.trim().match(/^([A-D])(?:[.)])?$/i);
    const letter = letterMatch?.[1]?.toUpperCase();
    if (letter && letter.charCodeAt(0) - 65 < options.length) {
      return letter;
    }

    const normalizedAnswer = normalizeAnswerText(answer);
    const matchingIndex = options.findIndex(
      (option) => normalizeAnswerText(option.text) === normalizedAnswer
    );
    if (matchingIndex >= 0 && matchingIndex < 4) {
      return String.fromCharCode(65 + matchingIndex);
    }
  }

  return null;
}

function resolveCorrectAnswer(type, sourceQuestion, resultQuestion, options) {
  const sourceAnswer = sourceQuestion?.correct ?? sourceQuestion?.correctAnswer;
  const resultAnswer = resultQuestion?.correct ?? resultQuestion?.correctAnswer;
  const answer = sourceAnswer ?? resultAnswer;

  if (type === 'abcd') {
    return findChoiceLetter(answer, options);
  }

  if (type === 'truefalse') {
    if (Array.isArray(answer) && answer.length > 0) {
      return answer.map((item) => {
        if (typeof item === 'string') return item.toLowerCase() === 'true';
        return Boolean(item);
      });
    }
    if (typeof answer === 'boolean') return [answer];
    return null;
  }

  if (type === 'number' && answer !== undefined && answer !== null && String(answer).trim()) {
    return String(answer).trim();
  }

  return null;
}

function findOriginalQuestion(lesson, resultQuestion) {
  if (!lesson || !Array.isArray(lesson.questions)) return null;
  const targetText = normalizeQuestionText(resultQuestion?.question || resultQuestion?.text);
  if (!targetText) return null;

  return lesson.questions.find((question) => (
    normalizeQuestionText(question?.question || question?.text) === targetText
  )) || null;
}

function buildReusableQuestion(sourceQuestion, resultQuestion) {
  const type = normalizeType(sourceQuestion?.type || resultQuestion?.type);
  if (!type) return null;

  const question = String(
    sourceQuestion?.question || sourceQuestion?.text ||
    resultQuestion?.question || resultQuestion?.text || ''
  ).trim();
  if (!question) return null;

  const options = normalizeOptions(
    sourceQuestion?.options?.length
      ? sourceQuestion.options
      : (resultQuestion?.optionsText || resultQuestion?.options)
  );
  const correct = resolveCorrectAnswer(type, sourceQuestion, resultQuestion, options);

  if (type === 'abcd' && (options.length < 2 || !correct)) return null;
  if (type === 'truefalse' && (!options.length || !Array.isArray(correct))) return null;
  if (type === 'number' && correct === null) return null;

  const parsedPoints = Number(sourceQuestion?.points ?? resultQuestion?.points);
  const reusableQuestion = {
    question,
    type,
    options,
    correct,
    points: Number.isFinite(parsedPoints) && parsedPoints > 0 ? parsedPoints : 1
  };

  ['imageUrl', 'image', 'questionImage', 'explanation', 'unit', 'tolerance'].forEach((field) => {
    const value = sourceQuestion?.[field] ?? resultQuestion?.[field];
    if (value !== undefined && value !== null && value !== '') {
      reusableQuestion[field] = value;
    }
  });

  return reusableQuestion;
}

function getLessonMetadata(result, lesson) {
  return {
    id: String(result.lesson_id || lesson?.id || ''),
    title: lesson?.title || result.lessons?.title || 'Bài học không xác định',
    subject: lesson?.subject || result.lessons?.subject || 'physics',
    grade: lesson?.grade ?? result.lessons?.grade ?? null
  };
}

function analyzeRecentMistakes(sourceData = {}, requestedOptions = {}) {
  const days = clampInteger(requestedOptions.days, DEFAULT_LOOKBACK_DAYS, 1, 90);
  const count = clampInteger(requestedOptions.count, DEFAULT_QUESTION_COUNT, 1, MAX_QUESTION_COUNT);
  const studentId = requestedOptions.studentId && requestedOptions.studentId !== 'all'
    ? String(requestedOptions.studentId)
    : null;
  const subject = requestedOptions.subject && requestedOptions.subject !== 'all'
    ? String(requestedOptions.subject).toLocaleLowerCase('vi')
    : null;
  const now = requestedOptions.now ? new Date(requestedOptions.now) : new Date();
  const cutoffTime = now.getTime() - (days * 24 * 60 * 60 * 1000);

  const lessons = Array.isArray(sourceData.lessons) ? sourceData.lessons : [];
  const lessonById = new Map(lessons.map((lesson) => [String(lesson.id), lesson]));
  const lessonQuestionIndexById = new Map(lessons.map((lesson) => {
    const questionIndex = new Map();
    (Array.isArray(lesson.questions) ? lesson.questions : []).forEach((question) => {
      const normalizedText = normalizeQuestionText(question?.question || question?.text);
      if (normalizedText && !questionIndex.has(normalizedText)) {
        questionIndex.set(normalizedText, question);
      }
    });
    return [String(lesson.id), questionIndex];
  }));
  const results = (Array.isArray(sourceData.results) ? sourceData.results : []).filter((result) => {
    const resultTime = new Date(result.timestamp).getTime();
    if (!Number.isFinite(resultTime) || resultTime < cutoffTime) return false;
    if (studentId && String(result.student_id) !== studentId) return false;

    if (subject) {
      const lesson = lessonById.get(String(result.lesson_id));
      const resultSubject = lesson?.subject || result.lessons?.subject || '';
      if (String(resultSubject).toLocaleLowerCase('vi') !== subject) return false;
    }
    return true;
  });

  const candidateMap = new Map();
  const studentMap = new Map();
  const sourceMap = new Map();
  const attemptsWithMistakes = new Set();
  let totalMistakes = 0;
  let unusableMistakes = 0;
  let latestActivity = null;

  results.forEach((result) => {
    if (!Array.isArray(result.questions)) return;
    const lesson = lessonById.get(String(result.lesson_id));
    const lessonMetadata = getLessonMetadata(result, lesson);
    const resultTime = new Date(result.timestamp);

    result.questions.forEach((resultQuestion, questionIndex) => {
      if (!resultQuestion || resultQuestion.isCorrect !== false) return;

      totalMistakes += 1;
      attemptsWithMistakes.add(String(result.id));
      if (!latestActivity || resultTime > latestActivity) latestActivity = resultTime;

      const studentKey = String(result.student_id || 'unknown');
      const studentName = result.students?.full_name || 'Học sinh chưa xác định';
      if (!studentMap.has(studentKey)) {
        studentMap.set(studentKey, {
          id: studentKey,
          name: studentName,
          mistakeCount: 0,
          lastMistakeAt: result.timestamp
        });
      }
      const student = studentMap.get(studentKey);
      student.mistakeCount += 1;
      if (new Date(result.timestamp) > new Date(student.lastMistakeAt)) {
        student.lastMistakeAt = result.timestamp;
      }

      const normalizedText = normalizeQuestionText(resultQuestion.question || resultQuestion.text);
      const candidateKey = `${lessonMetadata.id}::${normalizedText || `${result.id}-${questionIndex}`}`;
      let candidate = candidateMap.get(candidateKey);

      if (!candidate) {
        const originalQuestion = lessonQuestionIndexById
          .get(lessonMetadata.id)
          ?.get(normalizedText) || findOriginalQuestion(lesson, resultQuestion);
        const questionData = buildReusableQuestion(originalQuestion, resultQuestion);
        if (!questionData) {
          unusableMistakes += 1;
          return;
        }

        candidate = {
          id: candidateKey,
          question: questionData.question,
          type: questionData.type,
          points: questionData.points,
          lesson: lessonMetadata,
          mistakeCount: 0,
          studentIds: new Set(),
          lastMistakeAt: result.timestamp,
          questionData
        };
        candidateMap.set(candidateKey, candidate);
      }

      candidate.mistakeCount += 1;
      candidate.studentIds.add(studentKey);
      if (new Date(result.timestamp) > new Date(candidate.lastMistakeAt)) {
        candidate.lastMistakeAt = result.timestamp;
      }

      if (!sourceMap.has(lessonMetadata.id)) {
        sourceMap.set(lessonMetadata.id, {
          ...lessonMetadata,
          mistakeCount: 0,
          questionIds: new Set(),
          studentIds: new Set()
        });
      }
      const source = sourceMap.get(lessonMetadata.id);
      source.mistakeCount += 1;
      source.questionIds.add(candidateKey);
      source.studentIds.add(studentKey);
    });
  });

  const allCandidates = Array.from(candidateMap.values()).map((candidate) => {
    const ageInDays = Math.max(0, (now.getTime() - new Date(candidate.lastMistakeAt).getTime()) / 86400000);
    const recencyScore = Math.max(0, 1 - (ageInDays / days));
    const rankScore = (candidate.mistakeCount * 4) + (candidate.studentIds.size * 2) + (recencyScore * 5);

    return {
      ...candidate,
      studentCount: candidate.studentIds.size,
      rankScore: Math.round(rankScore * 10) / 10
    };
  }).sort((a, b) => (
    b.rankScore - a.rankScore ||
    new Date(b.lastMistakeAt) - new Date(a.lastMistakeAt) ||
    a.question.localeCompare(b.question, 'vi')
  ));

  const selectedCandidates = allCandidates.slice(0, count);
  const sourceBreakdown = Array.from(sourceMap.values())
    .map((source) => ({
      id: source.id,
      title: source.title,
      subject: source.subject,
      grade: source.grade,
      mistakeCount: source.mistakeCount,
      uniqueQuestions: source.questionIds.size,
      studentCount: source.studentIds.size
    }))
    .sort((a, b) => b.mistakeCount - a.mistakeCount);

  const students = Array.from(studentMap.values()).sort((a, b) => (
    b.mistakeCount - a.mistakeCount || a.name.localeCompare(b.name, 'vi')
  ));
  const subjects = Array.from(new Set(
    sourceBreakdown.map((source) => source.subject).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'vi'));

  return {
    filters: { days, count, studentId, subject },
    summary: {
      totalMistakes,
      uniqueQuestions: allCandidates.length,
      studentsAffected: studentMap.size,
      attemptsAnalyzed: results.length,
      attemptsWithMistakes: attemptsWithMistakes.size,
      availableQuestions: allCandidates.length,
      selectedQuestions: selectedCandidates.length,
      unusableMistakes,
      latestActivity: latestActivity ? latestActivity.toISOString() : null,
      isTruncated: Boolean(sourceData.isTruncated)
    },
    candidates: selectedCandidates,
    sourceBreakdown,
    students,
    subjects,
    generatedAt: now.toISOString()
  };
}

function roundPoints(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function scaleQuestionsToTenPoints(candidates) {
  const questions = candidates.map((candidate) => JSON.parse(JSON.stringify(candidate.questionData)));
  const totalWeight = questions.reduce((sum, question) => {
    const weight = Number(question.points);
    return sum + (Number.isFinite(weight) && weight > 0 ? weight : 1);
  }, 0);

  let assignedPoints = 0;
  return questions.map((question, index) => {
    const weight = Number(question.points);
    const safeWeight = Number.isFinite(weight) && weight > 0 ? weight : 1;
    const points = index === questions.length - 1
      ? roundPoints(10 - assignedPoints)
      : roundPoints((safeWeight / totalWeight) * 10);
    assignedPoints = roundPoints(assignedPoints + points);

    return {
      ...question,
      id: `q_${index + 1}`,
      points
    };
  });
}

function cleanTitle(value) {
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

function formatVietnameseDate(date) {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh'
  }).format(date);
}

function buildAdaptiveLessonPayload(insights, options = {}) {
  if (!insights || !Array.isArray(insights.candidates) || insights.candidates.length === 0) {
    throw new Error('No reusable recent mistakes are available');
  }

  const now = options.now ? new Date(options.now) : new Date();
  const questions = scaleQuestionsToTenPoints(insights.candidates);
  const targetStudent = insights.filters.studentId
    ? insights.students.find((student) => student.id === insights.filters.studentId)
    : null;
  const targetLabel = targetStudent ? targetStudent.name : 'Nhóm học sinh gần đây';
  const defaultTitle = targetStudent
    ? `Ôn lỗi sai • ${targetStudent.name} • ${formatVietnameseDate(now)}`
    : `Đề ôn lỗi sai gần đây • ${formatVietnameseDate(now)}`;
  const title = cleanTitle(options.title) || defaultTitle;

  const grades = Array.from(new Set(
    insights.candidates.map((candidate) => candidate.lesson.grade).filter((grade) => grade !== null)
  ));
  const subjects = Array.from(new Set(
    insights.candidates.map((candidate) => candidate.lesson.subject).filter(Boolean)
  ));
  const questionTypeDistribution = { abcd: 0, truefalse: 0, number: 0 };
  const pointsDistribution = { abcd: 0, truefalse: 0, number: 0 };

  questions.forEach((question) => {
    questionTypeDistribution[question.type] += 1;
    pointsDistribution[question.type] = roundPoints(
      pointsDistribution[question.type] + Number(question.points || 0)
    );
  });

  return {
    title,
    color: '#6D5EF5',
    description: `Đề cá nhân hóa từ ${insights.summary.totalMistakes} lỗi sai trong ${insights.filters.days} ngày gần nhất của ${targetLabel}. Các câu được ưu tiên theo tần suất lặp lại và độ mới của lỗi sai.`,
    tags: ['loi-sai-gan-day', 'ca-nhan-hoa', 'on-tap'],
    grade: grades.length === 1 ? grades[0] : null,
    subject: subjects.length === 1 ? subjects[0] : 'physics',
    purpose: 'practice',
    mode: 'test',
    time_limit_enabled: true,
    time_limit_hours: 0,
    time_limit_minutes: Math.max(10, Math.ceil(questions.length * 1.5)),
    time_limit_seconds: 0,
    show_countdown: true,
    auto_submit: true,
    warning_alerts: true,
    shuffle_questions: true,
    shuffle_answers: true,
    enable_question_pool: false,
    question_pool_size: questions.length,
    question_type_distribution: questionTypeDistribution,
    points_distribution: pointsDistribution,
    randomization_seed: `adaptive-${now.getTime()}`,
    questions
  };
}

function toPublicInsights(insights) {
  return {
    ...insights,
    candidates: insights.candidates.map((candidate) => ({
      id: candidate.id,
      question: candidate.question,
      type: candidate.type,
      points: candidate.points,
      lesson: candidate.lesson,
      mistakeCount: candidate.mistakeCount,
      studentCount: candidate.studentCount,
      lastMistakeAt: candidate.lastMistakeAt,
      rankScore: candidate.rankScore
    }))
  };
}

module.exports = {
  DEFAULT_LOOKBACK_DAYS,
  DEFAULT_QUESTION_COUNT,
  MAX_QUESTION_COUNT,
  analyzeRecentMistakes,
  buildAdaptiveLessonPayload,
  buildReusableQuestion,
  normalizeQuestionText,
  toPublicInsights
};
