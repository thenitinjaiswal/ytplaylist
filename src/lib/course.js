export function computeCourseStats(lessons, progress) {
  const byLesson = new Map(progress.map((p) => [p.lesson_id, p]));
  let completed = 0;
  let inProgress = 0;
  let watchedSeconds = 0;
  let totalSeconds = 0;
  for (const lesson of lessons) {
    totalSeconds += lesson.duration_seconds;
    const p = byLesson.get(lesson.id);
    if (p?.completed) {
      completed += 1;
      watchedSeconds += lesson.duration_seconds;
    } else if (p && p.watched_seconds > 0) {
      inProgress += 1;
      watchedSeconds += Math.min(p.watched_seconds, lesson.duration_seconds);
    }
  }
  const total = lessons.length;
  return {
    total,
    completed,
    inProgress,
    notStarted: Math.max(0, total - completed - inProgress),
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    totalSeconds,
    watchedSeconds,
    remainingSeconds: Math.max(0, totalSeconds - watchedSeconds),
  };
}
export function estimatedCompletionDate(remainingSeconds, dailyMinutes, speed = 1) {
  if (dailyMinutes <= 0 || remainingSeconds <= 0) return null;
  const days = Math.ceil(remainingSeconds / speed / (dailyMinutes * 60));
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}
export function computeStreak(days) {
  const set = new Set(days);
  const today = new Date();
  let current = 0;
  const cursor = new Date(today);
  // allow the streak to still count if today has no activity yet
  if (!set.has(cursor.toISOString().slice(0, 10))) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(cursor.toISOString().slice(0, 10))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = null;
  for (const key of sorted) {
    const date = new Date(`${key}T00:00:00Z`);
    if (prev && (date.getTime() - prev.getTime()) / 86400000 === 1) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = date;
  }
  return { current, longest: Math.max(longest, current) };
}
