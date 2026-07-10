// useAmbientPlaying — live ambient playback state derived from the ambientSound singleton.

import { useState, useEffect } from 'react';
import { isAmbientPlaying } from '../lib/ambientSound';

export function useAmbientPlaying() {
  const [playing, setPlaying] = useState(isAmbientPlaying);

  useEffect(() => {
    function onChange(e) { setPlaying(e.detail.playing); }
    window.addEventListener('taski-ambient-changed', onChange);
    // Re-read on subscribe in case state moved between first render and this effect
    setPlaying(isAmbientPlaying());
    return () => window.removeEventListener('taski-ambient-changed', onChange);
  }, []);

  return playing;
}
