import { useEffect, useRef, useCallback, useState } from "react"
import { useReplayStore } from "../store/replayStore"
import type { WSMessage, Candle } from "../types/market"
import type { UTCTimestamp } from "lightweight-charts"

type Params = {
  symbol: string
  start: string
  end: string
  timeScale: number
  gapScale: number
  playing: boolean
  enabled: boolean // NEW: only connect if enabled
}

export function useReplaySocket(params: Params) {
  const addCandle = useReplayStore((s) => s.addCandle)
  const setInitialCandles = useReplayStore((s) => s.setInitialCandles)
  const addSessionMarker = useReplayStore((s) => s.addSessionMarker)
  const reset = useReplayStore((s) => s.reset)

  const wsRef = useRef<WebSocket | null>(null)
  const startedRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)

  /* ======================
     CLOSE SOCKET FUNCTION
  ====================== */
  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      console.log("[WS] Manually closing socket")
      wsRef.current.close()
      wsRef.current = null
    }
    reset()
    startedRef.current = false
    setIsConnected(false)
  }, [reset])

  /* ======================
     OPEN SOCKET (RE-CONNECT ON SYMBOL/DATE CHANGE)
  ====================== */
  useEffect(() => {
    if (!params.symbol || !params.enabled) {
      // If disabled, close any existing connection
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
        setIsConnected(false)
      }
      return
    }

    console.log("[WS] Opening replay socket for", params.symbol)

    // Close existing connection if any
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    reset()
    startedRef.current = false
    setIsConnected(false)

    const ws = new WebSocket(
      "ws://127.0.0.1:8000/ws/replay" +
        `?symbol=${encodeURIComponent(params.symbol)}` +
        `&start=${encodeURIComponent(params.start)}` +
        `&end=${encodeURIComponent(params.end)}` +
        `&realtime=false` +
        `&time_scale=${params.timeScale}` +
        `&gap_scale=${params.gapScale}`
    )

    wsRef.current = ws

    ws.onopen = () => {
      console.log("[WS] Connected")
      setIsConnected(true)
    }

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data)

      if (msg.event === "session_gap" && msg.to) {
        const t = Math.floor(
          new Date(msg.to + "Z").getTime() / 1000
        ) as UTCTimestamp
        addSessionMarker(t)
        return
      }

      if (msg.event !== "tick" || !msg.real_candle || !msg.timestamp) return

      const time = Math.floor(
        new Date(msg.timestamp + "Z").getTime() / 1000
      ) as UTCTimestamp

      const candle: Candle = {
        time,
        open: msg.real_candle.open,
        high: msg.real_candle.high,
        low: msg.real_candle.low,
        close: msg.real_candle.close,
        volume: msg.real_candle.volume,
      }

      if (!startedRef.current) {
        setInitialCandles([candle])
        startedRef.current = true
      } else {
        addCandle(candle)
      }
    }

    ws.onclose = () => {
      console.log("[WS] closed")
      wsRef.current = null
      setIsConnected(false)
    }

    ws.onerror = () => {
      console.log("[WS] error")
      setIsConnected(false)
    }

    return () => {
      console.log("[WS] cleanup")
      ws.close()
    }
  }, [params.symbol, params.start, params.end, params.timeScale, params.gapScale, params.enabled, reset, setInitialCandles, addCandle, addSessionMarker])

  /* ======================
     PLAY / PAUSE COMMANDS
  ====================== */
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return

    ws.send(
      JSON.stringify({
        command: params.playing ? "play" : "pause",
      })
    )
  }, [params.playing])

  return { closeSocket, isConnected }
}