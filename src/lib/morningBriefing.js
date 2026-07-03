// morningBriefing.js — fetches weather, calendar, todos, and emails for the daily briefing.

function formatHourlyTime(time) {
  if (time === '0' || time === '000') return '12am';
  if (time === '1200') return '12pm';
  const num = parseInt(time, 10) / 100;
  return num > 12 ? (num - 12) + 'pm' : num + 'am';
}

async function getWeather(city) {
  const location = city || 'Maharagama,Sri Lanka';
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;

  try {
    const res = await fetch(url, {
      signal:  AbortSignal.timeout(8000),
      headers: { 'Accept': 'application/json', 'User-Agent': 'Taski/1.0' },
    });

    // wttr.in occasionally returns an HTML error page instead of JSON (bad city, rate limit, etc).
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('json') && !contentType.includes('text')) {
      throw new Error('Unexpected response content-type: ' + contentType);
    }

    const text = await res.text();
    if (text.trim().startsWith('<')) {
      throw new Error('Got HTML instead of JSON');
    }

    const data    = JSON.parse(text);
    const current = data.current_condition[0];
    const today   = data.weather[0];

    return {
      temp:          current.temp_C + '°C',
      feelsLike:     current.FeelsLikeC + '°C',
      description:   current.weatherDesc[0].value,
      humidity:      current.humidity + '%',
      maxTemp:       today.maxtempC + '°C',
      minTemp:       today.mintempC + '°C',
      chanceOfRain:  today.hourly
        .map((h) => parseInt(h.chanceofrain, 10))
        .reduce((a, b) => Math.max(a, b), 0),
      hourly: today.hourly.slice(0, 4).map((h) => ({
        time: formatHourlyTime(h.time),
        temp: h.tempC + '°C',
        desc: h.weatherDesc[0].value,
        rain: h.chanceofrain + '%',
      })),
    };
  } catch (e) {
    console.warn('[Briefing] Weather failed:', e.message);
    return null;
  }
}

async function getTodayCalendarEvents() {
  try {
    const calModule = await import('./googleCalendar.js');

    // Prefer the local-timezone-safe helper; fall back to the raw date-string API.
    if (calModule.getTodayEvents) {
      return await calModule.getTodayEvents();
    }
    if (calModule.getCalendarEvents) {
      const today = new Date().toISOString().split('T')[0];
      return await calModule.getCalendarEvents(today);
    }
    return [];
  } catch (e) {
    console.warn('[Briefing] Calendar:', e.message);
    return [];
  }
}

function getTodayTodos() {
  try {
    const today    = new Date().toISOString().split('T')[0];
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

    if (window.taskiAPI?.quickTodosLoad) {
      // Electron IPC path — return a promise; caller uses Promise.allSettled
      return window.taskiAPI.quickTodosLoad().then((todos) =>
        (todos || []).filter((t) =>
          !t.done && (t.dueDate === today || t.dueDate === tomorrow || t.dueDate === 'tomorrow')
        )
      );
    }

    const saved = localStorage.getItem('taski-quicktodos');
    const todos  = saved ? JSON.parse(saved) : [];
    return todos.filter(
      (t) => !t.done && (t.dueDate === today || t.dueDate === tomorrow || t.dueDate === 'tomorrow')
    );
  } catch {
    return [];
  }
}

async function getImportantEmails() {
  try {
    const { searchEmails } = await import('./gmail.js');

    const importantQuery =
      'subject:(payment OR invoice OR receipt OR subscription OR renewal OR expired OR urgent OR "action required") newer_than:1d';
    const unreadQuery = 'is:unread newer_than:1d';

    const [important, unread] = await Promise.allSettled([
      searchEmails(importantQuery, 3),
      searchEmails(unreadQuery, 10),
    ]);

    return {
      important:   important.status === 'fulfilled' ? (important.value || []) : [],
      unreadCount: unread.status   === 'fulfilled' ? (unread.value || []).length : 0,
    };
  } catch (e) {
    console.warn('[Briefing] Email fetch failed:', e.message);
    return { important: [], unreadCount: 0 };
  }
}

export async function getMorningBriefing(options = {}) {
  const city = options.city || 'Maharagama, Sri Lanka';
  const tz   = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now  = new Date();
  console.log('[TASKI] Starting morning briefing fetch...');

  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

  // Fetch everything in parallel — a slow/failing source never blocks the others.
  const [weatherResult, calendarResult, emailResult] = await Promise.allSettled([
    getWeather(city),
    getTodayCalendarEvents(),
    getImportantEmails(),
  ]);

  // getTodayTodos may return a promise (Electron) or a plain array
  let todos = [];
  try {
    todos = await Promise.resolve(getTodayTodos());
  } catch {
    todos = [];
  }

  const weather = weatherResult.status  === 'fulfilled' ? weatherResult.value : null;
  const events  = calendarResult.status === 'fulfilled' ? (calendarResult.value || []) : [];
  const emails  = emailResult.status    === 'fulfilled' ? emailResult.value : { important: [], unreadCount: 0 };

  // Build a clean, concise context string — too much raw data causes Claude to truncate.
  const sections = [];
  sections.push(`DATE: ${dateStr}, ${timeStr}`);
  sections.push(`LOCATION: ${city}`);

  if (weather) {
    const rainNote = weather.chanceOfRain > 40 ? ' — BRING UMBRELLA' : '';
    sections.push(
      `WEATHER: ${weather.temp} (feels ${weather.feelsLike}), ${weather.description}, ` +
      `High ${weather.maxTemp} / Low ${weather.minTemp}, Humidity ${weather.humidity}${rainNote}`
    );
  } else {
    sections.push('WEATHER: Unavailable');
  }

  if (events.length > 0) {
    sections.push('CALENDAR TODAY:');
    events.slice(0, 5).forEach((e) => {
      const title = e.title || e.summary || 'Untitled';
      const start = e.start && !e.allDay
        ? new Date(e.start).toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
        : 'All day';
      sections.push(`  • ${title} at ${start}`);
    });
  } else {
    sections.push('CALENDAR: No events today');
  }

  const pendingTodos = todos.filter((t) => !t.done);
  if (pendingTodos.length > 0) {
    sections.push('PENDING TASKS:');
    pendingTodos.slice(0, 5).forEach((t) => {
      sections.push(`  • [${(t.priority || 'med').toUpperCase()}] ${t.title}`);
    });
  } else {
    sections.push('TASKS: Nothing pending');
  }

  if (emails.unreadCount > 0) {
    sections.push(`INBOX: ${emails.unreadCount} unread`);
  }
  if (emails.important?.length > 0) {
    sections.push('IMPORTANT EMAILS:');
    emails.important.slice(0, 3).forEach((e) => {
      sections.push(`  • ${e.subject} — from ${e.from}`);
    });
  }

  const dataContext = sections.join('\n');

  const context =
    `Generate a concise morning briefing using this data:\n\n${dataContext}\n\n` +
    `Format:\n` +
    `1. Warm greeting (morning/afternoon)\n` +
    `2. Weather in 1-2 sentences with practical advice if needed\n` +
    `3. Calendar events (if any)\n` +
    `4. Top priority tasks (if any)\n` +
    `5. Email flag (if important emails)\n` +
    `6. One line motivational close\n\n` +
    `Use markdown: ## for sections, bullet points for lists. Keep it under 250 words. Be warm and friendly.`;

  return { context, rawData: { weather, events, todos, emails } };
}
