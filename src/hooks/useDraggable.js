// useDraggable — returns drag state and style for a freely movable panel.

import { useState, useRef, useCallback, useEffect } from 'react'

export function useDraggable(initialPosition) {
  const [position, setPosition] = useState(
    initialPosition
      ? { x: initialPosition.x, y: initialPosition.y }
      : { x: 20, y: 80 }
  )
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef(null)
  const positionRef = useRef(position)

  useEffect(() => {
    positionRef.current = position
  }, [position])

  const onMouseDown = useCallback((e) => {
    if (e.target.closest('.panel-content')) return
    if (e.target.closest('button')) return
    if (e.target.closest('input')) return
    if (e.target.closest('textarea')) return

    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panelX: positionRef.current.x,
      panelY: positionRef.current.y,
    }
  }, [])

  useEffect(() => {
    if (!isDragging) return

    function onMouseMove(e) {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      const newX = dragStartRef.current.panelX + dx
      const newY = dragStartRef.current.panelY + dy
      const clampedX = Math.max(0, Math.min(newX, window.innerWidth - 100))
      const clampedY = Math.max(0, Math.min(newY, window.innerHeight - 60))
      setPosition({ x: clampedX, y: clampedY })
    }

    function onMouseUp() {
      setIsDragging(false)
      dragStartRef.current = null
      const key = initialPosition?.storageKey
      if (key) {
        localStorage.setItem(key, JSON.stringify(positionRef.current))
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [isDragging]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const key = initialPosition?.storageKey
    if (key) {
      const saved = localStorage.getItem(key)
      if (saved) {
        try { setPosition(JSON.parse(saved)) } catch (e) {}
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    position,
    isDragging,
    onMouseDown,
    dragStyle: {
      position: 'fixed',
      left: position.x + 'px',
      top: position.y + 'px',
      cursor: isDragging ? 'grabbing' : 'default',
      zIndex: isDragging ? 1000 : 10,
      userSelect: 'none',
    },
  }
}
