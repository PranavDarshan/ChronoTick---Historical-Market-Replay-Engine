import { useEffect, useRef, useState } from "react"
import {
  createChart,
  CandlestickSeries,
  type IChartApi,
  type CandlestickData,
  type Time,
} from "lightweight-charts"

import { TopBar } from "../components/TopBar"
import { useReplaySocket } from "../hooks/useReplaySocket"
import { useReplayStore } from "../store/replayStore"

export default function Dashboard() {
  /* ======================
     UI STATE
  ====================== */
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbol, setSymbol] = useState("")
  const [start, setStart] = useState("2015-01-09T09:15")
  const [end, setEnd] = useState("2015-01-14T15:30")
  const [timeScale, setTimeScale] = useState(6000)
  const [gapScale, setGapScale] = useState(100000)
  const [playing, setPlaying] = useState(false)

  /* ======================
     CHART REFS
  ====================== */
  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const initializedRef = useRef(false)

  /* ======================
     STORE
  ====================== */
  const candles = useReplayStore((s) => s.candles)
  const resetStore = useReplayStore((s) => s.reset)

  /* ======================
     FETCH SYMBOLS (ONCE)
  ====================== */
  useEffect(() => {
    fetch("http://127.0.0.1:8000/symbols")
      .then((r) => r.json())
      .then((d) => {
        if (d.symbols?.length) {
          setSymbols(d.symbols)
          setSymbol(d.symbols[0])
        }
      })
      .catch(console.error)
  }, [])

  /* ======================
     SOCKET
  ====================== */
  useReplaySocket({
    symbol,
    start,
    end,
    timeScale,
    gapScale,
    playing: playing,
  })

  /* ======================
     CHART INIT (ONCE)
  ====================== */
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#020617" },
        textColor: "#e5e7eb",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
      autoSize: true,
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
      borderVisible: false,
    })

    chartRef.current = chart
    seriesRef.current = series
  }, [])

  /* ======================
     DATA → CHART (CORRECT)
  ====================== */
  useEffect(() => {
    if (!seriesRef.current) return
    if (candles.length === 0) return

    if (!initializedRef.current) {
      console.log("[Chart] Initial load", candles.length)

      seriesRef.current.setData(candles as CandlestickData<Time>[])
      chartRef.current?.timeScale().fitContent()

      initializedRef.current = true
    } else {
      const last = candles[candles.length - 1]
      seriesRef.current.update(last as CandlestickData<Time>)
    }
  }, [candles])

  /* ======================
     PLAY / PAUSE HANDLERS
  ====================== */
  const handlePlay = () => {
    console.log("[UI] Play")

    // 🔥 HARD RESET
    setPlaying(false)
    resetStore()
    initializedRef.current = false
    seriesRef.current?.setData([])

    // Allow state flush
    setTimeout(() => setPlaying(true), 0)
  }

  const handlePause = () => {
    console.log("[UI] Pause")
    setPlaying(false)
  }

  /* ======================
     UI
  ====================== */
  return (
    <div
      style={{
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "#020617",
      }}
    >
      <TopBar
        symbols={symbols}
        symbol={symbol}
        setSymbol={setSymbol}
        start={start}
        setStart={setStart}
        end={end}
        setEnd={setEnd}
        timeScale={timeScale}
        setTimeScale={setTimeScale}
        gapScale={gapScale}
        setGapScale={setGapScale}
        playing={playing}
        onPlay={handlePlay}
        onPause={handlePause}
      />

      <div ref={containerRef} style={{ flex: 1 }} />
    </div>
  )
}
