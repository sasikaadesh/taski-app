// LocationGadget — futuristic location display using browser Geolocation + Nominatim reverse geocoding.

import { useState, useEffect, useRef } from 'react';

// ── Radar ping SVG icon ───────────────────────────────────────────────────────

function RadarPin() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0, marginTop: '2px' }}
    >
      {/* Center dot */}
      <circle cx="11" cy="11" r="3" fill="#00d4ff" opacity="0.9" />
      {/* Ping ring 1 */}
      <circle
        cx="11" cy="11" r="6"
        stroke="#00d4ff" strokeWidth="1.2" fill="none"
        opacity="0.6"
        style={{
          transformBox:    'fill-box',
          transformOrigin: 'center',
          animation:       'radarPing 2s ease-out 0s infinite',
        }}
      />
      {/* Ping ring 2 — delayed */}
      <circle
        cx="11" cy="11" r="6"
        stroke="#00d4ff" strokeWidth="1" fill="none"
        opacity="0.35"
        style={{
          transformBox:    'fill-box',
          transformOrigin: 'center',
          animation:       'radarPing 2s ease-out 0.8s infinite',
        }}
      />
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LocationGadget() {
  const [status,   setStatus]   = useState('loading'); // 'loading'|'success'|'denied'|'error'
  const [location, setLocation] = useState(null);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;

    if (!navigator.geolocation) {
      setStatus('error');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res  = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`,
            { headers: { 'Accept-Language': 'en', 'User-Agent': 'taski-app/1.0' } }
          );
          const data = await res.json();
          const addr = data.address ?? {};

          const city        = (addr.city ?? addr.town ?? addr.village ?? addr.suburb ?? 'UNKNOWN').toUpperCase();
          const country     = (addr.country        ?? 'UNKNOWN').toUpperCase();
          const countryCode = (addr.country_code   ?? '').toUpperCase();

          const latDir = latitude  >= 0 ? 'N' : 'S';
          const lonDir = longitude >= 0 ? 'E' : 'W';
          const latStr = `${Math.abs(latitude).toFixed(4)}° ${latDir}`;
          const lonStr = `${Math.abs(longitude).toFixed(4)}° ${lonDir}`;

          setLocation({ city, country, countryCode, lat: latStr, lon: lonStr });
          setStatus('success');
        } catch {
          setStatus('error');
        }
      },
      (err) => {
        setStatus(err.code === 1 ? 'denied' : 'error');
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  return (
    <div style={{ textAlign: 'center', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

      {/* Loading */}
      {status === 'loading' && (
        <span
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '12px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color:         'var(--color-text-dim)',
            animation:     'recordPulse 1.2s ease-in-out infinite',
          }}
        >
          LOCATING…
        </span>
      )}

      {/* Denied / Error */}
      {(status === 'denied' || status === 'error') && (
        <span
          style={{
            fontFamily:    "'Rajdhani', sans-serif",
            fontSize:      '12px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color:         'var(--color-text-dim)',
          }}
        >
          LOCATION UNAVAILABLE
        </span>
      )}

      {/* Success */}
      {status === 'success' && location && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
          <RadarPin />
          <div style={{ textAlign: 'left' }}>
            {/* City, Country Code */}
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '16px',
                fontWeight:    600,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--color-text-primary)',
                lineHeight:    1.2,
              }}
            >
              {location.city}, {location.countryCode}
            </div>
            {/* Full country */}
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '12px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color:         'var(--color-text-secondary)',
                marginTop:     '2px',
              }}
            >
              {location.country}
            </div>
            {/* Coordinates */}
            <div
              style={{
                fontFamily:    "'Rajdhani', sans-serif",
                fontSize:      '11px',
                letterSpacing: '0.05em',
                color:         'var(--color-text-dim)',
                marginTop:     '4px',
              }}
            >
              {location.lat}&nbsp;&nbsp;{location.lon}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
