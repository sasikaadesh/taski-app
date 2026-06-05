// useSpeechRecognition — MediaRecorder-based voice capture with Whisper (primary) and Claude (fallback) transcription.

import { useState, useRef, useCallback, useEffect } from 'react'

export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const [isSupported, setIsSupported] = useState(false)
  const [error, setError] = useState(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const streamRef = useRef(null)
  const maxTimerRef = useRef(null)

  useEffect(() => {
    const supported = !!(
      navigator.mediaDevices?.getUserMedia &&
      window.MediaRecorder
    )
    setIsSupported(supported)
    console.log('[Taski Voice] Ready. Supported:', supported)
  }, [])

  useEffect(() => {
    return () => stopAll()
  }, [])

  function stopAll() {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      try { mediaRecorderRef.current.stop() } catch (e) {}
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }

  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = reader.result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  async function transcribeWithWhisper(blob) {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY
    if (!apiKey) return null

    console.log('[Taski Voice] Using Whisper...')

    const formData = new FormData()
    formData.append('file', blob, 'audio.webm')
    formData.append('model', 'whisper-1')
    formData.append('language', 'en')
    formData.append('response_format', 'text')

    const res = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey },
        body: formData
      }
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      console.error('[Taski Voice] Whisper error:', err)
      return null
    }

    const text = await res.text()
    return text?.trim() || ''
  }

  async function transcribeWithClaude(blob) {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
    if (!apiKey) return null

    console.log('[Taski Voice] Using Claude...')

    try {
      const base64 = await blobToBase64(blob)
      const mimeType = blob.type || 'audio/webm'

      const res = await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 500,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'audio',
                  source: {
                    type: 'base64',
                    media_type: mimeType,
                    data: base64
                  }
                },
                {
                  type: 'text',
                  text: 'Transcribe this audio exactly. Return ONLY the spoken words. If nothing was spoken return: EMPTY'
                }
              ]
            }]
          })
        }
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        console.warn('[Taski Voice] Claude audio error:', err.error?.message)
        return null
      }

      const data = await res.json()
      const text = data.content?.[0]?.text?.trim()
      if (!text || text === 'EMPTY') return ''
      return text

    } catch (e) {
      console.warn('[Taski Voice] Claude failed:', e.message)
      return null
    }
  }

  async function transcribe(blob) {
    console.log('[Taski Voice] Audio:', Math.round(blob.size / 1024) + 'KB', blob.type)

    const whisperResult = await transcribeWithWhisper(blob).catch(() => null)
    if (whisperResult !== null) {
      console.log('[Taski Voice] Whisper result:', whisperResult)
      return whisperResult
    }

    const claudeResult = await transcribeWithClaude(blob).catch(() => null)
    if (claudeResult !== null) {
      console.log('[Taski Voice] Claude result:', claudeResult)
      return claudeResult
    }

    throw new Error(
      'Transcription unavailable. ' +
      'Add VITE_OPENAI_API_KEY to .env for reliable voice input.'
    )
  }

  const startListening = useCallback(async () => {
    if (isListening || isProcessing) return

    setError(null)
    setTranscript('')
    setInterimTranscript('')
    audioChunksRef.current = []

    try {
      console.log('[Taski Voice] Requesting mic...')

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      streamRef.current = stream
      console.log('[Taski Voice] Mic granted')

      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
        ''
      ].find(t => !t || MediaRecorder.isTypeSupported(t)) || ''

      console.log('[Taski Voice] Format:', mimeType || 'default')

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : {}
      )

      recorder.ondataavailable = (e) => {
        if (e.data?.size > 0) {
          audioChunksRef.current.push(e.data)
        }
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())

        const chunks = [...audioChunksRef.current]
        audioChunksRef.current = []

        if (chunks.length === 0) {
          setIsListening(false)
          setIsProcessing(false)
          return
        }

        setIsListening(false)
        setIsProcessing(true)
        setInterimTranscript('Transcribing...')

        try {
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' })
          const text = await transcribe(blob)
          setInterimTranscript('')

          if (text && text.length > 0) {
            setTranscript(text)
          } else {
            setError('No speech detected. Please speak clearly and try again.')
            setTimeout(() => setError(null), 3000)
          }
        } catch (err) {
          console.error('[Taski Voice]', err.message)
          setInterimTranscript('')
          setError(err.message || 'Transcription failed. Try again.')
          setTimeout(() => setError(null), 5000)
        } finally {
          setIsProcessing(false)
        }
      }

      recorder.onerror = (e) => {
        console.error('[Taski Voice] Recorder:', e)
        setIsListening(false)
        setIsProcessing(false)
        setError('Recording error. Please retry.')
        setTimeout(() => setError(null), 3000)
        stopAll()
      }

      mediaRecorderRef.current = recorder
      recorder.start(250)
      setIsListening(true)
      console.log('[Taski Voice] Recording...')

      maxTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 15000)

    } catch (err) {
      console.error('[Taski Voice]', err.name, err.message)
      setIsListening(false)
      setIsProcessing(false)

      switch (err.name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setError('Microphone blocked. Allow microphone access in Electron settings.')
          break
        case 'NotFoundError':
          setError('No microphone detected.')
          break
        case 'NotReadableError':
          setError('Microphone busy. Close other apps.')
          break
        default:
          setError('Microphone error: ' + err.message)
      }
      setTimeout(() => setError(null), 5000)
    }
  }, [isListening, isProcessing])

  const stopListening = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current)
      maxTimerRef.current = null
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    } else {
      setIsListening(false)
    }
  }, [])

  const resetTranscript = useCallback(() => {
    setTranscript('')
    setInterimTranscript('')
  }, [])

  return {
    isListening,
    transcript,
    interimTranscript,
    isSupported,
    error,
    isProcessing,
    isTranscribing: isProcessing,
    startListening,
    stopListening,
    resetTranscript
  }
}
