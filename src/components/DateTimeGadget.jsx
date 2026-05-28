// DateTimeGadget — futuristic live clock + date + timezone display for the CENTER ZONE.

import { useState, useEffect } from 'react';

function padZ(n) {
  return String(n).padStart(2, '0');
}

function formatTime(d) {
  return `${padZ(d.getHours())}:${padZ(d.getMinutes())}:${padZ(d.getSeconds())}`;
}

function formatDate(d) {
  const DAY = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
  const MON = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${DAY[d.getDay()]} — ${padZ(d.getDate())} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

function getTimezoneLabel() {
  const tz     = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset();          // minutes
  const sign   = offset >= 0 ? '+' : '-';
  const abs    = Math.abs(offset);
  const hh     = Math.floor(abs / 60);
  const mm     = abs % 60;
  return `GMT${sign}${padZ(hh)}:${padZ(mm)} — ${tz.toUpperCase()}`;
}

export default function DateTimeGadget() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>

      {/* Top dashed divider */}
      <div
        aria-hidden="true"
        style={{
          width:        '80%',
          margin:       '0 auto 20px',
          borderTop:    '1px dashed rgba(0,212,255,0.2)',
        }}
      />

      {/* Time display with scanline */}
      <div style={{ position: 'relative', overflow: 'hidden', display: 'inline-block' }}>
        <div
          style={{
            fontFamily:    "'Orbitron', sans-serif",
            fontSize:      '48px',
            fontWeight:    700,
            letterSpacing: '0.05em',
            lineHeight:    1,
            color:         '#00d4ff',
            textShadow:    '0 0 20px rgba(0,212,255,0.8)',
          }}
        >
          {formatTime(now)}
        </div>

        {/* CRT scanline sweep */}
        <div
          aria-hidden="true"
          style={{
            position:      'absolute',
            top:           0,
            left:          0,
            right:         0,
            height:        '3px',
            background:    'rgba(0,212,255,0.4)',
            opacity:       0.06,
            animation:     'scanSweep 3s linear infinite',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* Date */}
      <div
        style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '14px',
          fontWeight:    500,
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          color:         'var(--color-text-secondary)',
          marginTop:     '10px',
        }}
      >
        {formatDate(now)}
      </div>

      {/* Timezone */}
      <div
        style={{
          fontFamily:    "'Rajdhani', sans-serif",
          fontSize:      '12px',
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color:         'var(--color-text-dim)',
          marginTop:     '4px',
        }}
      >
        {getTimezoneLabel()}
      </div>

      {/* Bottom dashed divider */}
      <div
        aria-hidden="true"
        style={{
          width:      '80%',
          margin:     '20px auto 0',
          borderTop:  '1px dashed rgba(0,212,255,0.2)',
        }}
      />
    </div>
  );
}
