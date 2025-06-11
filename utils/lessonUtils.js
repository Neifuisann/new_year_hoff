const { supabase } = require('./supabaseClient');

async function incrementViewCount(lessonId, currentViews) {
  try {
    const { error } = await supabase
      .from('lessons')
      .update({ views: currentViews + 1 })
      .eq('id', lessonId);
    if (error) throw error;
  } catch (error) {
    console.warn('Error incrementing view count:', error);
  }
}

module.exports = { incrementViewCount };
