const {
  buildReusableQuestion,
  normalizeQuestionText
} = require('./adaptiveQuizService');

const DEFAULT_PERSONALIZED_QUESTION_COUNT = 10;
const MAX_PERSONALIZED_QUESTION_COUNT = 30;

function clampQuestionCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_PERSONALIZED_QUESTION_COUNT;
  return Math.min(MAX_PERSONALIZED_QUESTION_COUNT, Math.max(1, parsed));
}

function parseMistakeId(value) {
  const match = String(value || '').match(/^(.+)_(\d+)$/);
  if (!match) return null;

  const questionIndex = Number.parseInt(match[2], 10);
  if (!Number.isSafeInteger(questionIndex) || questionIndex < 0) return null;

  return {
    resultId: match[1],
    questionIndex
  };
}

function getLesson(result) {
  if (Array.isArray(result?.lessons)) return result.lessons[0] || null;
  return result?.lessons || null;
}

function findSourceQuestion(lesson, resultQuestion) {
  if (!lesson || !Array.isArray(lesson.questions)) return null;
  const target = normalizeQuestionText(resultQuestion?.question || resultQuestion?.text);
  if (!target) return null;

  return lesson.questions.find((question) => (
    normalizeQuestionText(question?.question || question?.text) === target
  )) || null;
}

function getChoiceAnswer(question) {
  const correctIndex = String(question.correct || '').toUpperCase().charCodeAt(0) - 65;
  if (!Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= question.options.length) {
    return null;
  }
  return question.options[correctIndex].text;
}

function toPracticeQuestion(mistakeId, result) {
  const parsedId = parseMistakeId(mistakeId);
  if (!parsedId || String(result?.id) !== parsedId.resultId) return null;

  const resultQuestion = Array.isArray(result.questions)
    ? result.questions[parsedId.questionIndex]
    : null;
  if (!resultQuestion || resultQuestion.isCorrect !== false) return null;

  const lesson = getLesson(result);
  const sourceQuestion = findSourceQuestion(lesson, resultQuestion);
  const reusableQuestion = buildReusableQuestion(sourceQuestion, resultQuestion);
  if (!reusableQuestion) return null;

  let correctAnswer = reusableQuestion.correct;
  let type = reusableQuestion.type;
  if (type === 'abcd') {
    correctAnswer = getChoiceAnswer(reusableQuestion);
    type = 'multiple_choice';
  } else if (type === 'truefalse') {
    type = 'true_false';
  }

  if (correctAnswer === null || correctAnswer === undefined) return null;

  const practiceQuestion = {
    id: String(mistakeId),
    lessonId: result.lesson_id,
    lessonTitle: lesson?.title || 'Bài học',
    subject: lesson?.subject || 'physics',
    question: reusableQuestion.question,
    options: reusableQuestion.options.map((option) => option.text),
    correctAnswer,
    type,
    explanation: reusableQuestion.explanation || '',
    source: 'mistake'
  };

  const imageUrl = reusableQuestion.imageUrl || reusableQuestion.image || reusableQuestion.questionImage;
  if (imageUrl) practiceQuestion.imageUrl = imageUrl;
  if (reusableQuestion.unit) practiceQuestion.unit = reusableQuestion.unit;
  if (reusableQuestion.tolerance !== undefined) {
    practiceQuestion.tolerance = reusableQuestion.tolerance;
  }

  return practiceQuestion;
}

function buildPersonalizedPracticeQuestions(mistakeIds, results, count) {
  const safeCount = clampQuestionCount(count);
  const resultById = new Map(
    (Array.isArray(results) ? results : []).map((result) => [String(result.id), result])
  );
  const seenMistakes = new Set();
  const questions = [];

  for (const rawMistakeId of Array.isArray(mistakeIds) ? mistakeIds : []) {
    const mistakeId = String(rawMistakeId || '');
    if (!mistakeId || seenMistakes.has(mistakeId)) continue;
    seenMistakes.add(mistakeId);

    const parsedId = parseMistakeId(mistakeId);
    if (!parsedId) continue;

    const practiceQuestion = toPracticeQuestion(mistakeId, resultById.get(parsedId.resultId));
    if (practiceQuestion) questions.push(practiceQuestion);
    if (questions.length >= safeCount) break;
  }

  return questions;
}

module.exports = {
  DEFAULT_PERSONALIZED_QUESTION_COUNT,
  MAX_PERSONALIZED_QUESTION_COUNT,
  buildPersonalizedPracticeQuestions,
  clampQuestionCount,
  parseMistakeId,
  toPracticeQuestion
};
