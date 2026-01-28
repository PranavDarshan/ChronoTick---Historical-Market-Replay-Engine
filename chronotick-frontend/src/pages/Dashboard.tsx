import { useEffect, useRef, useState } from "react"
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type LineData,
  type Time,
} from "lightweight-charts"

import { TopBar } from "../components/TopBar"
import { useReplaySocket } from "../hooks/useReplaySocket"
import { useReplayStore } from "../store/replayStore"

// Technical indicator calculations
function calculateSMA(data: CandlestickData<Time>[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = []
  
  if (data.length < period) {
    return result
  }
  
  for (let i = period - 1; i < data.length; i++) {
    const sum = data.slice(i - period + 1, i + 1).reduce((acc, candle) => acc + candle.close, 0)
    result.push({
      time: data[i].time,
      value: sum / period
    })
  }
  return result
}

function calculateEMA(data: CandlestickData<Time>[], period: number): LineData<Time>[] {
  const result: LineData<Time>[] = []
  
  if (data.length < period) {
    return result
  }
  
  const multiplier = 2 / (period + 1)
  
  // Start with SMA for first value
  const firstSMA = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0) / period
  result.push({ time: data[period - 1].time, value: firstSMA })
  
  // Calculate EMA for remaining values
  for (let i = period; i < data.length; i++) {
    const ema = (data[i].close - result[result.length - 1].value) * multiplier + result[result.length - 1].value
    result.push({ time: data[i].time, value: ema })
  }
  
  return result
}

function calculateRSI(data: CandlestickData<Time>[], period: number = 14): LineData<Time>[] {
  const result: LineData<Time>[] = []
  
  // Need at least period + 1 candles to calculate RSI
  if (data.length <= period) {
    return result
  }
  
  let gains = 0
  let losses = 0
  
  // Calculate initial average gain/loss
  for (let i = 1; i <= period; i++) {
    if (!data[i] || !data[i - 1]) continue
    const change = data[i].close - data[i - 1].close
    if (change > 0) gains += change
    else losses -= change
  }
  
  let avgGain = gains / period
  let avgLoss = losses / period
  
  // Calculate RSI for each subsequent period
  for (let i = period; i < data.length; i++) {
    if (!data[i] || !data[i - 1]) continue
    const change = data[i].close - data[i - 1].close
    const gain = change > 0 ? change : 0
    const loss = change < 0 ? -change : 0
    
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    
    const rs = avgLoss === 0 ? 100 : avgGain / avgLoss
    const rsi = 100 - (100 / (1 + rs))
    
    result.push({ time: data[i].time, value: rsi })
  }
  
  return result
}

function calculateBollingerBands(data: CandlestickData<Time>[], period: number = 20, stdDev: number = 2) {
  const upper: LineData<Time>[] = []
  const middle: LineData<Time>[] = []
  const lower: LineData<Time>[] = []
  
  if (data.length < period) {
    return { upper, middle, lower }
  }
  
  for (let i = period - 1; i < data.length; i++) {
    const slice = data.slice(i - period + 1, i + 1)
    const sma = slice.reduce((acc, candle) => acc + candle.close, 0) / period
    const variance = slice.reduce((acc, candle) => acc + Math.pow(candle.close - sma, 2), 0) / period
    const std = Math.sqrt(variance)
    
    middle.push({ time: data[i].time, value: sma })
    upper.push({ time: data[i].time, value: sma + (std * stdDev) })
    lower.push({ time: data[i].time, value: sma - (std * stdDev) })
  }
  
  return { upper, middle, lower }
}

function calculateMACD(data: CandlestickData<Time>[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const emaFast = calculateEMA(data, fastPeriod)
  const emaSlow = calculateEMA(data, slowPeriod)
  
  const macdLine: LineData<Time>[] = []
  const startIndex = Math.max(0, slowPeriod - fastPeriod)
  
  for (let i = 0; i < emaFast.length - startIndex; i++) {
    macdLine.push({
      time: emaFast[i + startIndex].time,
      value: emaFast[i + startIndex].value - emaSlow[i].value
    })
  }
  
  const signalLine = calculateEMA(
    macdLine.map(m => ({ time: m.time, open: m.value, high: m.value, low: m.value, close: m.value })),
    signalPeriod
  )
  
  return { macdLine, signalLine }
}

export default function Dashboard() {
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbol, setSymbol] = useState("")
  const [start, setStart] = useState("2015-01-09T09:15")
  const [end, setEnd] = useState("2015-01-14T15:30")
  const [timeScale, setTimeScale] = useState(6000)
  const [gapScale, setGapScale] = useState(100000)
  const [playing, setPlaying] = useState(false)
  const [showIndicators, setShowIndicators] = useState({
    sma20: true,
    sma50: false,
    ema12: false,
    ema26: false,
    bollinger: false,
  })

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const indicatorSeriesRef = useRef<{ [key: string]: ISeriesApi<"Line"> }>({})
  const initializedRef = useRef(false)
  const isInitialMount = useRef(true)

  const candles = useReplayStore((s) => s.candles)
  const reset = useReplayStore((s) => s.reset)

  // Log candles state changes
  useEffect(() => {
    console.log('[CANDLES STATE] Updated - length:', candles.length)
    if (candles.length > 0) {
      console.log('[CANDLES STATE] First candle:', candles[0])
      console.log('[CANDLES STATE] Last candle:', candles[candles.length - 1])
    }
  }, [candles])

  // Calculate timeframe statistics (CORRECTED)
  const stats = candles.length > 0 ? {
    // First candle's open is the period open
    open: candles[0].open,
    // Current candle's close is the current price
    close: candles[candles.length - 1].close,
    // Highest high across all candles
    high: Math.max(...candles.map(c => c.high)),
    // Lowest low across all candles
    low: Math.min(...candles.map(c => c.low)),
    // Total volume
    volume: candles.reduce((sum, c) => sum + (c.volume || 0), 0),
    // Price change from first open to current close
    priceChange: candles[candles.length - 1].close - candles[0].open,
    // Number of candles
    count: candles.length,
  } : null

  const priceChangePercent = stats && stats.open !== 0
    ? (stats.priceChange / stats.open) * 100
    : 0

  // Additional metrics
  const metrics = candles.length > 0 ? {
    // Current RSI - safely calculate
    rsi: (() => {
      if (candles.length < 15) return 0
      const rsiData = calculateRSI(candles)
      return rsiData.length > 0 ? rsiData[rsiData.length - 1].value : 0
    })(),
    // Volatility (standard deviation of returns)
    volatility: (() => {
      if (candles.length < 2) return 0
      const returns = candles.slice(1).map((c, i) => 
        (c.close - candles[i].close) / candles[i].close
      )
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
      return Math.sqrt(variance) * 100
    })(),
    // Average true range (volatility measure)
    atr: (() => {
      if (candles.length < 2) return 0
      const trs = candles.slice(1).map((c, i) => {
        const prev = candles[i]
        return Math.max(
          c.high - c.low,
          Math.abs(c.high - prev.close),
          Math.abs(c.low - prev.close)
        )
      })
      return trs.reduce((a, b) => a + b, 0) / trs.length
    })(),
    // Up/Down candles ratio
    bullishCandles: candles.filter(c => c.close > c.open).length,
    bearishCandles: candles.filter(c => c.close < c.open).length,
    // Average candle body size
    avgBodySize: candles.reduce((sum, c) => sum + Math.abs(c.close - c.open), 0) / candles.length,
  } : null

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

  /* ===== AUTO-RESET ON PARAMETER CHANGE ===== */
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMount.current) {
      console.log('[PARAMS EFFECT] Initial mount, skipping')
      isInitialMount.current = false
      return
    }

    // When any parameter changes, just reset data (don't change play state)
    console.log('[PARAMS CHANGED] Resetting data')
    console.log('[PARAMS CHANGED] Symbol:', symbol, 'Start:', start, 'End:', end, 'TimeScale:', timeScale, 'GapScale:', gapScale)
    initializedRef.current = false
    
    // Clear the chart data
    if (seriesRef.current) {
      console.log('[PARAMS CHANGED] Clearing series data')
      seriesRef.current.setData([])
    } else {
      console.log('[PARAMS CHANGED] No seriesRef to clear')
    }
    
    // Clear all indicator series
    console.log('[PARAMS CHANGED] Clearing indicator series')
    Object.values(indicatorSeriesRef.current).forEach(series => {
      series.setData([])
    })
    
    // Reset the store
    console.log('[PARAMS CHANGED] Calling reset()')
    reset()
    
    // Note: We don't change the playing state here
    // The user's play/pause preference is preserved
  }, [symbol, start, end, timeScale, gapScale, reset])

  /* ===== SOCKET ===== */
  // Socket is always enabled except during replay reset
  const [socketEnabled, setSocketEnabled] = useState(true)
  
  const { isConnected } = useReplaySocket({
    symbol,
    start,
    end,
    timeScale,
    gapScale,
    playing,
    enabled: socketEnabled,
  })

  /* ===== CHART INIT ===== */
  useEffect(() => {
    console.log('[CHART INIT] Running - containerRef exists:', !!containerRef.current, 'chartRef exists:', !!chartRef.current)
    
    if (!containerRef.current) {
      console.log('[CHART INIT] No container ref, skipping')
      return
    }
    
    if (chartRef.current) {
      console.log('[CHART INIT] Chart already exists, skipping')
      return
    }

    console.log('[CHART INIT] Creating chart...')
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#0a0e27" },
        textColor: "#d1d4dc",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "#1a1e3a" },
        horzLines: { color: "#1a1e3a" },
      },
      rightPriceScale: {
        borderColor: "#2a2e45",
        scaleMargins: {
          top: 0.05,
          bottom: 0.05,
        },
      },
      timeScale: {
        borderColor: "#2a2e45",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 2,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#758696",
          width: 1,
          style: 3,
          labelBackgroundColor: "#363c4e",
        },
        horzLine: {
          color: "#758696",
          width: 1,
          style: 3,
          labelBackgroundColor: "#363c4e",
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
    console.log('[CHART INIT] Chart created successfully')

    console.log('[CHART INIT] Adding candlestick series...')
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      borderVisible: false,
    })
    console.log('[CHART INIT] Candlestick series added')

    chartRef.current = chart
    seriesRef.current = series

    console.log('[CHART INIT] Adding indicator series...')
    // Initialize indicator series
    indicatorSeriesRef.current.sma20 = chart.addSeries(LineSeries, {
      color: "#2962FF",
      lineWidth: 2,
      title: "SMA 20",
      visible: showIndicators.sma20,
    })

    indicatorSeriesRef.current.sma50 = chart.addSeries(LineSeries, {
      color: "#FF6D00",
      lineWidth: 2,
      title: "SMA 50",
      visible: showIndicators.sma50,
    })

    indicatorSeriesRef.current.ema12 = chart.addSeries(LineSeries, {
      color: "#00E676",
      lineWidth: 2,
      title: "EMA 12",
      visible: showIndicators.ema12,
    })

    indicatorSeriesRef.current.ema26 = chart.addSeries(LineSeries, {
      color: "#D500F9",
      lineWidth: 2,
      title: "EMA 26",
      visible: showIndicators.ema26,
    })

    indicatorSeriesRef.current.bbUpper = chart.addSeries(LineSeries, {
      color: "#9C27B0",
      lineWidth: 1,
      title: "BB Upper",
      visible: showIndicators.bollinger,
    })

    indicatorSeriesRef.current.bbMiddle = chart.addSeries(LineSeries, {
      color: "#9C27B0",
      lineWidth: 2,
      title: "BB Middle",
      visible: showIndicators.bollinger,
    })

    indicatorSeriesRef.current.bbLower = chart.addSeries(LineSeries, {
      color: "#9C27B0",
      lineWidth: 1,
      title: "BB Lower",
      visible: showIndicators.bollinger,
    })
    console.log('[CHART INIT] All indicator series added')
    console.log('[CHART INIT] Initialization complete')

    return () => {
      console.log('[CHART INIT] Cleanup - removing chart')
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      indicatorSeriesRef.current = {}
    }
  }, [])

  /* ===== UPDATE INDICATORS VISIBILITY ===== */
  useEffect(() => {
    if (!chartRef.current) return

    Object.entries(showIndicators).forEach(([key, visible]) => {
      if (key === 'bollinger') {
        indicatorSeriesRef.current.bbUpper?.applyOptions({ visible })
        indicatorSeriesRef.current.bbMiddle?.applyOptions({ visible })
        indicatorSeriesRef.current.bbLower?.applyOptions({ visible })
      } else {
        indicatorSeriesRef.current[key]?.applyOptions({ visible })
      }
    })
  }, [showIndicators])

  /* ===== DATA & INDICATORS UPDATE ===== */
  useEffect(() => {
    console.log('[DATA EFFECT] Running - candles.length:', candles.length, 'seriesRef exists:', !!seriesRef.current, 'chartRef exists:', !!chartRef.current)
    
    if (!seriesRef.current) {
      console.log('[DATA EFFECT] No seriesRef, skipping')
      return
    }
    
    if (candles.length === 0) {
      console.log('[DATA EFFECT] No candles, skipping')
      return
    }

    console.log('[DATA EFFECT] First candle:', candles[0])
    console.log('[DATA EFFECT] Last candle:', candles[candles.length - 1])
    console.log('[DATA EFFECT] initializedRef.current:', initializedRef.current)

    if (!initializedRef.current) {
      console.log('[DATA EFFECT] Setting initial data - candles count:', candles.length)
      try {
        seriesRef.current.setData(candles as CandlestickData<Time>[])
        console.log('[DATA EFFECT] Successfully set initial data')
        initializedRef.current = true
      } catch (error) {
        console.error('[DATA EFFECT] Error setting data:', error)
      }
    } else {
      console.log('[DATA EFFECT] Updating with new candle:', candles[candles.length - 1])
      try {
        seriesRef.current.update(
          candles[candles.length - 1] as CandlestickData<Time>
        )
        console.log('[DATA EFFECT] Successfully updated data')
      } catch (error) {
        console.error('[DATA EFFECT] Error updating data:', error)
      }
    }

    // Update indicators
    if (candles.length >= 50) {
      console.log('[DATA EFFECT] Updating indicators - candles >= 50')
      if (showIndicators.sma20) {
        const sma20 = calculateSMA(candles, 20)
        console.log('[DATA EFFECT] SMA20 data points:', sma20.length)
        indicatorSeriesRef.current.sma20?.setData(sma20)
      }
      if (showIndicators.sma50) {
        const sma50 = calculateSMA(candles, 50)
        console.log('[DATA EFFECT] SMA50 data points:', sma50.length)
        indicatorSeriesRef.current.sma50?.setData(sma50)
      }
      if (showIndicators.ema12) {
        const ema12 = calculateEMA(candles, 12)
        console.log('[DATA EFFECT] EMA12 data points:', ema12.length)
        indicatorSeriesRef.current.ema12?.setData(ema12)
      }
      if (showIndicators.ema26) {
        const ema26 = calculateEMA(candles, 26)
        console.log('[DATA EFFECT] EMA26 data points:', ema26.length)
        indicatorSeriesRef.current.ema26?.setData(ema26)
      }
      if (showIndicators.bollinger) {
        const bb = calculateBollingerBands(candles, 20, 2)
        console.log('[DATA EFFECT] Bollinger Bands - upper:', bb.upper.length, 'middle:', bb.middle.length, 'lower:', bb.lower.length)
        indicatorSeriesRef.current.bbUpper?.setData(bb.upper)
        indicatorSeriesRef.current.bbMiddle?.setData(bb.middle)
        indicatorSeriesRef.current.bbLower?.setData(bb.lower)
      }
    } else {
      console.log('[DATA EFFECT] Not enough candles for indicators - need 50, have:', candles.length)
    }
    
    if (chartRef.current && candles.length > 0) {
      console.log('[DATA EFFECT] Setting visible range - from:', candles[0].time, 'to:', candles[candles.length - 1].time)
      try {
        chartRef.current.timeScale().setVisibleRange({
          from: candles[0].time as Time,
          to: candles[candles.length - 1].time as Time,
        })
        console.log('[DATA EFFECT] Successfully set visible range')
      } catch (error) {
        console.error('[DATA EFFECT] Error setting visible range:', error)
      }
    }
  }, [candles, showIndicators])

  /* ===== PAGE UNLOAD HANDLER ===== */
  useEffect(() => {
    const handleBeforeUnload = () => {
      reset()
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload)
    }
  }, [reset])

  return (
    <div style={{ 
      height: "100vh", 
      display: "flex", 
      flexDirection: "column",
      background: "#0a0e27",
      color: "#d1d4dc",
      overflow: "hidden"
    }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        /* Hide TradingView watermarks and branding */
        [class*="watermark"],
        [class*="attribution"],
        div[style*="pointer-events"][style*="absolute"]:has(a),
        a[href*="tradingview"] {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ 
        background: "#131722", 
        borderBottom: "1px solid #2a2e45",
        boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)"
      }}>
        <div style={{ padding: "12px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
              {/* Logo/Brand */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{
                  width: "32px",
                  height: "32px",
                  background: "linear-gradient(135deg, #3b82f6 0%, #9333ea 100%)",
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center"
                }}>
                  <span style={{ color: "white", fontWeight: "bold", fontSize: "18px" }}>M</span>
                </div>
                <span style={{ fontSize: "20px", fontWeight: 600, color: "white" }}>
                  Market Replay
                </span>
              </div>

              {/* Symbol Info */}
              {stats && (
                <div style={{ display: "flex", alignItems: "baseline", gap: "16px" }}>
                  <span style={{ fontSize: "24px", fontWeight: "bold", color: "white" }}>
                    {symbol}
                  </span>
                  <span style={{ fontSize: "24px", fontWeight: 600, color: "white" }}>
                    {stats.close.toFixed(2)}
                  </span>
                  <span style={{ 
                    fontSize: "18px", 
                    fontWeight: 500,
                    color: stats.priceChange >= 0 ? '#26a69a' : '#ef5350',
                    display: "flex",
                    alignItems: "center",
                    gap: "4px"
                  }}>
                    {stats.priceChange >= 0 ? '▲' : '▼'}
                    {Math.abs(stats.priceChange).toFixed(2)} ({priceChangePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>

            {/* Connection Status */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "6px 12px",
                borderRadius: "8px",
                background: "#1e2235"
              }}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: isConnected ? "#22c55e" : "#6b7280",
                  animation: isConnected ? "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite" : "none"
                }} />
                <span style={{ 
                  fontSize: "11px", 
                  fontWeight: 500, 
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em"
                }}>
                  {isConnected ? 'Live' : 'Disconnected'}
                </span>
              </div>
              
              {candles.length > 0 && (
                <div style={{
                  fontSize: "11px",
                  color: "#6b7280",
                  padding: "6px 12px",
                  background: "#1e2235",
                  borderRadius: "8px"
                }}>
                  {candles.length} bars
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Controls Bar */}
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
          onReplay={!isConnected ? () => {
            console.log('[REPLAY] ========================================')
            console.log('[REPLAY] Replay button clicked - forcing reconnection')
            console.log('[REPLAY] Current params - Symbol:', symbol, 'Start:', start, 'End:', end)
            
            // Step 1: Disable socket to disconnect
            console.log('[REPLAY] Disabling socket')
            setSocketEnabled(false)
            
            // Step 2: Clear the local state
            initializedRef.current = false
            
            if (seriesRef.current) {
              console.log('[REPLAY] Clearing series data')
              seriesRef.current.setData([])
            }
            
            // Clear all indicator series  
            console.log('[REPLAY] Clearing indicator series')
            Object.values(indicatorSeriesRef.current).forEach(series => {
              series.setData([])
            })
            
            // Reset the store
            console.log('[REPLAY] Calling reset()')
            reset()
            
            // Step 3: Set playing to true for auto-play when reconnected
            console.log('[REPLAY] Setting playing to true for auto-play')
            setPlaying(true)
            
            // Step 4: Re-enable socket after a brief delay to force reconnection
            setTimeout(() => {
              console.log('[REPLAY] Re-enabling socket to reconnect')
              setSocketEnabled(true)
            }, 100)
            
            console.log('[REPLAY] ========================================')
          } : undefined}
          isConnected={isConnected}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Left Sidebar */}
        <div style={{ 
          width: "280px", 
          background: "#131722", 
          borderRight: "1px solid #2a2e45",
          overflowY: "auto"
        }}>
          <div style={{ padding: "16px" }}>
            {/* Timeframe Statistics */}
            <div style={{ marginBottom: "16px" }}>
              <h3 style={{ 
                fontSize: "11px", 
                fontWeight: 600, 
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "12px"
              }}>
                Period Statistics
              </h3>
              {stats ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <StatRow label="Period Open" value={stats.open.toFixed(2)} />
                  <StatRow label="Current Close" value={stats.close.toFixed(2)} />
                  <StatRow label="Period High" value={stats.high.toFixed(2)} color="#26a69a" />
                  <StatRow label="Period Low" value={stats.low.toFixed(2)} color="#ef5350" />
                  <StatRow label="Total Volume" value={stats.volume.toLocaleString()} />
                  <StatRow 
                    label="Net Change" 
                    value={`${stats.priceChange >= 0 ? '+' : ''}${stats.priceChange.toFixed(2)}`}
                    color={stats.priceChange >= 0 ? '#26a69a' : '#ef5350'}
                  />
                  <StatRow 
                    label="% Change" 
                    value={`${priceChangePercent >= 0 ? '+' : ''}${priceChangePercent.toFixed(2)}%`}
                    color={priceChangePercent >= 0 ? '#26a69a' : '#ef5350'}
                  />
                </div>
              ) : (
                <div style={{ fontSize: "14px", color: "#6b7280" }}>No data available</div>
              )}
            </div>

            {/* Technical Indicators */}
            {metrics && (
              <>
                <div style={{ paddingTop: "16px", borderTop: "1px solid #2a2e45", marginBottom: "16px" }}>
                  <h3 style={{ 
                    fontSize: "11px", 
                    fontWeight: 600, 
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "12px"
                  }}>
                    Technical Indicators
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <StatRow 
                      label="RSI (14)" 
                      value={metrics.rsi.toFixed(2)}
                      color={metrics.rsi > 70 ? '#ef5350' : metrics.rsi < 30 ? '#26a69a' : 'white'}
                    />
                    <StatRow label="Volatility" value={`${metrics.volatility.toFixed(2)}%`} />
                    <StatRow label="Avg True Range" value={metrics.atr.toFixed(2)} />
                    <StatRow label="Avg Body Size" value={metrics.avgBodySize.toFixed(2)} />
                  </div>
                </div>

                {/* Market Sentiment */}
                <div style={{ paddingTop: "16px", borderTop: "1px solid #2a2e45", marginBottom: "16px" }}>
                  <h3 style={{ 
                    fontSize: "11px", 
                    fontWeight: 600, 
                    color: "#6b7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "12px"
                  }}>
                    Market Sentiment
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <StatRow label="Bullish Candles" value={metrics.bullishCandles.toString()} color="#26a69a" />
                    <StatRow label="Bearish Candles" value={metrics.bearishCandles.toString()} color="#ef5350" />
                    <div style={{ marginTop: "8px" }}>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "6px" }}>
                        Bull/Bear Ratio
                      </div>
                      <div style={{ display: "flex", height: "24px", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ 
                          width: `${(metrics.bullishCandles / (metrics.bullishCandles + metrics.bearishCandles)) * 100}%`,
                          background: "#26a69a"
                        }} />
                        <div style={{ 
                          flex: 1,
                          background: "#ef5350"
                        }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px", fontSize: "11px", color: "#9ca3af" }}>
                        <span>{((metrics.bullishCandles / (metrics.bullishCandles + metrics.bearishCandles)) * 100).toFixed(1)}%</span>
                        <span>{((metrics.bearishCandles / (metrics.bullishCandles + metrics.bearishCandles)) * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Indicator Toggles */}
            <div style={{ paddingTop: "16px", borderTop: "1px solid #2a2e45" }}>
              <h3 style={{ 
                fontSize: "11px", 
                fontWeight: 600, 
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "12px"
              }}>
                Chart Indicators
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <IndicatorToggle
                  label="SMA 20"
                  color="#2962FF"
                  enabled={showIndicators.sma20}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, sma20: v }))}
                />
                <IndicatorToggle
                  label="SMA 50"
                  color="#FF6D00"
                  enabled={showIndicators.sma50}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, sma50: v }))}
                />
                <IndicatorToggle
                  label="EMA 12"
                  color="#00E676"
                  enabled={showIndicators.ema12}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, ema12: v }))}
                />
                <IndicatorToggle
                  label="EMA 26"
                  color="#D500F9"
                  enabled={showIndicators.ema26}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, ema26: v }))}
                />
                <IndicatorToggle
                  label="Bollinger Bands"
                  color="#9C27B0"
                  enabled={showIndicators.bollinger}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, bollinger: v }))}
                />
              </div>
            </div>

            {/* Replay Info */}
            <div style={{ paddingTop: "16px", borderTop: "1px solid #2a2e45", marginTop: "16px" }}>
              <h3 style={{ 
                fontSize: "11px", 
                fontWeight: 600, 
                color: "#6b7280",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                marginBottom: "12px"
              }}>
                Replay Status
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", fontSize: "14px", color: "#9ca3af" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Speed:</span>
                  <span style={{ color: "white" }}>{timeScale}ms</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>Status:</span>
                  <span style={{ color: playing ? '#22c55e' : '#eab308' }}>
                    {playing ? 'Playing' : 'Paused'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart Container */}
        <div style={{ flex: 1, position: "relative", background: "#0a0e27" }}>
          <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
          
          {/* Watermark */}
          {!isConnected && candles.length === 0 && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none"
            }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "64px", fontWeight: "bold", color: "#1a1e3a", marginBottom: "8px" }}>
                  Market Replay
                </div>
                <div style={{ fontSize: "18px", color: "#6b7280" }}>
                  Select parameters and click Play to start
                </div>
              </div>
            </div>
          )}
          
          {/* Replay Available Message */}
          {!isConnected && candles.length > 0 && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none"
            }}>
              <div style={{ 
                textAlign: "center",
                background: "rgba(19, 23, 34, 0.95)",
                padding: "32px 48px",
                borderRadius: "16px",
                border: "2px solid #6366f1",
                boxShadow: "0 8px 32px rgba(99, 102, 241, 0.3)"
              }}>
                <div style={{ fontSize: "48px", fontWeight: "bold", color: "#6366f1", marginBottom: "16px" }}>
                  Replay Complete
                </div>
                <div style={{ fontSize: "18px", color: "#9ca3af", marginBottom: "8px" }}>
                  Click the "↻ Replay" button to watch again
                </div>
                <div style={{ fontSize: "14px", color: "#6b7280" }}>
                  You can also adjust parameters and start a new replay
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: "#131722",
        borderTop: "1px solid #2a2e45",
        padding: "8px 24px"
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          color: "#6b7280"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
            <span>© 2024 Market Replay</span>
            <span>•</span>
            <span>Historical Market Data Visualization Platform</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span>Real-time WebSocket Streaming</span>
            <span>•</span>
            <span>Advanced Charting & Analytics</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Helper Components
function StatRow({ 
  label, 
  value, 
  color = "white" 
}: { 
  label: string
  value: string
  color?: string 
}) {
  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "6px 8px",
      borderRadius: "4px",
      transition: "background 0.2s"
    }}
    onMouseEnter={(e) => e.currentTarget.style.background = "#1e2235"}
    onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
    >
      <span style={{ fontSize: "12px", color: "#6b7280", fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: "14px", fontWeight: 600, color }}>{value}</span>
    </div>
  )
}

function IndicatorToggle({
  label,
  color,
  enabled,
  onChange
}: {
  label: string
  color: string
  enabled: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div
      onClick={() => onChange(!enabled)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px",
        borderRadius: "6px",
        cursor: "pointer",
        background: enabled ? "#1e2235" : "transparent",
        border: `1px solid ${enabled ? color : "#2a2e45"}`,
        transition: "all 0.2s"
      }}
    >
      <div style={{
        width: "16px",
        height: "16px",
        borderRadius: "4px",
        background: enabled ? color : "transparent",
        border: `2px solid ${color}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}>
        {enabled && <span style={{ color: "white", fontSize: "10px" }}>✓</span>}
      </div>
      <span style={{ fontSize: "13px", color: enabled ? "white" : "#9ca3af", fontWeight: 500 }}>
        {label}
      </span>
      <div style={{
        marginLeft: "auto",
        width: "24px",
        height: "2px",
        background: color,
        borderRadius: "1px"
      }} />
    </div>
  )
}
