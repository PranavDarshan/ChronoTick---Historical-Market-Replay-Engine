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
  
  const firstSMA = data.slice(0, period).reduce((acc, candle) => acc + candle.close, 0) / period
  result.push({ time: data[period - 1].time, value: firstSMA })
  
  for (let i = period; i < data.length; i++) {
    const ema = (data[i].close - result[result.length - 1].value) * multiplier + result[result.length - 1].value
    result.push({ time: data[i].time, value: ema })
  }
  
  return result
}

function calculateRSI(data: CandlestickData<Time>[], period: number = 14): LineData<Time>[] {
  const result: LineData<Time>[] = []
  
  if (data.length <= period) {
    return result
  }
  
  let gains = 0
  let losses = 0
  
  for (let i = 1; i <= period; i++) {
    if (!data[i] || !data[i - 1]) continue
    const change = data[i].close - data[i - 1].close
    if (change > 0) gains += change
    else losses -= change
  }
  
  let avgGain = gains / period
  let avgLoss = losses / period
  
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

function calculateStochasticRSI(data: CandlestickData<Time>[], rsiPeriod = 14, stochPeriod = 14): number {
  const rsiValues = calculateRSI(data, rsiPeriod)
  
  if (rsiValues.length < stochPeriod) return 0
  
  const recentRSI = rsiValues.slice(-stochPeriod)
  const rsiHigh = Math.max(...recentRSI.map(v => v.value))
  const rsiLow = Math.min(...recentRSI.map(v => v.value))
  const currentRSI = rsiValues[rsiValues.length - 1].value
  
  const stochRSI = rsiHigh === rsiLow ? 0 : ((currentRSI - rsiLow) / (rsiHigh - rsiLow)) * 100
  return stochRSI
}

function calculateADX(data: CandlestickData<Time>[], period = 14): number {
  if (data.length < period + 1) return 0
  
  let plusDM = 0, minusDM = 0, tr = 0
  
  for (let i = 1; i <= period; i++) {
    const high = data[i].high
    const low = data[i].low
    const prevHigh = data[i - 1].high
    const prevLow = data[i - 1].low
    const prevClose = data[i - 1].close
    
    const upMove = high - prevHigh
    const downMove = prevLow - low
    
    plusDM += (upMove > downMove && upMove > 0) ? upMove : 0
    minusDM += (downMove > upMove && downMove > 0) ? downMove : 0
    
    tr += Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
  }
  
  let plusDI = (plusDM / tr) * 100
  let minusDI = (minusDM / tr) * 100
  
  for (let i = period + 1; i < data.length; i++) {
    const high = data[i].high
    const low = data[i].low
    const prevHigh = data[i - 1].high
    const prevLow = data[i - 1].low
    const prevClose = data[i - 1].close
    
    const upMove = high - prevHigh
    const downMove = prevLow - low
    
    const currentPlusDM = (upMove > downMove && upMove > 0) ? upMove : 0
    const currentMinusDM = (downMove > upMove && downMove > 0) ? downMove : 0
    const currentTR = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    )
    
    plusDM = plusDM - (plusDM / period) + currentPlusDM
    minusDM = minusDM - (minusDM / period) + currentMinusDM
    tr = tr - (tr / period) + currentTR
    
    plusDI = (plusDM / tr) * 100
    minusDI = (minusDM / tr) * 100
  }
  
  const dx = Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100
  return dx
}

function calculateOBV(data: CandlestickData<Time>[]): number {
  if (data.length < 2) return 0
  
  let obv = 0
  for (let i = 1; i < data.length; i++) {
    const volume = 0
    if (data[i].close > data[i - 1].close) {
      obv += volume
    } else if (data[i].close < data[i - 1].close) {
      obv -= volume
    }
  }
  
  return obv
}

function calculateVWAP(data: CandlestickData<Time>[]): number {
  if (data.length === 0) return 0
  
  let cumVolume = 0
  let cumVolPrice = 0
  
  for (const candle of data) {
    const typical = (candle.high + candle.low + candle.close) / 3
    const volume =  0
    cumVolPrice += typical * volume
    cumVolume += volume
  }
  
  return cumVolume === 0 ? 0 : cumVolPrice / cumVolume
}

type Position = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice: number
  timestamp: number
  status: 'OPEN' | 'CLOSED'
  exitPrice?: number
  exitTimestamp?: number
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

  // Trading State
  const [showTradePanel, setShowTradePanel] = useState(false)
  const [orderQuantity, setOrderQuantity] = useState(1)
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET')
  const [limitPrice, setLimitPrice] = useState<string>('')
  const [positions, setPositions] = useState<Position[]>([])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const indicatorSeriesRef = useRef<{ [key: string]: ISeriesApi<"Line"> }>({})
  const initializedRef = useRef(false)
  const isInitialMount = useRef(true)

  const candles = useReplayStore((s) => s.candles)
  const reset = useReplayStore((s) => s.reset)

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0

  // Calculate timeframe statistics
  const stats = candles.length > 0 ? {
    open: candles[0].open,
    close: candles[candles.length - 1].close,
    high: Math.max(...candles.map(c => c.high)),
    low: Math.min(...candles.map(c => c.low)),
    volume: candles.reduce((sum, c) => sum + (c.volume || 0), 0),
    priceChange: candles[candles.length - 1].close - candles[0].open,
    count: candles.length,
  } : null

  const priceChangePercent = stats && stats.open !== 0
    ? (stats.priceChange / stats.open) * 100
    : 0

  // Calculate positions P&L
  const openPositions = positions.filter(p => p.status === 'OPEN')
  const totalPnL = openPositions.reduce((sum, pos) => {
    const priceDiff = pos.side === 'BUY' 
      ? currentPrice - pos.entryPrice 
      : pos.entryPrice - currentPrice
    return sum + (priceDiff * pos.quantity)
  }, 0)

  const closedPositions = positions.filter(p => p.status === 'CLOSED')
  const realizedPnL = closedPositions.reduce((sum, pos) => {
    if (!pos.exitPrice) return sum
    const priceDiff = pos.side === 'BUY'
      ? pos.exitPrice - pos.entryPrice
      : pos.entryPrice - pos.exitPrice
    return sum + (priceDiff * pos.quantity)
  }, 0)

  // Execute Trade
  const executeTrade = (side: 'BUY' | 'SELL') => {
    if (orderQuantity <= 0 || currentPrice === 0) return

    const price = orderType === 'MARKET' ? currentPrice : parseFloat(limitPrice)
    
    if (orderType === 'LIMIT' && (!limitPrice || isNaN(price))) {
      alert('Please enter a valid limit price')
      return
    }

    const newPosition: Position = {
      id: `${Date.now()}-${Math.random()}`,
      symbol,
      side,
      quantity: orderQuantity,
      entryPrice: price,
      currentPrice: price,
      timestamp: Date.now(),
      status: 'OPEN'
    }

    setPositions(prev => [...prev, newPosition])
    setShowTradePanel(false)
  }

  // Close Position
  const closePosition = (positionId: string) => {
    setPositions(prev => prev.map(pos => {
      if (pos.id === positionId && pos.status === 'OPEN') {
        return {
          ...pos,
          status: 'CLOSED' as const,
          exitPrice: currentPrice,
          exitTimestamp: Date.now()
        }
      }
      return pos
    }))
  }

  // Update current prices for open positions
  useEffect(() => {
    if (currentPrice === 0) return
    
    setPositions(prev => prev.map(pos => {
      if (pos.status === 'OPEN') {
        return { ...pos, currentPrice }
      }
      return pos
    }))
  }, [currentPrice])

  // Additional metrics
  const metrics = candles.length > 0 ? {
    rsi: (() => {
      if (candles.length < 15) return 0
      const rsiData = calculateRSI(candles)
      return rsiData.length > 0 ? rsiData[rsiData.length - 1].value : 0
    })(),
    stochRSI: (() => {
      if (candles.length < 30) return 0
      return calculateStochasticRSI(candles)
    })(),
    adx: (() => {
      if (candles.length < 15) return 0
      return calculateADX(candles)
    })(),
    obv: (() => {
      if (candles.length < 2) return 0
      return calculateOBV(candles)
    })(),
    vwap: (() => {
      if (candles.length < 1) return 0
      return calculateVWAP(candles)
    })(),
    volatility: (() => {
      if (candles.length < 2) return 0
      const returns = candles.slice(1).map((c, i) => 
        (c.close - candles[i].close) / candles[i].close
      )
      const mean = returns.reduce((a, b) => a + b, 0) / returns.length
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length
      return Math.sqrt(variance) * 100
    })(),
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
    bullishCandles: candles.filter(c => c.close > c.open).length,
    bearishCandles: candles.filter(c => c.close < c.open).length,
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
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }

    initializedRef.current = false
    
    if (seriesRef.current) {
      seriesRef.current.setData([])
    }
    
    Object.values(indicatorSeriesRef.current).forEach(series => {
      series.setData([])
    })
    
    reset()
  }, [symbol, start, end, timeScale, gapScale, reset])

  /* ===== SOCKET ===== */
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
    if (!containerRef.current) return
    if (chartRef.current) return

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "#000000" },
        textColor: "#8B92A8",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "#0A0A0A" },
        horzLines: { color: "#0A0A0A" },
      },
      rightPriceScale: {
        borderColor: "#1A1A1A",
        scaleMargins: {
          top: 0.05,
          bottom: 0.05,
        },
      },
      timeScale: {
        borderColor: "#1A1A1A",
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 10,
        minBarSpacing: 3,
        fixLeftEdge: false,
        fixRightEdge: false,
        lockVisibleTimeRangeOnResize: true,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: "#2A2A2A",
          width: 1,
          style: 2,
          labelBackgroundColor: "#1A1A1A",
        },
        horzLine: {
          color: "#2A2A2A",
          width: 1,
          style: 2,
          labelBackgroundColor: "#1A1A1A",
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
      upColor: "#00C853",
      downColor: "#FF1744",
      wickUpColor: "#00C853",
      wickDownColor: "#FF1744",
      borderVisible: false,
    })

    chartRef.current = chart
    seriesRef.current = series

    indicatorSeriesRef.current.sma20 = chart.addSeries(LineSeries, {
      color: "#2196F3",
      lineWidth: 1,
      title: "SMA 20",
      visible: showIndicators.sma20,
    })

    indicatorSeriesRef.current.sma50 = chart.addSeries(LineSeries, {
      color: "#FF9800",
      lineWidth: 1,
      title: "SMA 50",
      visible: showIndicators.sma50,
    })

    indicatorSeriesRef.current.ema12 = chart.addSeries(LineSeries, {
      color: "#00E676",
      lineWidth: 1,
      title: "EMA 12",
      visible: showIndicators.ema12,
    })

    indicatorSeriesRef.current.ema26 = chart.addSeries(LineSeries, {
      color: "#FFC107",
      lineWidth: 1,
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
      lineWidth: 1,
      title: "BB Middle",
      visible: showIndicators.bollinger,
    })

    indicatorSeriesRef.current.bbLower = chart.addSeries(LineSeries, {
      color: "#9C27B0",
      lineWidth: 1,
      title: "BB Lower",
      visible: showIndicators.bollinger,
    })

    const handleResize = () => {
      if (chartRef.current) {
        chartRef.current.resize(containerRef.current?.clientWidth || 0, containerRef.current?.clientHeight || 0)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
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
    if (!seriesRef.current) return
    if (candles.length === 0) return

    if (!initializedRef.current) {
      seriesRef.current.setData(candles as CandlestickData<Time>[])
      initializedRef.current = true
      
      // Fit content on initial load
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent()
      }
    } else {
      seriesRef.current.update(
        candles[candles.length - 1] as CandlestickData<Time>
      )
      
      // Fit content on every update to zoom out and show all candles
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent()
      }
    }

    if (candles.length >= 50) {
      if (showIndicators.sma20) {
        const sma20 = calculateSMA(candles, 20)
        indicatorSeriesRef.current.sma20?.setData(sma20)
      }
      if (showIndicators.sma50) {
        const sma50 = calculateSMA(candles, 50)
        indicatorSeriesRef.current.sma50?.setData(sma50)
      }
      if (showIndicators.ema12) {
        const ema12 = calculateEMA(candles, 12)
        indicatorSeriesRef.current.ema12?.setData(ema12)
      }
      if (showIndicators.ema26) {
        const ema26 = calculateEMA(candles, 26)
        indicatorSeriesRef.current.ema26?.setData(ema26)
      }
      if (showIndicators.bollinger) {
        const bb = calculateBollingerBands(candles, 20, 2)
        indicatorSeriesRef.current.bbUpper?.setData(bb.upper)
        indicatorSeriesRef.current.bbMiddle?.setData(bb.middle)
        indicatorSeriesRef.current.bbLower?.setData(bb.lower)
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
      background: "#000000",
      color: "#E5E7EB",
      overflow: "hidden",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto+Mono:wght@400;500;600&display=swap');
        
        * {
          box-sizing: border-box;
        }
        
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: #0A0A0A;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #2A2A2A;
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #3A3A3A;
        }
        
        [class*="watermark"],
        [class*="attribution"],
        div[style*="pointer-events"][style*="absolute"]:has(a),
        a[href*="tradingview"] {
          display: none !important;
        }
      `}</style>

      {/* Top Bar */}
      <div style={{ 
        background: "#0A0A0A",
        borderBottom: "1px solid #1A1A1A"
      }}>
        {/* Main Header */}
        <div style={{ 
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #1A1A1A"
        }}>
          {/* Left: Symbol and Price */}
          <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
              <span style={{ 
                fontSize: "18px", 
                fontWeight: 700, 
                color: "#FFFFFF",
                fontFamily: "'Roboto Mono', monospace"
              }}>
                {symbol || 'SELECT'}
              </span>
              {stats && (
                <>
                  <span style={{ 
                    fontSize: "24px", 
                    fontWeight: 600, 
                    color: "#FFFFFF",
                    fontFamily: "'Roboto Mono', monospace"
                  }}>
                    {stats.close.toFixed(2)}
                  </span>
                  <span style={{ 
                    fontSize: "14px", 
                    fontWeight: 600,
                    color: stats.priceChange >= 0 ? '#00C853' : '#FF1744',
                    fontFamily: "'Roboto Mono', monospace"
                  }}>
                    {stats.priceChange >= 0 ? '▲' : '▼'} {Math.abs(stats.priceChange).toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                  </span>
                </>
              )}
            </div>

            {/* Quick Stats */}
            {stats && (
              <div style={{ display: "flex", alignItems: "center", gap: "24px", fontSize: "11px", color: "#6B7280" }}>
                <div>
                  <span style={{ color: "#4A4A4A" }}>O</span> <span style={{ color: "#A0A0A0", fontFamily: "'Roboto Mono', monospace" }}>{stats.open.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: "#4A4A4A" }}>H</span> <span style={{ color: "#00C853", fontFamily: "'Roboto Mono', monospace" }}>{stats.high.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: "#4A4A4A" }}>L</span> <span style={{ color: "#FF1744", fontFamily: "'Roboto Mono', monospace" }}>{stats.low.toFixed(2)}</span>
                </div>
                <div>
                  <span style={{ color: "#4A4A4A" }}>VOL</span> <span style={{ color: "#A0A0A0", fontFamily: "'Roboto Mono', monospace" }}>{(stats.volume / 1000000).toFixed(2)}M</span>
                </div>
              </div>
            )}
          </div>

          {/* Right: Status and Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            {/* P&L */}
            {openPositions.length > 0 && (
              <div style={{
                padding: "6px 12px",
                background: totalPnL >= 0 ? 'rgba(0, 200, 83, 0.1)' : 'rgba(255, 23, 68, 0.1)',
                border: `1px solid ${totalPnL >= 0 ? '#00C853' : '#FF1744'}`,
                borderRadius: "4px"
              }}>
                <span style={{ fontSize: "10px", color: "#6B7280", marginRight: "8px" }}>P&L</span>
                <span style={{ 
                  fontSize: "13px", 
                  fontWeight: 700,
                  color: totalPnL >= 0 ? '#00C853' : '#FF1744',
                  fontFamily: "'Roboto Mono', monospace"
                }}>
                  {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                </span>
              </div>
            )}

            {/* Trade Button */}
            <button
              onClick={() => setShowTradePanel(!showTradePanel)}
              disabled={!isConnected || currentPrice === 0}
              style={{
                padding: "8px 20px",
                background: isConnected && currentPrice > 0 ? "#2196F3" : "#1A1A1A",
                border: "none",
                borderRadius: "4px",
                color: isConnected && currentPrice > 0 ? "#FFFFFF" : "#4A4A4A",
                fontWeight: 700,
                fontSize: "12px",
                cursor: isConnected && currentPrice > 0 ? "pointer" : "not-allowed",
                transition: "all 0.15s",
                textTransform: "uppercase",
                letterSpacing: "0.5px"
              }}
              onMouseEnter={(e) => {
                if (isConnected && currentPrice > 0) {
                  e.currentTarget.style.background = "#42A5F5"
                }
              }}
              onMouseLeave={(e) => {
                if (isConnected && currentPrice > 0) {
                  e.currentTarget.style.background = "#2196F3"
                }
              }}
            >
              Trade
            </button>

            {/* Connection Status */}
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "8px 12px",
              background: "#0A0A0A",
              border: "1px solid #1A1A1A",
              borderRadius: "4px"
            }}>
              <div style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: isConnected ? "#00C853" : "#4A4A4A"
              }} />
              <span style={{ fontSize: "11px", color: "#6B7280", fontWeight: 600 }}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
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
            setSocketEnabled(false)
            initializedRef.current = false
            
            if (seriesRef.current) {
              seriesRef.current.setData([])
            }
            
            Object.values(indicatorSeriesRef.current).forEach(series => {
              series.setData([])
            })
            
            reset()
            setPlaying(true)
            
            setTimeout(() => {
              setSocketEnabled(true)
              
              if (chartRef.current && containerRef.current) {
                chartRef.current.resize(
                  containerRef.current.clientWidth,
                  containerRef.current.clientHeight
                )
              }
            }, 100)
          } : undefined}
          isConnected={isConnected}
        />
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Chart Area */}
        <div style={{ flex: 1, position: "relative", background: "#000000" }}>
          <div 
            ref={containerRef} 
            style={{ 
              position: "absolute", 
              inset: 0
            }} 
          />
          
          {!isConnected && candles.length === 0 && (
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none"
            }}>
              <div style={{ textAlign: "center", opacity: 0.3 }}>
                <div style={{ fontSize: "14px", color: "#4A4A4A", fontWeight: 500 }}>
                  Configure parameters and start replay
                </div>
              </div>
            </div>
          )}
          
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
                background: "#0A0A0A",
                padding: "24px 40px",
                borderRadius: "8px",
                border: "1px solid #1A1A1A"
              }}>
                <div style={{ fontSize: "18px", fontWeight: 600, color: "#FFFFFF", marginBottom: "8px" }}>
                  Replay Complete
                </div>
                <div style={{ fontSize: "12px", color: "#6B7280" }}>
                  Click "↻ Replay" to watch again
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Market Data & Positions */}
        <div style={{ 
          width: "320px", 
          background: "#0A0A0A",
          borderLeft: "1px solid #1A1A1A",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto"
        }}>
          {/* Technical Indicators */}
          {metrics && (
            <div style={{ padding: "16px", borderBottom: "1px solid #1A1A1A" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#6B7280", marginBottom: "12px", letterSpacing: "0.5px" }}>
                TECHNICALS
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <MetricCard 
                  label="RSI" 
                  value={metrics.rsi.toFixed(1)}
                  color={metrics.rsi > 70 ? '#FF1744' : metrics.rsi < 30 ? '#00C853' : '#6B7280'}
                />
                <MetricCard 
                  label="Stoch RSI" 
                  value={metrics.stochRSI.toFixed(1)}
                  color={metrics.stochRSI > 80 ? '#FF1744' : metrics.stochRSI < 20 ? '#00C853' : '#6B7280'}
                />
                <MetricCard 
                  label="ADX" 
                  value={metrics.adx.toFixed(1)}
                  color={metrics.adx > 25 ? '#00C853' : '#6B7280'}
                />
                <MetricCard 
                  label="ATR" 
                  value={metrics.atr.toFixed(2)}
                />
                <MetricCard 
                  label="Volatility" 
                  value={`${metrics.volatility.toFixed(2)}%`}
                />
                <MetricCard 
                  label="VWAP" 
                  value={metrics.vwap.toFixed(2)}
                />
                <MetricCard 
                  label="OBV" 
                  value={`${(metrics.obv / 1000000).toFixed(2)}M`}
                />
                <MetricCard 
                  label="BARS" 
                  value={candles.length.toString()}
                />
              </div>
            </div>
          )}

          {/* Sentiment */}
          {metrics && (
            <div style={{ padding: "16px", borderBottom: "1px solid #1A1A1A" }}>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#6B7280", marginBottom: "12px", letterSpacing: "0.5px" }}>
                SENTIMENT
              </div>
              <div style={{ display: "flex", height: "20px", borderRadius: "2px", overflow: "hidden", marginBottom: "8px" }}>
                <div style={{ 
                  width: `${(metrics.bullishCandles / (metrics.bullishCandles + metrics.bearishCandles)) * 100}%`,
                  background: "#00C853"
                }} />
                <div style={{ 
                  flex: 1,
                  background: "#FF1744"
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontFamily: "'Roboto Mono', monospace" }}>
                <span style={{ color: "#00C853" }}>BULL {metrics.bullishCandles}</span>
                <span style={{ color: "#FF1744" }}>BEAR {metrics.bearishCandles}</span>
              </div>
            </div>
          )}

          {/* Indicators Toggle */}
          <div style={{ padding: "16px", borderBottom: "1px solid #1A1A1A" }}>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "#6B7280", marginBottom: "12px", letterSpacing: "0.5px" }}>
              OVERLAYS
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <IndicatorToggle
                label="SMA 20"
                color="#2196F3"
                enabled={showIndicators.sma20}
                onChange={(v) => setShowIndicators(prev => ({ ...prev, sma20: v }))}
              />
              <IndicatorToggle
                label="SMA 50"
                color="#FF9800"
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
                color="#FFC107"
                enabled={showIndicators.ema26}
                onChange={(v) => setShowIndicators(prev => ({ ...prev, ema26: v }))}
              />
              <IndicatorToggle
                label="Bollinger"
                color="#9C27B0"
                enabled={showIndicators.bollinger}
                onChange={(v) => setShowIndicators(prev => ({ ...prev, bollinger: v }))}
              />
            </div>
          </div>

          {/* Positions */}
          <div style={{ flex: 1, padding: "16px" }}>
            <div style={{ 
              fontSize: "10px", 
              fontWeight: 700, 
              color: "#6B7280", 
              marginBottom: "12px", 
              letterSpacing: "0.5px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center"
            }}>
              <span>POSITIONS</span>
              {openPositions.length > 0 && (
                <span style={{ 
                  background: "#FF9800", 
                  color: "#000000", 
                  padding: "2px 6px", 
                  borderRadius: "2px",
                  fontSize: "9px",
                  fontWeight: 700
                }}>
                  {openPositions.length}
                </span>
              )}
            </div>

            {openPositions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {openPositions.map((pos) => {
                  const pnl = pos.side === 'BUY' 
                    ? (currentPrice - pos.entryPrice) * pos.quantity
                    : (pos.entryPrice - currentPrice) * pos.quantity
                  const pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'BUY' ? 1 : -1)
                  
                  return (
                    <div
                      key={pos.id}
                      style={{
                        padding: "10px",
                        background: pnl >= 0 ? "rgba(0, 200, 83, 0.08)" : "rgba(255, 23, 68, 0.08)",
                        border: `1px solid ${pnl >= 0 ? "rgba(0, 200, 83, 0.2)" : "rgba(255, 23, 68, 0.2)"}`,
                        borderRadius: "4px",
                        transition: "all 0.2s"
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = pnl >= 0 ? "rgba(0, 200, 83, 0.12)" : "rgba(255, 23, 68, 0.12)"
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = pnl >= 0 ? "rgba(0, 200, 83, 0.08)" : "rgba(255, 23, 68, 0.08)"
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{
                            padding: "2px 6px",
                            background: pos.side === 'BUY' ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255, 23, 68, 0.2)',
                            color: pos.side === 'BUY' ? '#00C853' : '#FF1744',
                            borderRadius: "2px",
                            fontSize: "9px",
                            fontWeight: 700
                          }}>
                            {pos.side}
                          </span>
                          <span style={{ fontSize: "12px", fontWeight: 600, color: "#FFFFFF" }}>
                            x{pos.quantity}
                          </span>
                        </div>
                        <button
                          onClick={() => closePosition(pos.id)}
                          style={{
                            padding: "2px 8px",
                            background: "none",
                            border: "1px solid #2A2A2A",
                            borderRadius: "2px",
                            color: "#6B7280",
                            fontSize: "9px",
                            fontWeight: 700,
                            cursor: "pointer",
                            transition: "all 0.15s"
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = "#4A4A4A"
                            e.currentTarget.style.color = "#A0A0A0"
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = "#2A2A2A"
                            e.currentTarget.style.color = "#6B7280"
                          }}
                        >
                          CLOSE
                        </button>
                      </div>
                      
                      <div style={{ 
                        display: "grid", 
                        gridTemplateColumns: "1fr 1fr", 
                        gap: "8px",
                        fontSize: "10px"
                      }}>
                        <div>
                          <div style={{ color: "#4A4A4A", marginBottom: "2px" }}>Entry</div>
                          <div style={{ color: "#A0A0A0", fontFamily: "'Roboto Mono', monospace", fontWeight: 500 }}>
                            {pos.entryPrice.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: "#4A4A4A", marginBottom: "2px" }}>Current</div>
                          <div style={{ color: "#A0A0A0", fontFamily: "'Roboto Mono', monospace", fontWeight: 500 }}>
                            {currentPrice.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: "#4A4A4A", marginBottom: "2px" }}>P&L</div>
                          <div style={{ 
                            color: pnl >= 0 ? '#00C853' : '#FF1744', 
                            fontFamily: "'Roboto Mono', monospace",
                            fontWeight: 600
                          }}>
                            {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div style={{ color: "#4A4A4A", marginBottom: "2px" }}>Return</div>
                          <div style={{ 
                            color: pnlPercent >= 0 ? '#00C853' : '#FF1744', 
                            fontFamily: "'Roboto Mono', monospace",
                            fontWeight: 600
                          }}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{
                textAlign: "center",
                padding: "40px 20px",
                color: "#4A4A4A",
                fontSize: "11px"
              }}>
                No open positions
              </div>
            )}

            {/* Closed Positions Summary */}
            {closedPositions.length > 0 && (
              <div style={{ 
                marginTop: "16px", 
                padding: "10px", 
                background: "rgba(26, 26, 26, 0.5)", 
                border: "1px solid #1A1A1A", 
                borderRadius: "4px" 
              }}>
                <div style={{ fontSize: "10px", color: "#4A4A4A", marginBottom: "6px" }}>
                  REALIZED P&L
                </div>
                <div style={{ 
                  fontSize: "16px", 
                  fontWeight: 700,
                  color: realizedPnL >= 0 ? '#00C853' : '#FF1744',
                  fontFamily: "'Roboto Mono', monospace"
                }}>
                  {realizedPnL >= 0 ? '+' : ''}{realizedPnL.toFixed(2)}
                </div>
                <div style={{ fontSize: "10px", color: "#6B7280", marginTop: "4px" }}>
                  {closedPositions.length} closed trade{closedPositions.length > 1 ? 's' : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Trading Panel (Popup) */}
      {showTradePanel && (
        <div 
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000
          }}
          onClick={() => setShowTradePanel(false)}
        >
          <div 
            style={{
              background: "#0A0A0A",
              border: "1px solid #2A2A2A",
              borderRadius: "8px",
              padding: "24px",
              width: "400px",
              maxWidth: "90vw"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#FFFFFF", margin: 0 }}>
                NEW ORDER
              </h3>
              <button
                onClick={() => setShowTradePanel(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1
                }}
              >
                ×
              </button>
            </div>

            {/* Current Price */}
            <div style={{
              padding: "12px",
              background: "#000000",
              border: "1px solid #1A1A1A",
              borderRadius: "4px",
              marginBottom: "20px"
            }}>
              <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "4px" }}>
                LAST PRICE
              </div>
              <div style={{ 
                fontSize: "20px", 
                fontWeight: 700, 
                color: "#FFFFFF",
                fontFamily: "'Roboto Mono', monospace"
              }}>
                {currentPrice.toFixed(2)}
              </div>
            </div>

            {/* Order Type */}
            <div style={{ marginBottom: "16px" }}>
              <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                ORDER TYPE
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setOrderType('MARKET')}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: orderType === 'MARKET' ? '#1A1A1A' : '#000000',
                    border: orderType === 'MARKET' ? '1px solid #4A4A4A' : '1px solid #1A1A1A',
                    borderRadius: "4px",
                    color: orderType === 'MARKET' ? '#FFFFFF' : '#6B7280',
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  MARKET
                </button>
                <button
                  onClick={() => setOrderType('LIMIT')}
                  style={{
                    flex: 1,
                    padding: "10px",
                    background: orderType === 'LIMIT' ? '#1A1A1A' : '#000000',
                    border: orderType === 'LIMIT' ? '1px solid #4A4A4A' : '1px solid #1A1A1A',
                    borderRadius: "4px",
                    color: orderType === 'LIMIT' ? '#FFFFFF' : '#6B7280',
                    fontWeight: 600,
                    fontSize: "11px",
                    cursor: "pointer"
                  }}
                >
                  LIMIT
                </button>
              </div>
            </div>

            {/* Limit Price */}
            {orderType === 'LIMIT' && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                  LIMIT PRICE
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="Enter price"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: "#000000",
                    border: "1px solid #1A1A1A",
                    borderRadius: "4px",
                    color: "#FFFFFF",
                    fontSize: "13px",
                    fontWeight: 500,
                    fontFamily: "'Roboto Mono', monospace",
                    outline: "none"
                  }}
                />
              </div>
            )}

            {/* Quantity */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                QUANTITY
              </div>
              <input
                type="number"
                min="1"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  background: "#000000",
                  border: "1px solid #1A1A1A",
                  borderRadius: "4px",
                  color: "#FFFFFF",
                  fontSize: "13px",
                  fontWeight: 500,
                  fontFamily: "'Roboto Mono', monospace",
                  outline: "none"
                }}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => executeTrade('BUY')}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: "#00C853",
                  border: "none",
                  borderRadius: "4px",
                  color: "#000000",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  letterSpacing: "0.5px"
                }}
              >
                BUY
              </button>
              <button
                onClick={() => executeTrade('SELL')}
                style={{
                  flex: 1,
                  padding: "14px",
                  background: "#FF1744",
                  border: "none",
                  borderRadius: "4px",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: "pointer",
                  letterSpacing: "0.5px"
                }}
              >
                SELL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper Components
function MetricCard({ 
  label, 
  value, 
  color = "#A0A0A0" 
}: { 
  label: string
  value: string
  color?: string 
}) {
  return (
    <div style={{
      padding: "8px",
      background: "#000000",
      border: "1px solid #1A1A1A",
      borderRadius: "4px"
    }}>
      <div style={{ fontSize: "9px", color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: "14px", fontWeight: 600, color, fontFamily: "'Roboto Mono', monospace" }}>
        {value}
      </div>
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
        justifyContent: "space-between",
        padding: "8px",
        borderRadius: "4px",
        cursor: "pointer",
        background: enabled ? '#000000' : 'transparent',
        border: `1px solid ${enabled ? '#1A1A1A' : 'transparent'}`,
        transition: "all 0.15s"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <div style={{
          width: "12px",
          height: "12px",
          borderRadius: "2px",
          background: enabled ? color : 'transparent',
          border: `2px solid ${color}`,
          transition: "all 0.15s"
        }} />
        <span style={{ fontSize: "11px", color: enabled ? "#FFFFFF" : "#6B7280", fontWeight: 500 }}>
          {label}
        </span>
      </div>
      <div style={{
        width: "20px",
        height: "2px",
        background: color,
        opacity: enabled ? 1 : 0.3
      }} />
    </div>
  )
}