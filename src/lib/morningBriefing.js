// morningBriefing.js — fetches weather, calendar, todos, and emails for the daily briefing.

async function getWeather(city) {
  const location = city || 'Maharagama,Sri Lanka';
  const url = `https://wttr.in/${encodeURIComponent(location)}?format=j1`;

  try {
    const res  = await fetch(url);
    const data = await res.json();

    const current = data.current_condition[0];
    const today   = data.weather[0];

    return {
      temp:        current.temp_C + '°C',
      feels:       current.FeelsLikeC + '°C',
      description: current.weatherDesc[0].value,
      humidity:    current.humidity + '%',
      maxTemp:     today.maxtempC + '°C',
      minTemp:     today.mintempC + '°C',
      hourly:      today.hourly.map((h) => ({
        time:          h.time === '0' ? '12am' : h.time === '1200' ? '12pm' : parseInt(h.time) / 100 + ':00',
        temp:          h.tempC + '°C',
        desc:          h.weatherDesc[0].value,
        chanceOfRain:  h.chanceofrain + '%',
      })).slice(0, 4),
    };
  } catch (e) {
    console.warn('Weather fetch failed:', e);
    return null;
  }
}

async function getTodayCalendarEvents() {
  try {
    const { getCalendarEvents } = await import('./googleCalendar.js');
    const today = new Date().toISOString().split('T')[0];
    return await getCalendarEvents(today);
  } catch (e) {
    console.warn('Calendar fetch failed:', e);
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
  } catch (e) {
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
    console.warn('Email fetch failed:', e);
    return { important: [], unreadCount: 0 };
  }
}

export async function getMorningBriefing(options = {}) {
  const city = options.city || 'Maharagama, Sri Lanka';
  console.log('[TASKI] Starting morning briefing fetch...');

  const [weatherResult, calendarResult, emailsResult] = await Promise.allSettled([
    getWeather(city),
    getTodayCalendarEvents(),
    getImportantEmails(),
  ]);

  // getTodayTodos may return a promise (Electron) or a plain array
  let todos = [];
  try {
    todos = await Promise.resolve(getTodayTodos());
  } catch (e) {
    todos = [];
  }

  const weatherData = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const events      = calendarResult.status === 'fulfilled' ? (calendarResult.value || []) : [];
  const emailData   = emailsResult.status  === 'fulfilled'
    ? emailsResult.value
    : { important: [], unreadCount: 0 };

  const tz      = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now     = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  let context =
    `Generate a concise friendly morning briefing for the user.\n\n` +
    `Date: ${dateStr}\nTime: ${timeStr}\nLocation: ${city}\n\n`;

  if (weatherData) {
    context +=
      `WEATHER TODAY:\n` +
      `Current: ${weatherData.temp} (feels like ${weatherData.feels})\n` +
      `Condition: ${weatherData.description}\n` +
      `High: ${weatherData.maxTemp} Low: ${weatherData.minTemp}\n` +
      `Humidity: ${weatherData.humidity}\n`;

    if (weatherData.hourly?.length) {
      context += `Hourly forecast:\n`;
      weatherData.hourly.forEach((h) => {
        context +=
          `  ${h.time}: ${h.temp} - ${h.desc}` +
          (h.chanceOfRain !== '0%' ? ` (rain: ${h.chanceOfRain})` : '') +
          '\n';
      });
    }
    context += '\n';
  } else {
    context += `WEATHER: Could not fetch weather.\n\n`;
  }

  if (events.length > 0) {
    context += `CALENDAR EVENTS TODAY:\n`;
    events.forEach((e) => {
      const title = e.title || e.summary || 'Untitled';
      let startStr = 'All day';
      if (e.start && e.start.includes('T')) {
        try {
          startStr = new Date(e.start).toLocaleTimeString('en-US', {
            timeZone: tz, hour: '2-digit', minute: '2-digit',
          });
        } catch { /* keep All day */ }
      }
      context += `- ${title} at ${startStr}`;
      if (e.location) context += ` @ ${e.location}`;
      context += '\n';
    });
    context += '\n';
  } else {
    context += `CALENDAR: No events scheduled today.\n\n`;
  }

  if (todos.length > 0) {
    context += `PENDING TASKS:\n`;
    todos.forEach((t) => {
      context += `- [${(t.priority || 'normal').toUpperCase()}] ${t.title}`;
      if (t.dueTime) context += ` at ${t.dueTime}`;
      context += '\n';
    });
    context += '\n';
  } else {
    context += `TASKS: No pending tasks.\n\n`;
  }

  if (emailData.unreadCount > 0) {
    context += `INBOX: ${emailData.unreadCount} unread emails.\n`;
  }
  if (emailData.important?.length > 0) {
    context += `IMPORTANT EMAILS:\n`;
    emailData.important.forEach((e) => {
      context += `- From: ${e.from}\n  Subject: ${e.subject}\n`;
    });
    context += '\n';
  }

  context +=
    `\nBRIEFING INSTRUCTIONS:\n` +
    `1. Start with a warm greeting using the time of day (Good morning/afternoon)\n` +
    `2. Give weather summary with practical advice (bring umbrella if rain likely, dress warm if cold etc)\n` +
    `3. List today's calendar events clearly\n` +
    `4. Mention priority tasks\n` +
    `5. Flag any important emails that need attention (payments, renewals etc)\n` +
    `6. End with a brief motivational note\n` +
    `Keep it concise, friendly and practical.\n` +
    `Use markdown for nice formatting.\n` +
    `Add relevant emojis for each section.`;

  return { context, weatherData, events, todos, emailData };
}
