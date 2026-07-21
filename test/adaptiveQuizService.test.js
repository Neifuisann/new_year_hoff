const test = require('node:test');
const assert = require('node:assert/strict');

const {
  analyzeRecentMistakes,
  buildAdaptiveLessonPayload,
  buildReusableQuestion,
  toPublicInsights
} = require('../lib/services/adaptiveQuizService');

const lesson = {
  id: 'lesson-1',
  title: 'Nhiệt học',
  subject: 'physics',
  grade: 12,
  questions: [
    {
      id: 'source-1',
      type: 'abcd',
      question: 'Nội năng của khí thay đổi thế nào?',
      options: [
        { text: 'Không đổi' },
        { text: 'Tăng' },
        { text: 'Giảm' },
        { text: 'Bằng không' }
      ],
      correct: 'B',
      points: 0.25
    },
    {
      id: 'source-2',
      type: 'number',
      question: 'Nhiệt độ tuyệt đối bằng bao nhiêu?',
      options: [],
      correct: '300',
      points: 0.5
    }
  ]
};

function wrongQuestion(question, extra = {}) {
  return {
    question,
    type: extra.type || 'abcd',
    isCorrect: false,
    userAnswer: 'A',
    correctAnswer: extra.correctAnswer || 'Tăng',
    optionsText: extra.optionsText || ['Không đổi', 'Tăng', 'Giảm', 'Bằng không'],
    points: extra.points || 0.25
  };
}

test('deduplicates repeated mistakes and ranks the repeated recent question first', () => {
  const sourceData = {
    lessons: [lesson],
    results: [
      {
        id: 'result-1',
        student_id: 'student-1',
        lesson_id: lesson.id,
        timestamp: '2026-07-20T10:00:00.000Z',
        students: { full_name: 'Học sinh A' },
        lessons: { title: lesson.title, subject: lesson.subject, grade: lesson.grade },
        questions: [wrongQuestion('Nội năng của khí thay đổi thế nào?')]
      },
      {
        id: 'result-2',
        student_id: 'student-2',
        lesson_id: lesson.id,
        timestamp: '2026-07-20T11:00:00.000Z',
        students: { full_name: 'Học sinh B' },
        lessons: { title: lesson.title, subject: lesson.subject, grade: lesson.grade },
        questions: [
          wrongQuestion('Nội năng của khí thay đổi thế nào?'),
          wrongQuestion('Nhiệt độ tuyệt đối bằng bao nhiêu?', {
            type: 'number',
            correctAnswer: '300',
            optionsText: [],
            points: 0.5
          })
        ]
      }
    ]
  };

  const insights = analyzeRecentMistakes(sourceData, {
    days: 14,
    count: 2,
    now: '2026-07-21T00:00:00.000Z'
  });

  assert.equal(insights.summary.totalMistakes, 3);
  assert.equal(insights.summary.uniqueQuestions, 2);
  assert.equal(insights.summary.studentsAffected, 2);
  assert.equal(insights.candidates[0].mistakeCount, 2);
  assert.equal(insights.candidates[0].studentCount, 2);
  assert.equal(insights.candidates[0].questionData.correct, 'B');
  assert.equal(insights.sourceBreakdown[0].uniqueQuestions, 2);
});

test('reconstructs a reusable ABCD question from stored result text when source is unavailable', () => {
  const reusable = buildReusableQuestion(null, wrongQuestion('Câu hỏi khôi phục?', {
    correctAnswer: 'Đáp án thứ hai',
    optionsText: ['Đáp án thứ nhất', 'Đáp án thứ hai', 'Đáp án thứ ba']
  }));

  assert.equal(reusable.type, 'abcd');
  assert.equal(reusable.correct, 'B');
  assert.deepEqual(reusable.options.map((option) => option.text), [
    'Đáp án thứ nhất', 'Đáp án thứ hai', 'Đáp án thứ ba'
  ]);
  assert.equal(Object.hasOwn(reusable, 'userAnswer'), false);
});

test('builds a valid ten-point lesson and keeps private question data out of preview JSON', () => {
  const sourceData = {
    lessons: [lesson],
    results: [{
      id: 'result-3',
      student_id: 'student-1',
      lesson_id: lesson.id,
      timestamp: '2026-07-20T10:00:00.000Z',
      students: { full_name: 'Học sinh A' },
      lessons: { title: lesson.title, subject: lesson.subject, grade: lesson.grade },
      questions: [
        wrongQuestion('Nội năng của khí thay đổi thế nào?'),
        wrongQuestion('Nhiệt độ tuyệt đối bằng bao nhiêu?', {
          type: 'number',
          correctAnswer: '300',
          optionsText: [],
          points: 0.5
        })
      ]
    }]
  };
  const insights = analyzeRecentMistakes(sourceData, {
    days: 14,
    count: 2,
    studentId: 'student-1',
    now: '2026-07-21T00:00:00.000Z'
  });
  const payload = buildAdaptiveLessonPayload(insights, {
    title: '  Đề ôn tập thử nghiệm  ',
    now: '2026-07-21T00:00:00.000Z'
  });
  const publicInsights = toPublicInsights(insights);

  assert.equal(payload.title, 'Đề ôn tập thử nghiệm');
  assert.equal(payload.questions.length, 2);
  assert.equal(payload.questions.reduce((sum, question) => sum + question.points, 0), 10);
  assert.equal(payload.question_type_distribution.abcd, 1);
  assert.equal(payload.question_type_distribution.number, 1);
  assert.equal(payload.enable_question_pool, false);
  assert.equal(Object.hasOwn(payload.questions[0], 'userAnswer'), false);
  assert.equal(Object.hasOwn(publicInsights.candidates[0], 'questionData'), false);
});

test('admin create handler persists the generated lesson payload without trusting client questions', async (t) => {
  require('dotenv').config({ quiet: true });
  const databaseService = require('../lib/services/databaseService');
  const cacheService = require('../lib/services/cacheService');
  const originalCreateLesson = databaseService.createLesson;
  const originalCacheGet = cacheService.get;
  let savedPayload = null;

  const sourceData = {
    lessons: [lesson],
    results: [{
      id: 'result-controller',
      student_id: 'student-1',
      lesson_id: lesson.id,
      timestamp: new Date().toISOString(),
      students: { full_name: 'Học sinh A' },
      lessons: { title: lesson.title, subject: lesson.subject, grade: lesson.grade },
      questions: [wrongQuestion('Nội năng của khí thay đổi thế nào?')]
    }]
  };

  cacheService.get = async () => sourceData;
  databaseService.createLesson = async (payload) => {
    savedPayload = payload;
    return { id: 'adaptive-lesson-1', title: payload.title };
  };
  t.after(() => {
    cacheService.get = originalCacheGet;
    databaseService.createLesson = originalCreateLesson;
  });

  const adminController = require('../lib/controllers/adminController');
  const response = await new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        resolve({ statusCode: this.statusCode, body });
      }
    };
    adminController.createAdaptiveQuiz({
      body: {
        days: 14,
        count: 12,
        studentId: 'student-1',
        subject: 'all',
        title: 'Đề do giáo viên đặt',
        questions: [{ question: 'Nội dung giả từ trình duyệt' }]
      }
    }, res, reject);
  });

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.lesson.id, 'adaptive-lesson-1');
  assert.equal(savedPayload.title, 'Đề do giáo viên đặt');
  assert.equal(savedPayload.questions.length, 1);
  assert.equal(savedPayload.questions[0].question, 'Nội năng của khí thay đổi thế nào?');
  assert.equal(savedPayload.questions[0].points, 10);
});
