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
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbol, setSymbol] = useState("")
  const [start, setStart] = useState("2015-01-09T09:15")
  const [end, setEnd] = useState("2015-01-14T15:30")
  const [timeScale, setTimeScale] = useState(6000)
  const [gapScale, setGapScale] = useState(100000)
  const [playing, setPlaying] = useState(false)
  const [isStopped, setIsStopped] = useState(false) // Track if user manually stopped

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const initializedRef = useRef(false)

  const candles = useReplayStore((s) => s.candles)

  /* ===== SYMBOLS ===== */
  useEffect(() => {
    fetch("http://127.0.0.1:8000/symbols")
      .then((r) => r.json())
      .then((d) => {
        if (d.symbols?.length) {
          setSymbols(d.symbols)
          setSymbol(d.symbols[0])
        }
      })
  }, [])

  /* ===== SOCKET ===== */
  const { closeSocket, isConnected } = useReplaySocket({
    symbol,
    start,
    end,
    timeScale,
    gapScale,
    playing,
    enabled: !isStopped, // Only connect if not manually stopped
  })

  /* ===== CHART INIT ===== */
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#020617" },
        textColor: "#e5e7eb",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: {
        borderColor: "#334155",
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: "#334155",
        timeVisible: true,
        secondsVisible: true,
        rightOffset: 5,
        barSpacing: 3,
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#64748b",
          width: 1,
          style: 2,
          labelBackgroundColor: "#3b82f6",
        },
        horzLine: {
          color: "#64748b",
          width: 1,
          style: 2,
          labelBackgroundColor: "#3b82f6",
        },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
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

    // Cleanup
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [])

  /* ===== DATA ===== */
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return

    if (!initializedRef.current) {
      seriesRef.current.setData(candles as CandlestickData<Time>[])
      initializedRef.current = true
    } else {
      seriesRef.current.update(
        candles[candles.length - 1] as CandlestickData<Time>
      )
    }
    
    // Always show all candles by zooming out to fit
    if (chartRef.current && candles.length > 0) {
      chartRef.current.timeScale().setVisibleRange({
        from: candles[0].time as Time,
        to: candles[candles.length - 1].time as Time,
      })
    }
  }, [candles])

  const handleStop = () => {
    setPlaying(false)
    closeSocket()
    initializedRef.current = false
    setIsStopped(true) // Mark as manually stopped
  }

  const handleConnect = () => {
    setIsStopped(false) // Re-enable connection
    initializedRef.current = false
  }

  // Auto-reconnect when symbol changes (only if not manually stopped)
  useEffect(() => {
    if (!isStopped) {
      initializedRef.current = false
    }
  }, [symbol, start, end, timeScale, gapScale, isStopped])

  return (
    <div style={{ 
      height: "100vh", 
      display: "flex", 
      flexDirection: "column",
      overflow: "hidden",
      background: "#020617"
    }}>
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
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onStop={handleStop}
        onConnect={handleConnect}
        isConnected={isConnected}
        isStopped={isStopped}
      />
      <div 
        ref={containerRef} 
        style={{ 
          flex: 1,
          position: "relative",
          minHeight: 0
        }} 
      />
    </div>
  )
}