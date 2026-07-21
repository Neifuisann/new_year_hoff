const { supabase, supabaseAdmin } = require('../config/database');
const {
  buildPersonalizedPracticeQuestions,
  clampQuestionCount,
  parseMistakeId
} = require('./personalizedQuizService');

class DatabaseService {
  // Lesson operations
  async getLessons(options = {}) {
    const { page = 1, limit = 10, search = '', sort = 'newest', tags = [] } = options;
    const startIndex = (page - 1) * limit;

    // Determine sorting parameters
    let orderAscending = true;
    let orderColumn = 'order';
    switch (sort) {
      case 'newest': orderColumn = 'created'; orderAscending = false; break;
      case 'oldest': orderColumn = 'created'; orderAscending = true; break;
      case 'az': orderColumn = 'title'; orderAscending = true; break;
      case 'za': orderColumn = 'title'; orderAscending = false; break;
      case 'newest-changed': orderColumn = 'last_updated'; orderAscending = false; break;
      case 'popular': orderColumn = 'views'; orderAscending = false; break;
      case 'order': orderColumn = 'order'; orderAscending = true; break;
    }

    let lessons = [];
    let total = 0;

    // Parse tags parameter - can be string (comma-separated) or array
    let tagFilters = [];
    if (tags) {
      if (typeof tags === 'string') {
        tagFilters = tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
      } else if (Array.isArray(tags)) {
        tagFilters = tags.filter(tag => tag && typeof tag === 'string');
      }
    }

    // Tag filters applied for lesson query

    if (search) {
      // Use RPC for search
      let rpcQuery = supabase
        .rpc('search_lessons', { search_term: search })
        .order(orderColumn, { ascending: orderAscending })
        .range(startIndex, startIndex + limit - 1);

      const { data: rpcData, error: rpcError } = await rpcQuery;
      if (rpcError) throw rpcError;

      lessons = rpcData || [];

      // Apply tag filtering to search results if specified
      if (tagFilters.length > 0) {
        lessons = lessons.filter(lesson => {
          if (!lesson.tags || !Array.isArray(lesson.tags)) return false;
          // Check if lesson contains ALL specified tags (AND logic)
          return tagFilters.every(tagFilter =>
            lesson.tags.some(lessonTag =>
              lessonTag && lessonTag.toLowerCase().includes(tagFilter.toLowerCase())
            )
          );
        });
      }

      // Get total count for search results
      const { count, error: countError } = await supabase
        .rpc('search_lessons', { search_term: search }, { count: 'exact', head: true });

      if (countError) {
        console.warn('Could not get total count for search results:', countError);
        total = lessons.length + startIndex;
      } else {
        total = count || 0;
      }
    } else {
      // Regular query without search
      let query = supabase
        .from('lessons')
        .select('id, title, color, created, last_updated, views, order, subject, grade, tags, description, purpose, pricing, lesson_image, enable_question_pool, question_pool_size, question_type_distribution', { count: 'exact' })
        .order(orderColumn, { ascending: orderAscending });

      // Apply tag filtering at database level for better performance
      if (tagFilters.length > 0) {
        // Applying tag filters to lesson query
        // Use PostgreSQL array operators to filter by tags
        // @> operator checks if the left array contains all elements of the right array
        tagFilters.forEach(tag => {
          // Adding tag filter to query
          query = query.contains('tags', `["${tag}"]`);
        });
      }

      query = query.range(startIndex, startIndex + limit - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      lessons = data || [];
      // Query completed with tag filters applied
      total = count || 0;
    }

    // Map database field names to frontend expected names
    const mappedLessons = lessons.map(lesson => ({
      ...lesson,
      lessonImage: lesson.lesson_image, // Map lesson_image to lessonImage for frontend compatibility
      enableQuestionPool: lesson.enable_question_pool,
      questionPoolSize: lesson.question_pool_size,
      questionTypeDistribution: lesson.question_type_distribution
    }));

    return { lessons: mappedLessons, total, page, limit, search, sort, tags: tagFilters };
  }

  async getLessonById(id, isAdmin = false) {
    const { data: lesson, error } = await supabase
      .from('lessons')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Lesson not found');
      }
      throw error;
    }

    // Apply question pool filtering if enabled (but skip for admin users)
    let filteredQuestions = lesson.questions;
    if (!isAdmin && lesson.enable_question_pool && lesson.question_pool_size > 0 && Array.isArray(lesson.questions)) {
      const poolSize = lesson.question_pool_size;
      const totalQuestions = lesson.questions.length;

      if (poolSize < totalQuestions) {
        // Apply question pool filtering
        if (lesson.question_type_distribution) {
          // Use question type distribution if available
          filteredQuestions = this._applyQuestionTypeDistribution(lesson.questions, lesson.question_type_distribution);
        } else {
          // Fallback: use proportional distribution based on question types
          filteredQuestions = this._applyProportionalDistribution(lesson.questions, poolSize);
        }
      }
    }

    // Map database field names to frontend expected names
    const mappedLesson = {
      ...lesson,
      questions: filteredQuestions, // Use filtered questions
      lessonImage: lesson.lesson_image, // Map lesson_image to lessonImage for frontend compatibility
      // Map new fields from snake_case to camelCase
      timeLimitEnabled: lesson.time_limit_enabled,
      timeLimitHours: lesson.time_limit_hours,
      timeLimitMinutes: lesson.time_limit_minutes,
      timeLimitSeconds: lesson.time_limit_seconds,
      showCountdown: lesson.show_countdown,
      autoSubmit: lesson.auto_submit,
      warningAlerts: lesson.warning_alerts,
      shuffleQuestions: lesson.shuffle_questions,
      shuffleAnswers: lesson.shuffle_answers,
      enableQuestionPool: lesson.enable_question_pool,
      questionPoolSize: lesson.question_pool_size,
      questionTypeDistribution: lesson.question_type_distribution,
      pointsDistribution: lesson.points_distribution,
      randomizationSeed: lesson.randomization_seed
    };

    return mappedLesson;
  }

  // Helper method to apply question type distribution
  _applyQuestionTypeDistribution(questions, distribution) {
    const sections = {
      'abcd': { questions: [], count: 0 },
      'truefalse': { questions: [], count: 0 },
      'number': { questions: [], count: 0 },
      'essay': { questions: [], count: 0 }
    };

    // Categorize questions by type
    questions.forEach(question => {
      const type = question.type || 'abcd';
      if (sections[type]) {
        sections[type].questions.push(question);
      } else {
        sections['abcd'].questions.push(question);
      }
    });

    // Apply distribution counts
    Object.keys(distribution).forEach(type => {
      if (sections[type] && distribution[type] > 0) {
        sections[type].count = distribution[type];
      }
    });

    // Select questions based on distribution
    let selectedQuestions = [];
    Object.keys(sections).forEach(type => {
      const section = sections[type];
      if (section.count > 0 && section.questions.length > 0) {
        const shuffled = this._shuffleArray([...section.questions]);
        const selected = shuffled.slice(0, Math.min(section.count, section.questions.length));
        selectedQuestions = selectedQuestions.concat(selected);
      }
    });

    return selectedQuestions;
  }

  // Helper method to apply proportional distribution
  _applyProportionalDistribution(questions, poolSize) {
    const sections = {
      'abcd': { questions: [] },
      'truefalse': { questions: [] },
      'number': { questions: [] },
      'essay': { questions: [] }
    };

    // Categorize questions by type
    questions.forEach(question => {
      const type = question.type || 'abcd';
      if (sections[type]) {
        sections[type].questions.push(question);
      } else {
        sections['abcd'].questions.push(question);
      }
    });

    // Calculate proportional distribution
    const totalQuestions = questions.length;
    let selectedQuestions = [];

    Object.keys(sections).forEach(type => {
      const typeQuestions = sections[type].questions.length;
      if (typeQuestions > 0) {
        const proportion = typeQuestions / totalQuestions;
        const selectCount = Math.round(poolSize * proportion);

        if (selectCount > 0) {
          const shuffled = this._shuffleArray([...sections[type].questions]);
          const selected = shuffled.slice(0, Math.min(selectCount, typeQuestions));
          selectedQuestions = selectedQuestions.concat(selected);
        }
      }
    });

    // If we don't have enough questions due to rounding, add more randomly
    if (selectedQuestions.length < poolSize) {
      const remaining = questions.filter(q => !selectedQuestions.find(sq => sq.id === q.id));
      const shuffled = this._shuffleArray(remaining);
      const needed = poolSize - selectedQuestions.length;
      selectedQuestions = selectedQuestions.concat(shuffled.slice(0, needed));
    }

    return selectedQuestions;
  }

  // Helper method to shuffle array (Fisher-Yates algorithm)
  _shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  async createLesson(lessonData) {
    // Get next order number
    const { data: maxOrderLesson, error: maxOrderError } = await supabase
      .from('lessons')
      .select('order')
      .order('order', { ascending: false })
      .limit(1)
      .single();

    let nextOrder = 0;
    if (maxOrderError && maxOrderError.code !== 'PGRST116') {
      throw maxOrderError;
    }
    if (maxOrderLesson && typeof maxOrderLesson.order === 'number') {
      nextOrder = maxOrderLesson.order + 1;
    }

    const now = new Date().toISOString();

    // Convert camelCase fields to snake_case for database compatibility
    const newLessonData = {
      ...lessonData,
      id: lessonData.id || Date.now().toString(),
      views: 0,
      last_updated: now, // Use snake_case field name
      created: now,
      order: nextOrder
    };

    // Convert camelCase field names to snake_case for database
    if (lessonData.lessonImage !== undefined) {
      newLessonData.lesson_image = lessonData.lessonImage;
      delete newLessonData.lessonImage;
    }

    const { data, error } = await supabase
      .from('lessons')
      .insert(newLessonData)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async updateLesson(id, updateData) {
    const updatedData = {
      ...updateData,
      last_updated: new Date().toISOString()
    };

    // Convert camelCase field names to snake_case for database
    if (updateData.lessonImage !== undefined) {
      updatedData.lesson_image = updateData.lessonImage;
      delete updatedData.lessonImage;
    }

    // Remove fields that shouldn't be updated
    delete updatedData.id;
    delete updatedData.created;

    const { data, error } = await supabase
      .from('lessons')
      .update(updatedData)
      .eq('id', id)
      .select();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Lesson not found');
      }
      throw error;
    }

    return data;
  }

  async deleteLesson(id) {
    const { error } = await supabase
      .from('lessons')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async updateLessonOrder(orderedLessons) {
    const updates = orderedLessons.map((lesson, index) =>
      supabase
        .from('lessons')
        .update({ order: index })
        .eq('id', lesson.id)
    );

    const results = await Promise.all(updates);
    const errors = results.filter(result => result.error);

    if (errors.length > 0) {
      console.error('Errors updating lesson order:', errors);
      throw new Error('One or more lessons failed to update order.');
    }

    return true;
  }

  async incrementLessonViews(lessonId, currentViews) {
    const { error } = await supabase
      .from('lessons')
      .update({ views: currentViews + 1 })
      .eq('id', lessonId);

    if (error) throw error;
    return true;
  }

  async getLessonsWithoutDescriptions(limit = 10) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, title, questions, grade, subject, tags, description')
      .or('description.is.null,description.eq.')
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  async getLessonsWithoutImages(limit = 10) {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, title, lesson_image, auto_generated_image')
      .or('lesson_image.is.null,lesson_image.eq.')
      .limit(limit);

    if (error) throw error;
    return data || [];
  }

  // Database connection validation
  async validateConnection() {
    try {
      const { data, error } = await supabase
        .from('lessons')
        .select('id')
        .limit(1);

      if (error) {
        console.error('Database connection validation failed:', error);
        throw new Error('Database connection unavailable');
      }

      return true;
    } catch (error) {
      console.error('Database connection validation error:', error);
      throw new Error('Database connection unavailable');
    }
  }

  // Student operations
  async getStudentByPhone(phoneNumber) {
    const { data: student, error } = await supabase
      .from('students')
      .select('id, full_name, password_hash, is_approved, approved_device_id, approved_device_fingerprint, current_session_id')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (error) throw error;
    return student;
  }

  async createStudent(studentData) {
    const { data: newStudent, error } = await supabase
      .from('students')
      .insert({
        ...studentData,
        is_approved: false,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return newStudent;
  }

  async updateStudent(id, updateData) {
    const { error } = await supabase
      .from('students')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async getStudents(options = {}) {
    const { limit = 100, approved = null } = options;

    let query = supabase
      .from('students')
      .select('*')
      .order('created_at', { ascending: false });

    if (approved !== null) {
      query = query.eq('is_approved', approved);
    }

    if (limit) {
      query = query.limit(limit);
    }

    const { data: students, error } = await query;
    if (error) throw error;

    // Map database columns to expected frontend properties
    const mappedStudents = (students || []).map(student => ({
      ...student,
      // Map approved_device_id to device_identifier for frontend compatibility
      device_identifier: student.approved_device_id,
      // Add device_status based on whether device is linked
      device_status: student.approved_device_id ? 'Liên kết' : 'Chưa liên kết',
      // Add session_status based on whether there's an active session
      session_status: student.current_session_id ? 'Hoạt động' : 'Không có phiên'
    }));

    return mappedStudents;
  }

  // Load recent result records and their source lessons for adaptive quiz generation.
  // Question ranking is handled separately so this method remains a thin data-access layer.
  async getAdaptiveQuizSourceData(options = {}) {
    const days = Math.min(90, Math.max(1, Number.parseInt(options.days, 10) || 14));
    const maxResults = Math.min(1000, Math.max(1, Number.parseInt(options.maxResults, 10) || 500));
    const cutoff = new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();

    let query = supabase
      .from('results')
      .select(`
        id,
        student_id,
        lesson_id,
        timestamp,
        questions,
        students ( full_name ),
        lessons ( title, subject, grade )
      `)
      .gte('timestamp', cutoff)
      .order('timestamp', { ascending: false })
      .limit(maxResults);

    if (options.studentId && options.studentId !== 'all') {
      query = query.eq('student_id', options.studentId);
    }

    const { data: results, error: resultsError } = await query;
    if (resultsError) throw resultsError;

    const lessonIds = Array.from(new Set(
      (results || []).map((result) => result.lesson_id).filter(Boolean)
    ));
    let lessons = [];

    if (lessonIds.length > 0) {
      const { data: lessonRows, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, subject, grade, questions')
        .in('id', lessonIds);

      if (lessonsError) throw lessonsError;
      lessons = lessonRows || [];
    }

    return {
      results: results || [],
      lessons,
      isTruncated: (results || []).length === maxResults
    };
  }

  // Results operations
  async createResult(resultData) {
    // Debug: Log the exact data being sent to Supabase
    // Creating result with provided data

    const { data: savedResult, error } = await supabase
      .from('results')
      .insert(resultData)
      .select('id')
      .single();

    if (error) {
      // Database error during result creation
      throw error;
    }
    return savedResult;
  }

  async getResultById(id) {
    // Retrieving result by ID

    const { data: result, error } = await supabase
      .from('results')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('🚨 Database error in getResultById:', error);
      if (error.code === 'PGRST116') {
        throw new Error('Result not found');
      }
      throw error;
    }

    // Validate result structure
    if (!result?.questions || !Array.isArray(result.questions) || result.questions.length === 0) {
      console.warn('⚠️  No questions found in result or questions is not an array');
    }

    return result;
  }

  async deleteResult(id) {
    const { error } = await supabase
      .from('results')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async getLessonResults(lessonId) {
    const { data: results, error } = await supabase
      .from('results')
      .select(`
        *,
        students ( full_name )
      `)
      .eq('lesson_id', lessonId);

    if (error) throw error;
    return results || [];
  }

  // Bulk method to get results for multiple lessons at once
  async getBulkLessonResults(lessonIds) {
    if (!lessonIds || lessonIds.length === 0) return {};

    const { data: results, error } = await supabase
      .from('results')
      .select(`
        *,
        students ( full_name )
      `)
      .in('lesson_id', lessonIds);

    if (error) throw error;

    // Group results by lesson ID
    const groupedResults = {};
    lessonIds.forEach(lessonId => {
      groupedResults[lessonId] = [];
    });

    (results || []).forEach(result => {
      if (groupedResults[result.lesson_id]) {
        groupedResults[result.lesson_id].push(result);
      }
    });

    return groupedResults;
  }

  // Rating operations
  async getRatings(limit = 100, offset = 0) {
    const { data: ratings, error } = await supabase
      .from('ratings')
      .select(`
        *,
        students ( full_name )
      `)
      .order('rating', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return ratings || [];
  }

  // Get ratings with changes for specific time period
  async getRatingsWithChanges(limit = 100, offset = 0, filter = 'all') {
    // First get current ratings
    const { data: currentRatings, error: ratingsError } = await supabase
      .from('ratings')
      .select(`
        *,
        students ( full_name )
      `)
      .order('rating', { ascending: false })
      .range(offset, offset + limit - 1);

    if (ratingsError) throw ratingsError;
    if (!currentRatings || currentRatings.length === 0) return [];

    // Add rank information (offset + index + 1)
    const ratingsWithRank = currentRatings.map((rating, index) => ({
      ...rating,
      rank: offset + index + 1
    }));

    // If filter is 'all', no change calculation needed
    if (filter === 'all') {
      return ratingsWithRank.map(rating => ({
        ...rating,
        ratingChange: null // No change for 'all' view
      }));
    }

    // Calculate date range based on filter
    const now = new Date();
    let startDate;

    if (filter === 'week') {
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else if (filter === 'month') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1); // First day of current month
    } else {
      // Default to all if unknown filter
      return ratingsWithRank.map(rating => ({
        ...rating,
        ratingChange: null
      }));
    }

    // Get rating changes for all students in a single query (fixes N+1 query issue)
    const studentIds = ratingsWithRank.map(rating => rating.student_id);
    const { data: allHistoryData, error: historyError } = await supabase
      .from('rating_history')
      .select('student_id, rating_change')
      .in('student_id', studentIds)
      .gte('timestamp', startDate.toISOString())
      .order('timestamp', { ascending: true });

    if (historyError) {
      console.error('Error fetching bulk rating history:', historyError);
      return ratingsWithRank.map(rating => ({ ...rating, ratingChange: 0 }));
    }

    // Group rating changes by student ID
    const ratingChangesMap = {};
    (allHistoryData || []).forEach(record => {
      if (!ratingChangesMap[record.student_id]) {
        ratingChangesMap[record.student_id] = 0;
      }
      ratingChangesMap[record.student_id] += record.rating_change || 0;
    });

    // Map rating changes to current ratings
    const ratingsWithChanges = ratingsWithRank.map(rating => ({
      ...rating,
      ratingChange: ratingChangesMap[rating.student_id] || 0
    }));

    return ratingsWithChanges;
  }

  async getStudentRating(studentId) {
    const { data: rating, error } = await supabase
      .from('ratings')
      .select(`
        *,
        students ( full_name )
      `)
      .eq('student_id', studentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return rating;
  }

  // Search for ratings by student name across all records
  async searchRatings(searchQuery, filter = 'all', limit = 100) {
    try {
      // First, get all ratings ordered by rating (to calculate rank)
      const { data: allRatings, error: allRatingsError } = await supabase
        .from('ratings')
        .select(`
          *,
          students ( full_name )
        `)
        .order('rating', { ascending: false });

      if (allRatingsError) throw allRatingsError;
      if (!allRatings || allRatings.length === 0) return [];

      // Add rank information to each rating
      const ratingsWithRank = allRatings.map((rating, index) => ({
        ...rating,
        rank: index + 1
      }));

      // Filter by search query (case-insensitive name matching)
      const searchQueryLower = searchQuery.toLowerCase().trim();
      const filteredResults = ratingsWithRank.filter(rating =>
        rating.students?.full_name?.toLowerCase().includes(searchQueryLower)
      );

      // If filter is 'all', no change calculation needed
      if (filter === 'all') {
        return filteredResults.slice(0, limit).map(rating => ({
          ...rating,
          ratingChange: null
        }));
      }

      // Calculate date range based on filter
      const now = new Date();
      let startDate;

      if (filter === 'week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (filter === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else {
        return filteredResults.slice(0, limit).map(rating => ({
          ...rating,
          ratingChange: null
        }));
      }

      // Get rating changes for the filtered students
      const studentIds = filteredResults.map(rating => rating.student_id);
      const { data: allHistoryData, error: historyError } = await supabase
        .from('rating_history')
        .select('student_id, rating_change')
        .in('student_id', studentIds)
        .gte('timestamp', startDate.toISOString())
        .order('timestamp', { ascending: true });

      if (historyError) {
        console.error('Error fetching bulk rating history for search:', historyError);
        return filteredResults.slice(0, limit).map(rating => ({ ...rating, ratingChange: 0 }));
      }

      // Group rating changes by student ID
      const ratingChangesMap = {};
      (allHistoryData || []).forEach(record => {
        if (!ratingChangesMap[record.student_id]) {
          ratingChangesMap[record.student_id] = 0;
        }
        ratingChangesMap[record.student_id] += record.rating_change || 0;
      });

      // Map rating changes to filtered results
      return filteredResults.slice(0, limit).map(rating => ({
        ...rating,
        ratingChange: ratingChangesMap[rating.student_id] || 0
      }));
    } catch (error) {
      console.error('Error searching ratings:', error);
      throw error;
    }
  }


  async upsertRating(ratingData) {
    // Validate required fields
    if (!ratingData.student_id) {
      throw new Error('student_id is required for rating upsert');
    }
    if (typeof ratingData.rating !== 'number') {
      throw new Error('rating must be a number');
    }

    const { data, error } = await supabase
      .from('ratings')
      .upsert(ratingData, { onConflict: 'student_id' })
      .select();

    if (error) {
      console.error('❌ Supabase upsertRating error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        ratingData
      });
      throw error;
    }

    return data;
  }

  async createRatingHistory(historyData) {
    // Validate required fields
    if (!historyData.student_id) {
      throw new Error('student_id is required for rating history');
    }
    if (!historyData.lesson_id) {
      throw new Error('lesson_id is required for rating history');
    }

    const { data, error } = await supabase
      .from('rating_history')
      .insert(historyData)
      .select();

    if (error) {
      console.error('❌ Supabase createRatingHistory error:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        historyData
      });
      throw error;
    }

    return data;
  }

  async getStudentRatingHistory(studentId, limit = 50) {
    const { data: history, error } = await supabase
      .from('rating_history')
      .select('*')
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return history || [];
  }

  async getStudentProfile(studentId) {
    // Get student info
    const { data: student, error: studentError } = await supabase
      .from('students')
      .select('id, full_name, created_at')
      .eq('id', studentId)
      .maybeSingle();

    if (studentError) throw studentError;
    if (!student) throw new Error('Student not found');

    // Get current rating
    const { data: rating, error: ratingError } = await supabase
      .from('ratings')
      .select('rating')
      .eq('student_id', studentId)
      .maybeSingle();

    if (ratingError) {
      console.warn(`Could not fetch rating for student ${studentId}:`, ratingError.message);
    }

    // Get the latest rating history regardless of age. A time-based cutoff made
    // inactive students appear to have no history even though their records still
    // existed in the database.
    const { data: ratingHistory, error: historyError } = await supabase
      .from('rating_history')
      .select(`
        *,
        lessons ( title )
      `)
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (historyError) {
      console.error(`Error fetching rating history for student ${studentId}:`, historyError);
      throw historyError;
    }

    // Get the latest quiz results to match with the displayed rating history.
    const { data: quizResults, error: resultsError } = await supabase
      .from('results')
      .select('lesson_id, score, total_points, timestamp')
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (resultsError) {
      console.error(`Error fetching quiz results for student ${studentId}:`, resultsError);
    }

    // Format history and merge with quiz scores
    const formattedHistory = ratingHistory?.map(item => {
      // Find matching quiz result by lesson_id - use the most recent one
      // since a student might have taken the same lesson multiple times
      const matchingResults = quizResults?.filter(r => r.lesson_id === item.lesson_id) || [];
      
      let matchingResult = null;
      if (matchingResults.length > 0) {
        // Try to find the result closest in timestamp first (within 5 minutes)
        matchingResult = matchingResults.find(r => 
          Math.abs(new Date(r.timestamp).getTime() - new Date(item.timestamp).getTime()) < 300000 // Within 5 minutes
        );
        
        // If no close timestamp match, just use the first (most recent) one for that lesson
        if (!matchingResult) {
          matchingResult = matchingResults[0];
        }
      }

      return {
        ...item,
        lesson_title: item.lessons?.title,
        quiz_score: matchingResult?.score,
        quiz_total_points: matchingResult?.total_points,
        quiz_percentage: matchingResult ? Math.round((matchingResult.score / matchingResult.total_points) * 100) : null
      };
    }) || [];

    return {
      student,
      rating,
      ratingHistory: formattedHistory
    };
  }

  // Get student by ID
  async getStudentById(studentId) {
    const { data: student, error } = await supabase
      .from('students')
      .select('*')
      .eq('id', studentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Student not found');
      }
      throw error;
    }

    // Map database columns to expected frontend properties for consistency
    if (student) {
      student.device_identifier = student.approved_device_id;
      student.device_status = student.approved_device_id ? 'Liên kết' : 'Chưa liên kết';
      student.session_status = student.current_session_id ? 'Hoạt động' : 'Không có phiên';
    }

    return student;
  }

  // Save raw lesson content (for session storage fallback)
  async saveRawLessonContent(id, content, userId) {
    const { data, error } = await supabaseAdmin
      .from('temp_lesson_content')
      .upsert({
        id: id,
        content: content,
        created_at: new Date().toISOString(),
        user_id: userId || 'unknown'
      });

    if (error) throw error;
    return data;
  }

  // Get raw lesson content
  async getRawLessonContent(id) {
    const { data, error } = await supabaseAdmin
      .from('temp_lesson_content')
      .select('content')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Content not found');
      }
      throw error;
    }
    return data;
  }

  // Get quiz data
  async getQuizData() {
    const { data: quizConfig, error } = await supabase
      .from('quizzes')
      .select('quiz_data')
      .eq('id', 'main_quiz')
      .maybeSingle();

    if (error) throw error;
    return quizConfig?.quiz_data || { questions: [] };
  }

  // Save quiz result
  async saveQuizResult(resultData) {
    const { data, error } = await supabase
      .from('quiz_results')
      .insert(resultData)
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  // Save quiz data (admin)
  async saveQuizData(quizData) {
    const { error } = await supabase
      .from('quizzes')
      .upsert({
        id: 'main_quiz',
        quiz_data: quizData
      });

    if (error) throw error;
    return true;
  }

  // Get all unique tags from lessons
  async getAllUniqueTags() {
    const { data, error } = await supabase
      .from('lessons')
      .select('tags');

    if (error) throw error;

    const allTags = new Set();
    if (data) {
      data.forEach(lesson => {
        if (Array.isArray(lesson.tags)) {
          lesson.tags.forEach(tag => {
            if (tag && typeof tag === 'string') {
              allTags.add(tag.trim());
            }
          });
        }
      });
    }

    return Array.from(allTags).sort();
  }

  // Get related tags for a specific tag
  async getRelatedTags(selectedTag) {
    try {
      console.log(`[DatabaseService] Getting related tags for: ${selectedTag}`);

      // Get all lessons that contain the selected tag
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('tags')
        .contains('tags', `["${selectedTag}"]`);

      if (lessonsError) throw lessonsError;

      // Collect all tags from lessons that share the selected tag
      const relatedTagsSet = new Set();
      const tagCounts = {};

      lessons?.forEach(lesson => {
        if (Array.isArray(lesson.tags)) {
          lesson.tags.forEach(tag => {
            if (tag && typeof tag === 'string' && tag !== selectedTag) {
              const cleanTag = tag.trim();
              relatedTagsSet.add(cleanTag);
              tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
            }
          });
        }
      });

      // Convert to array and sort by frequency
      const relatedTags = Array.from(relatedTagsSet)
        .map(tag => ({
          tag,
          count: tagCounts[tag]
        }))
        .sort((a, b) => b.count - a.count);

      console.log(`[DatabaseService] Found ${relatedTags.length} related tags for ${selectedTag}`);
      return relatedTags;
    } catch (error) {
      console.error('Error getting related tags:', error);
      return [];
    }
  }

  // Get tags that appear in lessons containing ALL specified tags (intersection)
  async getIntersectionTags(selectedTags) {
    try {
      console.log(`[DatabaseService] Getting intersection tags for: ${selectedTags.join(', ')}`);

      if (!selectedTags || selectedTags.length === 0) {
        return [];
      }

      // Build query to find lessons that contain ALL selected tags
      let query = supabase.from('lessons').select('tags');

      // Add contains filter for each selected tag
      selectedTags.forEach(tag => {
        query = query.contains('tags', `["${tag}"]`);
      });

      const { data: lessons, error: lessonsError } = await query;
      if (lessonsError) throw lessonsError;

      // Collect all tags from lessons that contain ALL selected tags
      const intersectionTagsSet = new Set();
      const tagCounts = {};

      lessons?.forEach(lesson => {
        if (Array.isArray(lesson.tags)) {
          lesson.tags.forEach(tag => {
            if (tag && typeof tag === 'string' && !selectedTags.includes(tag)) {
              const cleanTag = tag.trim();
              intersectionTagsSet.add(cleanTag);
              tagCounts[cleanTag] = (tagCounts[cleanTag] || 0) + 1;
            }
          });
        }
      });

      // Convert to array and sort by frequency
      const intersectionTags = Array.from(intersectionTagsSet)
        .map(tag => ({
          tag,
          count: tagCounts[tag]
        }))
        .sort((a, b) => b.count - a.count);

      console.log(`[DatabaseService] Found ${intersectionTags.length} intersection tags for [${selectedTags.join(', ')}]`);
      return intersectionTags;
    } catch (error) {
      console.error('Error getting intersection tags:', error);
      return [];
    }
  }

  // Get tag-to-lessons mapping for client-side filtering
  async getTagToLessonsMapping() {
    try {
      console.log(`[DatabaseService] Getting tag-to-lessons mapping`);

      // Get all lessons with their IDs and tags
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, tags');

      if (lessonsError) throw lessonsError;

      const tagToLessons = {};

      lessons?.forEach(lesson => {
        if (Array.isArray(lesson.tags)) {
          lesson.tags.forEach(tag => {
            if (tag && typeof tag === 'string') {
              const cleanTag = tag.trim();
              if (!tagToLessons[cleanTag]) {
                tagToLessons[cleanTag] = [];
              }
              tagToLessons[cleanTag].push(lesson.id);
            }
          });
        }
      });

      console.log(`[DatabaseService] Built tag-to-lessons mapping for ${Object.keys(tagToLessons).length} tags`);
      return tagToLessons;
    } catch (error) {
      console.error('Error getting tag-to-lessons mapping:', error);
      return {};
    }
  }

  // Get popular tags with usage statistics
  async getPopularTags(limit = 10) {
    try {
      console.log(`[DatabaseService] Getting popular tags with limit: ${limit}`);

      // Get all lessons with their tags and views
      const { data: lessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, tags, views, created, last_updated');

      if (lessonsError) throw lessonsError;

      console.log(`[DatabaseService] Found ${lessons?.length || 0} lessons for tag analysis`);

      // Calculate tag statistics
      const tagStats = {};
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

      lessons?.forEach(lesson => {
        if (Array.isArray(lesson.tags)) {
          const lessonViews = lesson.views || 0;
          const isRecent = new Date(lesson.last_updated || lesson.created) > thirtyDaysAgo;

          lesson.tags.forEach(tag => {
            if (tag && typeof tag === 'string') {
              const cleanTag = tag.trim();
              if (!tagStats[cleanTag]) {
                tagStats[cleanTag] = {
                  tag: cleanTag,
                  lessonCount: 0,
                  totalViews: 0,
                  recentActivity: 0,
                  popularityScore: 0
                };
              }

              tagStats[cleanTag].lessonCount += 1;
              tagStats[cleanTag].totalViews += lessonViews;
              if (isRecent) {
                tagStats[cleanTag].recentActivity += 1;
              }
            }
          });
        }
      });

      // Calculate popularity scores and sort
      const popularTags = Object.values(tagStats)
        .map(tagStat => {
          // Popularity score based on: lesson count (40%), total views (40%), recent activity (20%)
          tagStat.popularityScore =
            (tagStat.lessonCount * 0.4) +
            (tagStat.totalViews * 0.004) + // Scale down views
            (tagStat.recentActivity * 0.2);

          return tagStat;
        })
        .sort((a, b) => b.popularityScore - a.popularityScore)
        .slice(0, limit);

      console.log(`[DatabaseService] Calculated ${popularTags.length} popular tags:`,
        popularTags.map(t => `${t.tag}(${t.lessonCount})`).join(', '));

      return popularTags;
    } catch (error) {
      console.error('Error getting popular tags:', error);
      // Fallback to basic tags if popular tags calculation fails
      const basicTags = await this.getAllUniqueTags();
      return basicTags.slice(0, limit).map(tag => ({
        tag,
        lessonCount: 0,
        totalViews: 0,
        recentActivity: 0,
        popularityScore: 0
      }));
    }
  }

  // ===== PROGRESS TRACKING METHODS =====

  // Get student's completed lessons
  async getStudentCompletedLessons(studentId) {
    try {
      if (!studentId) {
        console.warn('getStudentCompletedLessons called without studentId');
        return [];
      }

      const { data, error } = await supabase
        .from('results')
        .select('lesson_id, score, total_points, timestamp')
        .eq('student_id', studentId)
        .gte('score', 1); // Only count lessons with at least 1 point as completed

      if (error) {
        console.error('Database error in getStudentCompletedLessons:', error);
        throw error;
      }

      return data || [];
    } catch (error) {
      console.error('Error in getStudentCompletedLessons:', error);
      throw error;
    }
  }



  // Get last incomplete lesson for student
  async getLastIncompleteLesson(studentId) {
    try {
      // Input validation
      if (!studentId) {
        console.warn('getLastIncompleteLesson called without studentId');
        return null;
      }

      // Get all lessons with error handling
      const { data: allLessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, subject, grade')
        .order('order', { ascending: true });

      if (lessonsError) {
        console.error('Database error getting lessons in getLastIncompleteLesson:', lessonsError);
        throw lessonsError;
      }

      // Validate lessons data
      if (!allLessons || !Array.isArray(allLessons)) {
        console.warn('No lessons found or invalid lessons data');
        return null;
      }

      // Get completed lesson IDs with proper error handling
      const completedLessons = await this.getStudentCompletedLessons(studentId);
      const completedIds = (completedLessons || []).map(lesson => lesson.lesson_id);

      // Find first incomplete lesson
      const incompleteLesson = allLessons.find(lesson => !completedIds.includes(lesson.id));
      return incompleteLesson || null;
    } catch (error) {
      console.error('Error in getLastIncompleteLesson:', error);
      throw error;
    }
  }

  // Get student's mistakes count for review
  async getStudentMistakesCount(studentId, filters = {}) {
    let query = supabase
      .from('results')
      .select('questions, lessons(subject)')
      .eq('student_id', studentId);

    // Apply subject filter if provided
    if (filters.subject) {
      query = query.eq('lessons.subject', filters.subject);
    }

    const { data, error } = await query;

    if (error) throw error;

    let mistakesCount = 0;
    if (data) {
      data.forEach(result => {
        if (result.questions && Array.isArray(result.questions)) {
          result.questions.forEach(question => {
            if (question.isCorrect === false) {
              // Apply reviewed filter if provided
              if (filters.reviewed !== undefined) {
                // For now, we'll assume mistakes are not reviewed by default
                const isReviewed = false;
                if (filters.reviewed === 'true' && !isReviewed) return;
                if (filters.reviewed === 'false' && isReviewed) return;
              }
              mistakesCount++;
            }
          });
        }
      });
    }

    return mistakesCount;
  }

  // Mark mistakes as reviewed
  async markMistakesReviewed(studentId, mistakeIds) {
    // For now, we'll store reviewed mistakes in localStorage on frontend
    // In a full implementation, we'd create a reviewed_mistakes table
    // and store the reviewed status there

    // Validate that the mistake IDs belong to this student
    const validMistakes = [];

    for (const mistakeId of mistakeIds) {
      const [resultId, questionIndex] = mistakeId.split('_');

      const { data, error } = await supabase
        .from('results')
        .select('student_id, questions')
        .eq('id', resultId)
        .eq('student_id', studentId)
        .single();

      if (!error && data && data.questions[parseInt(questionIndex)]) {
        validMistakes.push(mistakeId);
      }
    }

    // For now, just return success if mistakes exist
    // In a full implementation, we'd insert into reviewed_mistakes table
    return {
      success: true,
      reviewedMistakes: validMistakes,
      message: `${validMistakes.length} mistakes marked as reviewed`
    };
  }

  // Create practice session from mistakes
  async createPracticeSession(studentId, mistakeIds = [], count = 10) {
    const safeCount = clampQuestionCount(count);
    let requestedMistakeIds = Array.isArray(mistakeIds)
      ? mistakeIds.map((id) => String(id || '')).filter(Boolean)
      : [];

    // An empty selection means "use my most recent mistakes". Fetch extra rows
    // because a legacy result can occasionally lack enough data to rebuild a question.
    if (requestedMistakeIds.length === 0) {
      const recentMistakes = await this.getStudentMistakes(
        studentId,
        Math.min(safeCount * 3, 90)
      );
      requestedMistakeIds = recentMistakes.map((mistake) => mistake.id);
    }

    requestedMistakeIds = Array.from(new Set(requestedMistakeIds))
      .filter((id) => parseMistakeId(id))
      .slice(0, Math.min(safeCount * 3, 90));

    const resultIds = Array.from(new Set(
      requestedMistakeIds.map((id) => parseMistakeId(id)?.resultId).filter(Boolean)
    ));
    if (resultIds.length === 0) return [];

    // Ownership is enforced in the query so one student cannot request another
    // student's result by changing a mistake ID in the browser.
    const { data: resultRows, error: resultsError } = await supabase
      .from('results')
      .select('id, lesson_id, questions')
      .eq('student_id', studentId)
      .in('id', resultIds);

    if (resultsError) throw resultsError;
    if (!resultRows || resultRows.length === 0) return [];

    const lessonIds = Array.from(new Set(
      resultRows.map((result) => result.lesson_id).filter(Boolean)
    ));
    let lessonRows = [];
    if (lessonIds.length > 0) {
      const { data, error: lessonsError } = await supabase
        .from('lessons')
        .select('id, title, subject, questions')
        .in('id', lessonIds);

      if (lessonsError) throw lessonsError;
      lessonRows = data || [];
    }

    const lessonById = new Map(lessonRows.map((lesson) => [String(lesson.id), lesson]));
    const hydratedResults = resultRows.map((result) => ({
      ...result,
      lessons: lessonById.get(String(result.lesson_id)) || null
    }));

    return buildPersonalizedPracticeQuestions(
      requestedMistakeIds,
      hydratedResults,
      safeCount
    );
  }

  // Save practice session results
  async savePracticeResults(studentId, practiceData) {
    // For now, we'll store practice results in the same results table
    // with a special flag or in localStorage on frontend
    // In a full implementation, we'd create a practice_sessions table

    const practiceResult = {
      student_id: studentId,
      lessonId: 'practice_session',
      score: practiceData.score,
      totalQuestions: practiceData.totalQuestions,
      percentage: Math.round((practiceData.score / practiceData.totalQuestions) * 100),
      timeSpent: practiceData.time_taken,
      questions: practiceData.questions,
      timestamp: practiceData.timestamp,
      type: 'practice',
      source: 'mistakes'
    };

    // For now, just return the practice result without saving to database
    // In a full implementation, we'd save to practice_sessions table
    return {
      id: `practice_${Date.now()}`,
      ...practiceResult,
      message: 'Practice session completed'
    };
  }

  // Get progress by topic/subject
  async getProgressByTopic(studentId) {
    // Get all lessons grouped by subject
    const { data: allLessons, error: lessonsError } = await supabase
      .from('lessons')
      .select('id, title, subject, grade, tags');

    if (lessonsError) throw lessonsError;

    // Get completed lessons
    const completedLessons = await this.getStudentCompletedLessons(studentId);
    const completedIds = completedLessons.map(lesson => lesson.lesson_id);

    // Group by subject
    const progressByTopic = {};
    allLessons.forEach(lesson => {
      const topic = lesson.subject || 'Other';
      if (!progressByTopic[topic]) {
        progressByTopic[topic] = {
          total: 0,
          completed: 0,
          lessons: []
        };
      }

      progressByTopic[topic].total++;
      progressByTopic[topic].lessons.push({
        id: lesson.id,
        title: lesson.title,
        completed: completedIds.includes(lesson.id),
        grade: lesson.grade,
        tags: lesson.tags
      });

      if (completedIds.includes(lesson.id)) {
        progressByTopic[topic].completed++;
      }
    });

    // Calculate percentages
    Object.keys(progressByTopic).forEach(topic => {
      const data = progressByTopic[topic];
      data.percentage = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0;
    });

    return progressByTopic;
  }



  // Get student learning statistics
  async getStudentLearningStats(studentId, period = 'week') {
    let dateFilter;
    const now = new Date();

    switch (period) {
      case 'week':
        dateFilter = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        dateFilter = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateFilter = new Date('2020-01-01'); // All time
    }

    const { data, error } = await supabase
      .from('results')
      .select('score, total_points, timestamp, lesson_id')
      .eq('student_id', studentId)
      .gte('timestamp', dateFilter.toISOString());

    if (error) throw error;

    const stats = {
      totalLessons: data.length,
      totalScore: data.reduce((sum, result) => sum + result.score, 0),
      totalPossibleScore: data.reduce((sum, result) => sum + result.totalPoints, 0),
      averageScore: 0,
      accuracy: 0,
      activeDays: 0,
      lessonsPerDay: 0
    };

    if (data.length > 0) {
      stats.averageScore = Math.round(stats.totalScore / data.length * 100) / 100;
      stats.accuracy = stats.totalPossibleScore > 0 ?
        Math.round((stats.totalScore / stats.totalPossibleScore) * 100) : 0;

      // Calculate active days
      const uniqueDates = [...new Set(data.map(result =>
        new Date(result.timestamp).toDateString()
      ))];
      stats.activeDays = uniqueDates.length;
      stats.lessonsPerDay = stats.activeDays > 0 ?
        Math.round((stats.totalLessons / stats.activeDays) * 100) / 100 : 0;
    }

    return stats;
  }

  // Get recommended lessons for student
  async getRecommendedLessons(studentId, limit = 5) {
    // Get completed lessons
    const completedLessons = await this.getStudentCompletedLessons(studentId);
    const completedIds = completedLessons.map(lesson => lesson.lesson_id);

    // Get student's preferred subjects/tags from completed lessons
    const { data: completedLessonDetails, error: completedError } = await supabase
      .from('lessons')
      .select('subject, grade, tags')
      .in('id', completedIds);

    if (completedError) throw completedError;

    // Analyze preferences
    const subjectCounts = {};
    const tagCounts = {};
    let averageGrade = 0;

    completedLessonDetails.forEach(lesson => {
      if (lesson.subject) {
        subjectCounts[lesson.subject] = (subjectCounts[lesson.subject] || 0) + 1;
      }
      if (lesson.grade) {
        averageGrade += parseInt(lesson.grade) || 0;
      }
      if (lesson.tags && Array.isArray(lesson.tags)) {
        lesson.tags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });
      }
    });

    averageGrade = completedLessonDetails.length > 0 ?
      Math.round(averageGrade / completedLessonDetails.length) : 10;

    // Get preferred subjects and tags
    const preferredSubjects = Object.keys(subjectCounts)
      .sort((a, b) => subjectCounts[b] - subjectCounts[a])
      .slice(0, 3);

    const preferredTags = Object.keys(tagCounts)
      .sort((a, b) => tagCounts[b] - tagCounts[a])
      .slice(0, 5);

    // Find recommended lessons
    let query = supabase
      .from('lessons')
      .select('id, title, subject, grade, tags, description, lesson_image')
      .not('id', 'in', `(${completedIds.join(',')})`)
      .limit(limit * 2); // Get more to filter

    const { data: allLessons, error: lessonsError } = await query;
    if (lessonsError) throw lessonsError;

    // Score lessons based on preferences
    const scoredLessons = allLessons.map(lesson => {
      let score = 0;

      // Subject match
      if (preferredSubjects.includes(lesson.subject)) {
        score += 3;
      }

      // Grade proximity
      const gradeMatch = Math.abs((parseInt(lesson.grade) || 10) - averageGrade);
      score += Math.max(0, 2 - gradeMatch);

      // Tag matches
      if (lesson.tags && Array.isArray(lesson.tags)) {
        lesson.tags.forEach(tag => {
          if (preferredTags.includes(tag)) {
            score += 1;
          }
        });
      }

      return { ...lesson, recommendationScore: score };
    });

    // Sort by score and return top recommendations with field mapping
    const mappedRecommendations = scoredLessons
      .sort((a, b) => b.recommendationScore - a.recommendationScore)
      .slice(0, limit)
      .map(lesson => ({
        ...lesson,
        lessonImage: lesson.lesson_image // Map lesson_image to lessonImage for frontend compatibility
      }));

    return mappedRecommendations;
  }

  // Get student's mistakes for review
  async getStudentMistakes(studentId, limit = 20, offset = 0, filters = {}) {
    let query = supabase
      .from('results')
      .select('id, lesson_id, questions, timestamp, lessons(title, subject)')
      .eq('student_id', studentId)
      .order('timestamp', { ascending: false });

    // Apply subject filter if provided
    if (filters.subject) {
      query = query.eq('lessons.subject', filters.subject);
    }

    const { data, error } = await query.limit(100); // Get more results to filter properly

    if (error) throw error;

    const mistakes = [];
    let mistakeIndex = 0;
    if (data) {
      data.forEach(result => {
        if (result.questions && Array.isArray(result.questions)) {
          result.questions.forEach((question, questionIndex) => {
            if (question.isCorrect === false) {
              // Create unique ID for this mistake
              const mistakeId = `${result.id}_${questionIndex}`;

              // Apply reviewed filter if provided
              if (filters.reviewed !== undefined) {
                // For now, we'll assume mistakes are not reviewed by default
                // In a full implementation, we'd check a reviewed_mistakes table
                const isReviewed = false;
                if (filters.reviewed === 'true' && !isReviewed) return;
                if (filters.reviewed === 'false' && isReviewed) return;
              }

              // Apply pagination
              if (mistakeIndex >= offset && mistakes.length < limit) {
                mistakes.push({
                  id: mistakeId,
                  lessonId: result.lesson_id,
                  lessonTitle: result.lessons?.title || 'Unknown Lesson',
                  subject: result.lessons?.subject || 'Unknown',
                  question: question.question,
                  userAnswer: question.userAnswer,
                  correctAnswer: question.correctAnswer,
                  timestamp: result.timestamp,
                  type: question.type || 'multiple_choice',
                  reviewed: false // For now, default to not reviewed
                });
              }
              mistakeIndex++;
            }
          });
        }
      });
    }

    return mistakes;
  }

  // Mark lesson as completed
  async markLessonCompleted(studentId, lessonId, score, time_taken) {
    // This is typically handled by the results submission
    // But we can add additional completion tracking here if needed

    // For now, we'll just verify the lesson exists and return success
    const lesson = await this.getLessonById(lessonId);
    if (!lesson) {
      throw new Error('Lesson not found');
    }

    return {
      success: true,
      lessonId,
      studentId,
      completedAt: new Date().toISOString()
    };
  }



  // Delete student and all associated data
  async deleteStudentAndData(studentId) {
    console.warn(`ADMIN ACTION: Attempting to permanently delete student ${studentId} and all related data.`);

    try {
      // Delete in order to avoid foreign key constraints

      // 1. Delete rating history
      console.log(`Deleting rating history for student ${studentId}...`);
      const { error: historyError } = await supabaseAdmin
        .from('rating_history')
        .delete()
        .eq('student_id', studentId);
      if (historyError) {
        console.error('Error deleting rating history:', historyError);
      }

      // 2. Delete ratings
      console.log(`Deleting ratings for student ${studentId}...`);
      const { error: ratingError } = await supabaseAdmin
        .from('ratings')
        .delete()
        .eq('student_id', studentId);
      if (ratingError) {
        console.error('Error deleting ratings:', ratingError);
      }

      // 3. Delete quiz results
      console.log(`Deleting quiz results for student ${studentId}...`);
      const { error: quizResultsError } = await supabaseAdmin
        .from('quiz_results')
        .delete()
        .eq('student_id', studentId);
      if (quizResultsError) {
        console.error('Error deleting quiz results:', quizResultsError);
      }

      // 4. Delete lesson results
      console.log(`Deleting lesson results for student ${studentId}...`);
      const { error: resultsError } = await supabaseAdmin
        .from('results')
        .delete()
        .eq('student_id', studentId);
      if (resultsError) {
        console.error('Error deleting lesson results:', resultsError);
      }

      // 5. Finally, delete the student record
      console.log(`Deleting student record ${studentId}...`);
      const { error: studentDeleteError } = await supabaseAdmin
        .from('students')
        .delete()
        .eq('id', studentId);

      if (studentDeleteError) {
        console.error('Critical error deleting student record:', studentDeleteError);
        throw new Error(`Failed to delete student record: ${studentDeleteError.message}`);
      }

      console.log(`Successfully deleted student ${studentId} and associated data.`);
      return true;

    } catch (error) {
      console.error(`Error processing delete request for student ${studentId}:`, error);
      throw error;
    }
  }

  // Update device information for student
  async updateDeviceInfo(studentId, deviceId, deviceFingerprint) {
    const updateData = {};

    if (deviceId) {
      // Check if this is a device_id (new system) or device_fingerprint (legacy)
      if (deviceId.length > 20) { // Assume device_id is longer
        updateData.approved_device_id = deviceId;
        updateData.device_registered_at = new Date().toISOString();
      } else {
        // Legacy fingerprint support
        updateData.approved_device_fingerprint = deviceId;
      }
    }

    if (deviceFingerprint) {
      updateData.approved_device_fingerprint = deviceFingerprint;
    }

    await this.updateStudent(studentId, updateData);
    return true;
  }

  // Unbind device from student
  async unbindDevice(studentId) {
    const { data, error } = await supabase
      .from('students')
      .update({
        approved_device_fingerprint: null,
        approved_device_id: null
      })
      .eq('id', studentId)
      .select('id')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Student not found');
      }
      throw error;
    }

    return true;
  }

  // Get lesson results with student info
  async getLessonResultsWithStudents(lessonId) {
    const { data: results, error } = await supabase
      .from('results')
      .select(`
        *,
        students ( full_name )
      `)
      .eq('lesson_id', lessonId);

    if (error) throw error;
    return results || [];
  }

  // Get history with pagination
  async getHistoryWithPagination(options = {}) {
    const { page = 1, limit = 15, search = '', sort = 'time-desc' } = options;
    const startIndex = (page - 1) * limit;

    // Determine sorting
    let orderAscending = false;
    let orderColumn = 'timestamp';

    const sortMap = {
      'time-asc': { column: 'timestamp', ascending: true },
      'time-desc': { column: 'timestamp', ascending: false },
      'score-asc': { column: 'score', ascending: true },
      'score-desc': { column: 'score', ascending: false },
    };

    if (sortMap[sort]) {
      orderColumn = sortMap[sort].column;
      orderAscending = sortMap[sort].ascending;
    }

    let query = supabase
      .from('results')
      .select(`
        id,
        student_id,
        timestamp,
        score,
        total_points,
        lesson_id,
        exam_guard_flags,
        student_info,
        students!inner ( full_name ),
        lessons ( title )
      `, { count: 'exact' });

    // Apply search filter if provided
    if (search) {
      query = query.or(`students.full_name.ilike.%${search}%,lessons.title.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(orderColumn, { ascending: orderAscending });

    // Apply pagination
    query = query.range(startIndex, startIndex + limit - 1);

    console.log(`[History] Fetching page ${page} (limit ${limit}, sort ${sort}, search "${search}")`);
    const startTime = Date.now();
    const { data: historyData, error, count: totalCount } = await query;
    console.log(`[History] Query completed in ${Date.now() - startTime}ms. Found ${historyData?.length || 0} items.`);

    if (error) throw error;

    const history = historyData.map(result => {
      // Primary: use dedicated exam_guard_flags column
      // Fallback: check student_info.examGuardFlags (stored as workaround before column existed)
      let flagCount = 0;
      if (Array.isArray(result.exam_guard_flags) && result.exam_guard_flags.length > 0) {
        flagCount = result.exam_guard_flags.length;
      } else if (result.student_info && Array.isArray(result.student_info.examGuardFlags)) {
        flagCount = result.student_info.examGuardFlags.length;
      }

      return {
        resultId: result.id,
        studentName: result.students?.full_name || 'Unknown Student',
        lessonTitle: result.lessons?.title || (result.lesson_id === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
        submittedAt: result.timestamp,
        score: result.score,
        totalPoints: result.total_points,
        scorePercentage: result.total_points ? ((result.score / result.total_points) * 100).toFixed(1) + '%' : 'N/A',
        flagCount
      };
    });

    return {
      history,
      total: totalCount || 0,
      page,
      limit
    };
  }

  // Calculate platform-wide statistics for dashboard
  async calculatePlatformStats() {
    try {
      // Get total lessons count
      const { count: totalLessons, error: lessonsError } = await supabase
        .from('lessons')
        .select('*', { count: 'exact', head: true });

      if (lessonsError) throw lessonsError;

      // Get total students count
      const { count: totalStudents, error: studentsError } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', true);

      if (studentsError) throw studentsError;

      // Get active lessons (lessons with recent activity in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: activeLessonsData, error: activeError } = await supabase
        .from('results')
        .select('lesson_id', { count: 'exact' })
        .gte('timestamp', sevenDaysAgo.toISOString())
        .not('lesson_id', 'eq', 'quiz_game');

      if (activeError) throw activeError;

      const activeLessons = new Set(activeLessonsData?.map(r => r.lesson_id) || []).size;

      // Get recent activity (submissions in last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      const { count: recentActivity, error: recentError } = await supabase
        .from('results')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', oneDayAgo.toISOString());

      if (recentError) throw recentError;

      // Calculate average score from all results
      const { data: scoreData, error: scoreError } = await supabase
        .from('results')
        .select('score, total_points')
        .not('lesson_id', 'eq', 'quiz_game')
        .not('total_points', 'is', null)
        .gt('total_points', 0);

      if (scoreError) throw scoreError;

      let averageScore = 0;
      if (scoreData && scoreData.length > 0) {
        const totalScore = scoreData.reduce((sum, result) => {
          const percentage = (result.score / result.total_points) * 100;
          return sum + percentage;
        }, 0);
        averageScore = Math.round(totalScore / scoreData.length);
      }

      return {
        totalLessons: totalLessons || 0,
        totalStudents: totalStudents || 0,
        activeLessons: activeLessons || 0,
        recentActivity: recentActivity || 0,
        averageScore: averageScore,
        last_updated: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error calculating platform stats:', error);
      // Return fallback values instead of throwing
      return {
        totalLessons: 0,
        totalStudents: 0,
        activeLessons: 0,
        recentActivity: 0,
        averageScore: 0,
        lastUpdated: new Date().toISOString(),
        error: 'Failed to calculate statistics'
      };
    }
  }

  // Calculate individual student statistics
  async calculateStudentStats(studentId) {
    try {
      // Get student's completed lessons
      const { data: results, error: resultsError } = await supabase
        .from('results')
        .select('score, total_points, timestamp, time_taken, lesson_id')
        .eq('student_id', studentId)
        .not('lesson_id', 'eq', 'quiz_game'); // Exclude quiz game results

      if (resultsError) throw resultsError;

      const totalLessonsCompleted = results?.length || 0;

      // Calculate average score
      let averageScore = 0;
      if (results && results.length > 0) {
        const totalPercentage = results.reduce((sum, result) => {
          if (result.totalPoints > 0) {
            return sum + (result.score / result.totalPoints) * 100;
          }
          return sum;
        }, 0);
        averageScore = Math.round(totalPercentage / results.length);
      }

      // Calculate total time spent (in minutes)
      const totalTimeSpent = results?.reduce((sum, result) => {
        return sum + (result.time_taken || 0);
      }, 0) || 0;

      // Get last activity timestamp
      const lastActivity = results && results.length > 0 ?
        Math.max(...results.map(r => new Date(r.timestamp))) : null;

      return {
        totalLessonsCompleted,
        averageScore,
        totalTimeSpent: Math.round(totalTimeSpent / 60), // Convert to minutes
        lastActivity: lastActivity ? new Date(lastActivity).toISOString() : null
      };
    } catch (error) {
      console.error('Error calculating student stats:', error);
      return {
        totalLessonsCompleted: 0,
        averageScore: 0,
        totalTimeSpent: 0,
        lastActivity: null
      };
    }
  }

  // Get student activity log
  async getStudentActivityLog(studentId, limit = 50) {
    try {
      const { data: activities, error } = await supabase
        .from('results')
        .select(`
          id,
          timestamp,
          score,
          total_points,
          time_taken,
          lesson_id,
          lessons ( title, subject )
        `)
        .eq('student_id', studentId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return activities?.map(activity => ({
        id: activity.id,
        type: 'lesson_completion',
        timestamp: activity.timestamp,
        lessonId: activity.lesson_id,
        lessonTitle: activity.lessons?.title ||
          (activity.lesson_id === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
        subject: activity.lessons?.subject || 'Unknown',
        score: activity.score,
        totalPoints: activity.total_points,
        scorePercentage: activity.total_points > 0 ?
          Math.round((activity.score / activity.total_points) * 100) : 0,
        timeSpent: activity.time_taken || 0,
        description: `Completed ${activity.lessons?.title || 'lesson'} with ${activity.totalPoints > 0 ?
            Math.round((activity.score / activity.totalPoints) * 100) : 0
          }% score`
      })) || [];
    } catch (error) {
      console.error('Error getting student activity log:', error);
      return [];
    }
  }

  // Reset student password (admin only)
  async resetStudentPassword(studentId, newPassword) {
    try {
      const bcrypt = require('bcrypt');
      const saltRounds = 10;

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password in database
      const { error } = await supabase
        .from('students')
        .update({ password_hash: hashedPassword })
        .eq('id', studentId);

      if (error) throw error;

      return {
        success: true,
        message: 'Password reset successfully'
      };
    } catch (error) {
      console.error('Error resetting student password:', error);
      throw new Error('Failed to reset password');
    }
  }

  // Get all results with pagination and filtering
  async getAllResults(page = 1, limit = 50, filters = {}) {
    try {
      const offset = (page - 1) * limit;

      let query = supabase
        .from('results')
        .select(`
          id,
          student_id,
          timestamp,
          score,
          total_points,
          time_taken,
          lesson_id,
          students!inner ( full_name, phone_number ),
          lessons ( title, subject )
        `, { count: 'exact' });

      // Apply filters if provided
      if (filters.studentId) {
        query = query.eq('student_id', filters.studentId);
      }
      if (filters.lessonId) {
        query = query.eq('lesson_id', filters.lessonId);
      }
      if (filters.dateFrom) {
        query = query.gte('timestamp', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('timestamp', filters.dateTo);
      }

      const { data: results, error, count } = await query
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const formattedResults = results?.map(result => ({
        id: result.id,
        studentId: result.student_id,
        studentName: result.students?.full_name || 'Unknown Student',
        studentPhone: result.students?.phone_number || 'N/A',
        lessonId: result.lesson_id,
        lessonTitle: result.lessons?.title ||
          (result.lesson_id === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
        subject: result.lessons?.subject || 'Unknown',
        timestamp: result.timestamp,
        score: result.score,
        totalPoints: result.total_points,
        scorePercentage: result.total_points > 0 ?
          Math.round((result.score / result.total_points) * 100) : 0,
        timeSpent: result.time_taken || 0
      })) || [];

      return {
        results: formattedResults,
        total: count || 0,
        page: parseInt(page),
        limit: parseInt(limit)
      };
    } catch (error) {
      console.error('Error getting all results:', error);
      return {
        results: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit)
      };
    }
  }

  // Get results by student with pagination
  async getResultsByStudent(studentId, page = 1, limit = 50) {
    try {
      const offset = (page - 1) * limit;

      const { data: results, error, count } = await supabase
        .from('results')
        .select(`
          id,
          timestamp,
          score,
          total_points,
          time_taken,
          lesson_id,
          lessons ( title, subject )
        `, { count: 'exact' })
        .eq('student_id', studentId)
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const formattedResults = results?.map(result => ({
        id: result.id,
        lessonId: result.lesson_id,
        lessonTitle: result.lessons?.title ||
          (result.lesson_id === 'quiz_game' ? 'Trò chơi chinh phục' : 'Unknown Lesson'),
        subject: result.lessons?.subject || 'Unknown',
        timestamp: result.timestamp,
        score: result.score,
        totalPoints: result.total_points,
        scorePercentage: result.total_points > 0 ?
          Math.round((result.score / result.total_points) * 100) : 0,
        timeSpent: result.time_taken || 0
      })) || [];

      return {
        results: formattedResults,
        total: count || 0,
        page: parseInt(page),
        limit: parseInt(limit),
        studentId
      };
    } catch (error) {
      console.error('Error getting results by student:', error);
      return {
        results: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        studentId
      };
    }
  }

  // Calculate result statistics
  async calculateResultStatistics(filters = {}) {
    try {
      let query = supabase
        .from('results')
        .select(`
          score,
          total_points,
          time_taken,
          lesson_id,
          timestamp,
          lessons ( title, subject )
        `);

      // Apply filters if provided
      if (filters.dateFrom) {
        query = query.gte('timestamp', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('timestamp', filters.dateTo);
      }
      if (filters.subject) {
        query = query.eq('lessons.subject', filters.subject);
      }

      const { data: results, error } = await query;
      if (error) throw error;

      const totalResults = results?.length || 0;

      // Calculate average score
      let averageScore = 0;
      let totalValidResults = 0;
      let totalTime = 0;

      if (results && results.length > 0) {
        const validResults = results.filter(r => r.total_points > 0);
        totalValidResults = validResults.length;

        if (totalValidResults > 0) {
          const totalPercentage = validResults.reduce((sum, result) => {
            return sum + (result.score / result.total_points) * 100;
          }, 0);
          averageScore = Math.round(totalPercentage / totalValidResults);
        }

        // Calculate total time spent
        totalTime = results.reduce((sum, result) => {
          return sum + (result.time_taken || 0);
        }, 0);
      }

      // Get completion rate (percentage of students who completed at least one lesson)
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_approved', true);

      const { data: studentsWithResults } = await supabase
        .from('results')
        .select('student_id')
        .not('lesson_id', 'eq', 'quiz_game');

      const uniqueStudents = new Set(studentsWithResults?.map(r => r.student_id) || []).size;
      const completionRate = totalStudents > 0 ? Math.round((uniqueStudents / totalStudents) * 100) : 0;

      // Get top performing lessons
      const lessonStats = {};
      results?.forEach(result => {
        if (result.lesson_id !== 'quiz_game' && result.total_points > 0) {
          if (!lessonStats[result.lesson_id]) {
            lessonStats[result.lesson_id] = {
              lessonId: result.lesson_id,
              title: result.lessons?.title || 'Unknown Lesson',
              subject: result.lessons?.subject || 'Unknown',
              totalAttempts: 0,
              totalScore: 0,
              averageScore: 0
            };
          }
          lessonStats[result.lesson_id].totalAttempts++;
          lessonStats[result.lesson_id].totalScore += (result.score / result.total_points) * 100;
        }
      });

      const topPerformingLessons = Object.values(lessonStats)
        .map(lesson => ({
          ...lesson,
          averageScore: Math.round(lesson.totalScore / lesson.totalAttempts)
        }))
        .sort((a, b) => b.averageScore - a.averageScore)
        .slice(0, 5);

      // Get recent activity (last 10 results)
      const { data: recentResults } = await supabase
        .from('results')
        .select(`
          timestamp,
          score,
          total_points,
          students ( full_name ),
          lessons ( title )
        `)
        .order('timestamp', { ascending: false })
        .limit(10);

      const recentActivity = recentResults?.map(result => ({
        timestamp: result.timestamp,
        studentName: result.students?.full_name || 'Unknown Student',
        lessonTitle: result.lessons?.title || 'Unknown Lesson',
        scorePercentage: result.total_points > 0 ?
          Math.round((result.score / result.total_points) * 100) : 0
      })) || [];

      return {
        totalResults,
        averageScore,
        completionRate,
        averageTime: totalResults > 0 ? Math.round(totalTime / totalResults) : 0,
        topPerformingLessons,
        recentActivity,
        totalStudentsWithResults: uniqueStudents,
        calculatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error calculating result statistics:', error);
      return {
        totalResults: 0,
        averageScore: 0,
        completionRate: 0,
        averageTime: 0,
        topPerformingLessons: [],
        recentActivity: [],
        totalStudentsWithResults: 0,
        calculatedAt: new Date().toISOString(),
        error: 'Failed to calculate statistics'
      };
    }
  }

  // Get detailed lesson statistics for admin dashboard
  async getLessonDetailedStatistics(lessonId) {
    try {
      // Get lesson basic info (pass true to get all questions as admin)
      const lesson = await this.getLessonById(lessonId, true);

      // Get all results for this lesson with student info
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          student_id,
          score,
          total_points,
          time_taken,
          timestamp,
          questions,
          students ( full_name, date_of_birth )
        `)
        .eq('lesson_id', lessonId);

      if (error) throw error;

      const totalAttempts = results?.length || 0;
      const uniqueStudentIds = new Set(results?.map(r => r.student_id).filter(Boolean) || []);
      const uniqueStudents = uniqueStudentIds.size;

      // Calculate basic statistics
      let averageScore = 0;
      let lowScores = 0;
      let highScores = 0;

      if (results && results.length > 0) {
        const scores = results.map(r => {
          if (r.total_points > 0) {
            return (r.score / r.total_points) * 100;
          }
          return 0;
        });

        averageScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        lowScores = scores.filter(score => score < 50).length;
        highScores = scores.filter(score => score >= 50).length;
      }

      // Create score distribution for chart
      const scoreRanges = ['0-20%', '21-40%', '41-60%', '61-80%', '81-100%'];
      const scoreDistribution = {
        labels: scoreRanges,
        data: [0, 0, 0, 0, 0]
      };

      results?.forEach(result => {
        if (result.total_points > 0) {
          const percentage = (result.score / result.total_points) * 100;
          if (percentage <= 20) scoreDistribution.data[0]++;
          else if (percentage <= 40) scoreDistribution.data[1]++;
          else if (percentage <= 60) scoreDistribution.data[2]++;
          else if (percentage <= 80) scoreDistribution.data[3]++;
          else scoreDistribution.data[4]++;
        }
      });

      // Create top scorers list (top 10)
      const topScorers = results
        ?.filter(r => r.total_points > 0)
        .map(r => ({
          name: r.students?.full_name || 'Unknown',
          score: Math.round((r.score / r.total_points) * 100),
          dob: r.students?.date_of_birth
            ? new Date(r.students.date_of_birth).toLocaleDateString('vi-VN')
            : '',
          timestamp: r.timestamp
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 10) || [];

      // Create full transcripts list (all students, best score per student)
      const studentBestScores = {};
      results?.forEach(r => {
        const studentId = r.student_id;
        if (!studentId) return;

        const scorePercent = r.total_points > 0
          ? Math.round((r.score / r.total_points) * 100)
          : 0;

        if (!studentBestScores[studentId]) {
          studentBestScores[studentId] = {
            studentId,
            name: r.students?.full_name || 'Unknown',
            bestScore: scorePercent,
            score: scorePercent,
            attemptsCount: 1,
            lastAttempt: r.timestamp,
            dob: r.students?.date_of_birth
              ? new Date(r.students.date_of_birth).toLocaleDateString('vi-VN')
              : ''
          };
          return;
        }

        studentBestScores[studentId].attemptsCount += 1;
        if (r.timestamp && (!studentBestScores[studentId].lastAttempt || r.timestamp > studentBestScores[studentId].lastAttempt)) {
          studentBestScores[studentId].lastAttempt = r.timestamp;
        }
        if (scorePercent > studentBestScores[studentId].bestScore) {
          studentBestScores[studentId].bestScore = scorePercent;
          studentBestScores[studentId].score = scorePercent;
        }
      });

      const transcripts = Object.values(studentBestScores)
        .sort((a, b) => b.bestScore - a.bestScore);

      // Analyze questions if available
      let questionStats = [];
      const lessonQuestions = lesson.questions;
      if (lessonQuestions && Array.isArray(lessonQuestions) && lessonQuestions.length > 0) {
        lessonQuestions.forEach((lessonQ, index) => {
          // Normalize question text for reliable matching
          const lessonQText = (typeof lessonQ === 'string' ? lessonQ : (lessonQ.question || lessonQ.text || "")).toString().trim();

          if ((lessonQ.type === 'true_false' || lessonQ.type === 'truefalse') && lessonQ.options && Array.isArray(lessonQ.options)) {
            let overallCorrect = 0;
            let overallIncorrect = 0;
            let overallCompletedCount = 0;
            
            // Initialize stats for each option
            const optionStats = lessonQ.options.map(opt => {
              let optStr = String(opt);
              if (typeof opt === 'object') {
                optStr = opt.text || opt.content || JSON.stringify(opt);
                if (typeof optStr === 'string') optStr = optStr.replace(/<[^>]*>?/gm, ''); 
              }
              return {
                text: optStr,
                correct: 0,
                incorrect: 0,
                completed: 0,
                notCompleted: 0
              };
            });

            results?.forEach(result => {
              if (result.questions && Array.isArray(result.questions)) {
                const studentQ = result.questions.find(sq => {
                  const sqText = (sq.question || sq.text || "").toString().trim();
                  return sqText === lessonQText;
                });

                if (studentQ) {
                  overallCompletedCount++;
                  const isCorrectResult = studentQ.isCorrect !== undefined ? studentQ.isCorrect : studentQ.correct;
                  if (isCorrectResult) {
                    overallCorrect++;
                  } else {
                    overallIncorrect++;
                  }

                  // Process individual options
                  if (Array.isArray(studentQ.userAnswer) && Array.isArray(studentQ.correctAnswer)) {
                    lessonQ.options.forEach((_, optIndex) => {
                      const userAns = studentQ.userAnswer[optIndex];
                      const correctAns = studentQ.correctAnswer[optIndex];

                      if (userAns !== null && userAns !== undefined) {
                        optionStats[optIndex].completed++;
                        let correctBool;
                        if (typeof correctAns === 'boolean') {
                          correctBool = correctAns;
                        } else if (typeof correctAns === 'string') {
                          correctBool = correctAns.toLowerCase() === 'true';
                        } else {
                          correctBool = Boolean(correctAns);
                        }

                        if (Boolean(userAns) === correctBool) {
                          optionStats[optIndex].correct++;
                        } else {
                          optionStats[optIndex].incorrect++;
                        }
                      }
                    });
                  }
                }
              }
            });

            // Calculate notCompleted for options
            optionStats.forEach(opt => {
              opt.notCompleted = Math.max(0, uniqueStudents - opt.completed);
            });

            questionStats.push({
              question: lessonQText || `Câu ${index + 1}`,
              type: lessonQ.type,
              options: lessonQ.options,
              optionStats: optionStats,
              totalStudents: uniqueStudents,
              completed: overallCompletedCount,
              notCompleted: Math.max(0, uniqueStudents - overallCompletedCount),
              correct: overallCorrect,
              incorrect: overallIncorrect
            });

          } else {
            let correct = 0;
            let incorrect = 0;
            let completedCount = 0;

            results?.forEach(result => {
              if (result.questions && Array.isArray(result.questions)) {
                const studentQ = result.questions.find(sq => {
                  const sqText = (sq.question || sq.text || "").toString().trim();
                  return sqText === lessonQText;
                });

                if (studentQ) {
                  completedCount++;
                  const isCorrectResult = studentQ.isCorrect !== undefined ? studentQ.isCorrect : studentQ.correct;
                  if (isCorrectResult) {
                    correct++;
                  } else {
                    incorrect++;
                  }
                }
              }
            });

            questionStats.push({
              question: lessonQText || `Câu ${index + 1}`,
              type: lessonQ.type,
              options: lessonQ.options,
              totalStudents: uniqueStudents,
              completed: completedCount,
              notCompleted: Math.max(0, uniqueStudents - completedCount),
              correct,
              incorrect
            });
          }
        });
      }

      return {
        success: true,
        lessonId,
        lessonTitle: lesson.title,
        totalAttempts,
        averageScore: Math.round(averageScore * 100) / 100,
        completionRate: totalAttempts > 0 && uniqueStudents > 0 ? Math.round((totalAttempts / uniqueStudents) * 100) : 0,
        averageTime: totalAttempts > 0 ?
          Math.round(results.reduce((sum, r) => sum + (r.time_taken || 0), 0) / totalAttempts) : 0,
        views: lesson.views || 0,
        lastUpdated: lesson.last_updated || lesson.lastUpdated,
        uniqueStudents,
        lowScores,
        highScores,
        scoreDistribution,
        topScorers,
        transcripts,
        questionStats
      };
    } catch (error) {
      console.error('Error getting detailed lesson statistics:', error);
      return {
        success: false,
        message: 'Failed to load lesson statistics',
        lessonId,
        totalAttempts: 0,
        averageScore: 0,
        completionRate: 0,
        averageTime: 0,
        views: 0,
        uniqueStudents: 0,
        lowScores: 0,
        highScores: 0,
        scoreDistribution: { labels: [], data: [] },
        topScorers: [],
        transcripts: [],
        questionStats: []
      };
    }
  }

  // Get students who answered a specific question incorrectly
  async getStudentsWhoGotQuestionWrong(lessonId, questionIndex, optionIndex) {
    try {
      // Get the lesson to get the question text
      const lesson = await this.getLessonById(lessonId, true);
      
      if (!lesson.questions || !lesson.questions[questionIndex]) {
        return {
          success: false,
          message: 'Question not found',
          students: []
        };
      }

      const questionData = lesson.questions[questionIndex];
      const questionText = (typeof questionData === 'string' ? questionData : (questionData.question || questionData.text || "")).toString().trim();

      // Get all results for this lesson with student info
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          student_id,
          questions,
          students ( full_name, date_of_birth )
        `)
        .eq('lesson_id', lessonId);

      if (error) throw error;

      const wrongStudents = [];

      results?.forEach(result => {
        if (result.questions && Array.isArray(result.questions)) {
          const studentQ = result.questions.find(sq => {
            const sqText = (sq.question || sq.text || "").toString().trim();
            return sqText === questionText;
          });

          if (studentQ) {
            if (optionIndex !== undefined && optionIndex !== null) {
              const userAnswers = Array.isArray(studentQ.userAnswer) ? studentQ.userAnswer : [];
              const correctAnswers = Array.isArray(studentQ.correctAnswer) ? studentQ.correctAnswer : [];
              const userAnswer = userAnswers[optionIndex];
              const correctAnswer = correctAnswers[optionIndex];

              if (userAnswer !== null && userAnswer !== undefined) {
                let correctBool;
                if (typeof correctAnswer === 'boolean') {
                  correctBool = correctAnswer;
                } else if (typeof correctAnswer === 'string') {
                  correctBool = correctAnswer.toLowerCase() === 'true';
                } else {
                  correctBool = Boolean(correctAnswer);
                }

                if (Boolean(userAnswer) !== correctBool) {
                  wrongStudents.push({
                    studentId: result.student_id,
                    name: result.students?.full_name || 'Unknown',
                    dob: result.students?.date_of_birth
                      ? new Date(result.students.date_of_birth).toLocaleDateString('vi-VN')
                      : 'N/A',
                    userAnswer: studentQ.userAnswer,
                    correctAnswer: studentQ.correctAnswer
                  });
                }
              }
            } else {
              const isCorrect = studentQ.isCorrect !== undefined ? studentQ.isCorrect : studentQ.correct;
              if (!isCorrect) {
                wrongStudents.push({
                  studentId: result.student_id,
                  name: result.students?.full_name || 'Unknown',
                  dob: result.students?.date_of_birth
                    ? new Date(result.students.date_of_birth).toLocaleDateString('vi-VN')
                    : 'N/A',
                  userAnswer: studentQ.userAnswer,
                  correctAnswer: studentQ.correctAnswer
                });
              }
            }
          }
        }
      });

      return {
        success: true,
        question: questionText,
        questionIndex,
        optionIndex,
        totalWrong: wrongStudents.length,
        students: wrongStudents
      };
    } catch (error) {
      console.error('Error getting students who got question wrong:', error);
      return {
        success: false,
        message: 'Failed to load students',
        students: []
      };
    }
  }

  // Get attempts for a specific student in a lesson (admin view)
  async getLessonStudentAttempts(lessonId, studentId) {
    try {
      const { data: results, error } = await supabase
        .from('results')
        .select(`
          id,
          timestamp,
          score,
          total_points,
          time_taken,
          students ( full_name, date_of_birth )
        `)
        .eq('lesson_id', lessonId)
        .eq('student_id', studentId)
        .order('timestamp', { ascending: false });

      if (error) throw error;

      const attempts = (results || []).map((result, index) => {
        const scorePercentage = result.total_points > 0
          ? Math.round((result.score / result.total_points) * 100)
          : 0;

        return {
          id: result.id,
          attemptNumber: (results.length - index),
          timestamp: result.timestamp,
          score: result.score,
          totalPoints: result.total_points,
          scorePercentage,
          timeTaken: result.time_taken || 0,
          studentName: result.students?.full_name || 'Unknown',
          studentDob: result.students?.date_of_birth
            ? new Date(result.students.date_of_birth).toLocaleDateString('vi-VN')
            : ''
        };
      });

      return {
        success: true,
        lessonId,
        studentId,
        attempts
      };
    } catch (error) {
      console.error('Error getting lesson student attempts:', error);
      return {
        success: false,
        message: 'Failed to load student attempts',
        lessonId,
        studentId,
        attempts: []
      };
    }
  }
}

module.exports = new DatabaseService();
