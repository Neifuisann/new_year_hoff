const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPersonalizedPracticeQuestions,
  clampQuestionCount,
  parseMistakeId,
  toPracticeQuestion
} = require('../lib/services/personalizedQuizService');

const lesson = {
  id: 'lesson-1',
  title: 'Nhiệt học',
  subject: 'physics',
  questions: [
    {
      type: 'abcd',
      question: 'Đơn vị của nhiệt dung riêng là',
      options: [
        { text: 'J' },
        { text: 'J/kg' },
        { text: 'J/(kg.K)' },
        { text: 'kg.K/J' }
      ],
      correct: 'C'
    },
    {
      type: 'truefalse',
      question: 'Xét các phát biểu về nhiệt lượng.',
      options: [
        { text: 'Nhiệt truyền từ vật nóng sang vật lạnh.' },
        { text: 'Nhiệt độ luôn giữ nguyên.' }
      ],
      correct: [true, false]
    }
  ]
};

const result = {
  id: 'result_with_suffix',
  lesson_id: lesson.id,
  lessons: lesson,
  questions: [
    {
      type: 'abcd',
      question: 'Đơn vị của nhiệt dung riêng là',
      optionsText: ['J', 'J/kg', 'J/(kg.K)', 'kg.K/J'],
      correctAnswer: 'J/(kg.K)',
      userAnswer: 'J/kg',
      isCorrect: false
    },
    {
      type: 'truefalse',
      question: 'Xét các phát biểu về nhiệt lượng.',
      optionsText: [
        'Nhiệt truyền từ vật nóng sang vật lạnh.',
        'Nhiệt độ luôn giữ nguyên.'
      ],
      correctAnswer: [true, false],
      userAnswer: [false, false],
      isCorrect: false
    },
    {
      type: 'number',
      question: 'Nhiệt độ bằng bao nhiêu?',
      correctAnswer: '300',
      userAnswer: '300',
      isCorrect: true
    }
  ]
};

test('parses mistake IDs from the final underscore and clamps question counts', () => {
  assert.deepEqual(parseMistakeId('result_with_suffix_12'), {
    resultId: 'result_with_suffix',
    questionIndex: 12
  });
  assert.equal(parseMistakeId('missing-index'), null);
  assert.equal(clampQuestionCount(0), 1);
  assert.equal(clampQuestionCount(999), 30);
  assert.equal(clampQuestionCount('invalid'), 10);
});

test('reconstructs a multiple-choice mistake with selectable option text', () => {
  const question = toPracticeQuestion('result_with_suffix_0', result);

  assert.equal(question.type, 'multiple_choice');
  assert.deepEqual(question.options, ['J', 'J/kg', 'J/(kg.K)', 'kg.K/J']);
  assert.equal(question.correctAnswer, 'J/(kg.K)');
  assert.equal(question.lessonTitle, 'Nhiệt học');
  assert.equal(Object.hasOwn(question, 'userAnswer'), false);
});

test('keeps all statements and boolean answers for a true-false mistake', () => {
  const question = toPracticeQuestion('result_with_suffix_1', result);

  assert.equal(question.type, 'true_false');
  assert.equal(question.options.length, 2);
  assert.deepEqual(question.correctAnswer, [true, false]);
});

test('preserves requested order, removes duplicates, and rejects invalid ownership/data', () => {
  const questions = buildPersonalizedPracticeQuestions([
    'result_with_suffix_1',
    'result_with_suffix_0',
    'result_with_suffix_1',
    'other-result_0',
    'result_with_suffix_2'
  ], [result], 10);

  assert.deepEqual(questions.map((question) => question.id), [
    'result_with_suffix_1',
    'result_with_suffix_0'
  ]);
  assert.equal(toPracticeQuestion('another_student_result_0', result), null);
  assert.equal(toPracticeQuestion('result_with_suffix_2', result), null);
});
