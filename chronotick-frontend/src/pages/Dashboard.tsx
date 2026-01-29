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
  stopLossPrice?: number // Stop loss for this position
}

type Order = {
  id: string
  symbol: string
  side: 'BUY' | 'SELL'
  quantity: number
  orderType: 'MARKET' | 'LIMIT'
  limitPrice?: number
  stopLossPrice?: number // Optional stop loss for when order fills
  timestamp: number
  status: 'PENDING' | 'FILLED' | 'CANCELLED'
}

export default function Dashboard() {
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbol, setSymbol] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
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
  const [stopLossPrice, setStopLossPrice] = useState<string>('')
  const [positions, setPositions] = useState<Position[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [activeTab, setActiveTab] = useState<'positions' | 'orders'>('positions')
  const [lastSymbolRefresh, setLastSymbolRefresh] = useState<Date>(new Date())

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<any>(null)
  const indicatorSeriesRef = useRef<{ [key: string]: ISeriesApi<"Line"> }>({})
  const initializedRef = useRef(false)
  const isInitialMount = useRef(true)

  const candles = useReplayStore((s) => s.candles)
  const reset = useReplayStore((s) => s.reset)

  const currentPrice = candles.length > 0 ? candles[candles.length - 1].close : 0

  // Filter symbols based on search - FIXED to be case-insensitive and trim whitespace
  const filteredSymbols = symbols.filter(s => 
    s.toLowerCase().trim().includes(searchQuery.toLowerCase().trim())
  )

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

  const pendingOrders = orders.filter(o => o.status === 'PENDING')

  // Fetch symbols
  const fetchSymbols = async () => {
    try {
      const response = await fetch("http://127.0.0.1:8000/symbols")
      const data = await response.json()
      if (data.symbols?.length) {
        setSymbols(data.symbols)
        if (!symbol) {
          setSymbol(data.symbols[0])
        }
      }
      setLastSymbolRefresh(new Date())
    } catch (error) {
      console.error("Failed to fetch symbols:", error)
    }
  }

  // Execute Trade
  const executeTrade = (side: 'BUY' | 'SELL') => {
    if (orderQuantity <= 0 || currentPrice === 0) return

    // Validate stop loss if provided
    let validatedStopLoss: number | undefined = undefined
    if (stopLossPrice && stopLossPrice.trim() !== '') {
      const slPrice = parseFloat(stopLossPrice)
      
      if (isNaN(slPrice) || slPrice <= 0) {
        alert('Please enter a valid stop loss price')
        return
      }

      // Validate stop loss direction
      if (side === 'BUY') {
        // For BUY positions, stop loss must be BELOW entry price
        if (slPrice >= currentPrice) {
          alert(`Stop loss for BUY must be below entry price (current: ${currentPrice.toFixed(2)})`)
          return
        }
      } else {
        // For SELL positions, stop loss must be ABOVE entry price
        if (slPrice <= currentPrice) {
          alert(`Stop loss for SELL must be above entry price (current: ${currentPrice.toFixed(2)})`)
          return
        }
      }
      
      validatedStopLoss = slPrice
    }

    if (orderType === 'LIMIT') {
      const price = parseFloat(limitPrice)
      
      if (!limitPrice || isNaN(price) || price <= 0) {
        alert('Please enter a valid limit price')
        return
      }

      const shouldExecuteImmediately = 
        (side === 'BUY' && price >= currentPrice) || 
        (side === 'SELL' && price <= currentPrice)

      if (shouldExecuteImmediately) {
        const newPosition: Position = {
          id: `${Date.now()}-${Math.random()}`,
          symbol,
          side,
          quantity: orderQuantity,
          entryPrice: currentPrice,
          currentPrice: currentPrice,
          timestamp: Date.now(),
          status: 'OPEN',
          stopLossPrice: validatedStopLoss
        }

        setPositions(prev => [...prev, newPosition])
        
        const filledOrder: Order = {
          id: `${Date.now()}-${Math.random()}`,
          symbol,
          side,
          quantity: orderQuantity,
          orderType: 'LIMIT',
          limitPrice: price,
          timestamp: Date.now(),
          status: 'FILLED'
        }
        setOrders(prev => [...prev, filledOrder])
      } else {
        const newOrder: Order = {
          id: `${Date.now()}-${Math.random()}`,
          symbol,
          side,
          quantity: orderQuantity,
          orderType: 'LIMIT',
          limitPrice: price,
          stopLossPrice: validatedStopLoss,
          timestamp: Date.now(),
          status: 'PENDING'
        }

        setOrders(prev => [...prev, newOrder])
      }
      
      setShowTradePanel(false)
      setStopLossPrice('') // Reset
      
    } else {
      // Market order - execute immediately
      const newPosition: Position = {
        id: `${Date.now()}-${Math.random()}`,
        symbol,
        side,
        quantity: orderQuantity,
        entryPrice: currentPrice,
        currentPrice: currentPrice,
        timestamp: Date.now(),
        status: 'OPEN',
        stopLossPrice: validatedStopLoss
      }

      setPositions(prev => [...prev, newPosition])
      setShowTradePanel(false)
      setStopLossPrice('') // Reset
    }
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

  // Cancel Order
  const cancelOrder = (orderId: string) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId && order.status === 'PENDING') {
        return { ...order, status: 'CANCELLED' as const }
      }
      return order
    }))
  }

  // Check stop loss on positions and execute limit orders when price changes
  useEffect(() => {
    if (currentPrice === 0) return
    
    // Update current prices for open positions and check stop losses
    setPositions(prev => prev.map(pos => {
      if (pos.status === 'OPEN') {
        const updatedPos = { ...pos, currentPrice }
        
        // Check if stop loss is hit
        if (pos.stopLossPrice) {
          let stopLossHit = false
          
          if (pos.side === 'BUY') {
            // For BUY positions, stop loss triggers when price falls to or below stop loss
            stopLossHit = currentPrice <= pos.stopLossPrice
          } else {
            // For SELL positions, stop loss triggers when price rises to or above stop loss
            stopLossHit = currentPrice >= pos.stopLossPrice
          }
          
          if (stopLossHit) {
            console.log(`Stop loss triggered for ${pos.side} position at ${currentPrice}`)
            return {
              ...updatedPos,
              status: 'CLOSED' as const,
              exitPrice: currentPrice,
              exitTimestamp: Date.now()
            }
          }
        }
        
        return updatedPos
      }
      return pos
    }))

    // Check pending limit orders
    setOrders(prev => prev.map(order => {
      if (order.status !== 'PENDING') return order

      let shouldExecute = false

      // Handle LIMIT orders
      if (order.orderType === 'LIMIT' && order.limitPrice) {
        if (order.side === 'BUY') {
          // Buy limit executes when market price falls to or below limit price
          shouldExecute = currentPrice <= order.limitPrice
        } else {
          // Sell limit executes when market price rises to or above limit price
          shouldExecute = currentPrice >= order.limitPrice
        }

        if (shouldExecute) {
          const newPosition: Position = {
            id: `${Date.now()}-${Math.random()}`,
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            entryPrice: order.limitPrice,
            currentPrice: currentPrice,
            timestamp: Date.now(),
            status: 'OPEN',
            stopLossPrice: order.stopLossPrice // Carry over stop loss from order
          }

          setPositions(prev => [...prev, newPosition])
          return { ...order, status: 'FILLED' as const }
        }
      }

      return order
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

  /* ===== SYMBOLS - Initial & Auto-refresh ===== */
  useEffect(() => {
    fetchSymbols()

    const intervalId = setInterval(() => {
      fetchSymbols()
    }, 10 * 60 * 1000)

    return () => clearInterval(intervalId)
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
      
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent()
      }
    } else {
      seriesRef.current.update(
        candles[candles.length - 1] as CandlestickData<Time>
      )
      
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
      background: "#000000",
      color: "#E5E7EB",
      overflow: "hidden",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        
        * {
          box-sizing: border-box;
        }
        
        ::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        
        ::-webkit-scrollbar-track {
          background: #0A0A0A;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #2A2A2A;
          border-radius: 4px;
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

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .symbol-item {
          animation: slideIn 0.2s ease-out;
        }
      `}</style>

      {/* Left Sidebar - Symbols */}
      <div style={{
        width: "280px",
        background: "#0A0A0A",
        borderRight: "1px solid #1A1A1A",
        display: "flex",
        flexDirection: "column"
      }}>
        {/* Sidebar Header */}
        <div style={{
          padding: "20px",
          borderBottom: "1px solid #1A1A1A"
        }}>
          <div style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#6B7280",
            letterSpacing: "1px",
            marginBottom: "12px"
          }}>
            MARKET SYMBOLS
          </div>

          {/* Search Bar */}
          <div style={{ position: "relative" }}>
            <input
              type="text"
              placeholder="Search symbols..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 36px 10px 12px",
                background: "#000000",
                border: "1px solid #1A1A1A",
                borderRadius: "6px",
                color: "#E5E7EB",
                fontSize: "13px",
                outline: "none",
                transition: "all 0.2s"
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#3A3A3A"
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#1A1A1A"
              }}
            />
            <svg 
              style={{
                position: "absolute",
                right: "12px",
                top: "50%",
                transform: "translateY(-50%)",
                width: "14px",
                height: "14px",
                opacity: 0.5
              }}
              fill="none" 
              stroke="#8B92A8" 
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth="2"/>
              <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>

          {/* Refresh Button */}
          <button
            onClick={fetchSymbols}
            style={{
              marginTop: "12px",
              width: "100%",
              padding: "8px",
              background: "#1A1A1A",
              border: "1px solid #2A2A2A",
              borderRadius: "6px",
              color: "#8B92A8",
              fontSize: "11px",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.2s"
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#2A2A2A"
              e.currentTarget.style.color = "#E5E7EB"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#1A1A1A"
              e.currentTarget.style.color = "#8B92A8"
            }}
          >
            <svg 
              style={{ width: "14px", height: "14px" }}
              fill="none" 
              stroke="currentColor" 
              viewBox="0 0 24 24"
            >
              <path 
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </svg>
            REFRESH
          </button>

          {/* Last Update */}
          <div style={{
            marginTop: "8px",
            fontSize: "10px",
            color: "#4A4A4A",
            textAlign: "center"
          }}>
            Updated: {lastSymbolRefresh.toLocaleTimeString()}
          </div>
        </div>

        {/* Symbols List - PROFESSIONAL DESIGN */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0"
        }}>
          {filteredSymbols.length > 0 ? (
            filteredSymbols.map((sym, index) => (
              <div
                key={sym}
                className="symbol-item"
                onClick={() => setSymbol(sym)}
                style={{
                  padding: "12px 20px",
                  margin: "0",
                  background: symbol === sym ? "#1A1A1A" : "transparent",
                  borderLeft: symbol === sym ? "3px solid #FFFFFF" : "3px solid transparent",
                  borderRadius: "0",
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  animationDelay: `${index * 0.02}s`
                }}
                onMouseEnter={(e) => {
                  if (symbol !== sym) {
                    e.currentTarget.style.background = "#0F0F0F"
                    e.currentTarget.style.borderLeftColor = "#3A3A3A"
                  }
                }}
                onMouseLeave={(e) => {
                  if (symbol !== sym) {
                    e.currentTarget.style.background = "transparent"
                    e.currentTarget.style.borderLeftColor = "transparent"
                  }
                }}
              >
                <div style={{
                  fontSize: "13px",
                  fontWeight: symbol === sym ? 600 : 500,
                  color: symbol === sym ? "#FFFFFF" : "#8B92A8",
                  fontFamily: "'JetBrains Mono', monospace",
                  letterSpacing: "0.3px"
                }}>
                  {sym}
                </div>
              </div>
            ))
          ) : (
            <div style={{
              padding: "40px 20px",
              textAlign: "center",
              color: "#4A4A4A",
              fontSize: "12px"
            }}>
              {searchQuery ? "No symbols match your search" : "Loading symbols..."}
            </div>
          )}
        </div>

        {/* Symbol Count */}
        <div style={{
          padding: "12px 20px",
          borderTop: "1px solid #1A1A1A",
          fontSize: "11px",
          color: "#6B7280",
          textAlign: "center"
        }}>
          {filteredSymbols.length} of {symbols.length} symbols
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden"
      }}>
        {/* Top Section */}
        <div style={{ 
          background: "#0A0A0A",
          borderBottom: "1px solid #1A1A1A"
        }}>
          {/* Main Header */}
          <div style={{ 
            padding: "16px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #1A1A1A"
          }}>
            {/* Left: Symbol and Price */}
            <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span style={{ 
                  fontSize: "20px", 
                  fontWeight: 700, 
                  color: "#FFFFFF",
                  fontFamily: "'JetBrains Mono', monospace"
                }}>
                  {symbol || 'SELECT'}
                </span>
                {stats && (
                  <>
                    <span style={{ 
                      fontSize: "28px", 
                      fontWeight: 700, 
                      color: "#FFFFFF",
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {stats.close.toFixed(2)}
                    </span>
                    <span style={{ 
                      fontSize: "16px", 
                      fontWeight: 700,
                      color: stats.priceChange >= 0 ? '#00C853' : '#FF1744',
                      fontFamily: "'JetBrains Mono', monospace"
                    }}>
                      {stats.priceChange >= 0 ? '▲' : '▼'} {Math.abs(stats.priceChange).toFixed(2)} ({priceChangePercent >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%)
                    </span>
                  </>
                )}
              </div>

              {/* Quick Stats */}
              {stats && (
                <div style={{ display: "flex", alignItems: "center", gap: "24px", fontSize: "12px" }}>
                  <div>
                    <span style={{ color: "#6B7280" }}>OPEN</span>{' '}
                    <span style={{ color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{stats.open.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6B7280" }}>HIGH</span>{' '}
                    <span style={{ color: "#00C853", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{stats.high.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6B7280" }}>LOW</span>{' '}
                    <span style={{ color: "#FF1744", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{stats.low.toFixed(2)}</span>
                  </div>
                  <div>
                    <span style={{ color: "#6B7280" }}>VOL</span>{' '}
                    <span style={{ color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>{(stats.volume / 1000000).toFixed(2)}M</span>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Status and Actions */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              {/* P&L */}
              {openPositions.length > 0 && (
                <div style={{
                  padding: "8px 16px",
                  background: totalPnL >= 0 ? 'rgba(0, 200, 83, 0.15)' : 'rgba(255, 23, 68, 0.15)',
                  border: `1px solid ${totalPnL >= 0 ? '#00C853' : '#FF1744'}`,
                  borderRadius: "6px"
                }}>
                  <span style={{ fontSize: "10px", color: "#8B92A8", marginRight: "8px", fontWeight: 600 }}>P&L</span>
                  <span style={{ 
                    fontSize: "16px", 
                    fontWeight: 700,
                    color: totalPnL >= 0 ? '#00C853' : '#FF1744',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(2)}
                  </span>
                </div>
              )}

              {/* Pending Orders Badge */}
              {pendingOrders.length > 0 && (
                <div style={{
                  padding: "8px 16px",
                  background: 'rgba(33, 150, 243, 0.15)',
                  border: '1px solid #2196F3',
                  borderRadius: "6px"
                }}>
                  <span style={{ fontSize: "10px", color: "#8B92A8", marginRight: "8px", fontWeight: 600 }}>ORDERS</span>
                  <span style={{ 
                    fontSize: "16px", 
                    fontWeight: 700,
                    color: '#2196F3',
                    fontFamily: "'JetBrains Mono', monospace"
                  }}>
                    {pendingOrders.length}
                  </span>
                </div>
              )}

              {/* Trade Button */}
              <button
                onClick={() => setShowTradePanel(!showTradePanel)}
                disabled={!isConnected || currentPrice === 0}
                style={{
                  padding: "10px 24px",
                  background: isConnected && currentPrice > 0 ? "#2196F3" : "#1A1A1A",
                  border: "none",
                  borderRadius: "6px",
                  color: isConnected && currentPrice > 0 ? "#FFFFFF" : "#4A4A4A",
                  fontWeight: 700,
                  fontSize: "13px",
                  cursor: isConnected && currentPrice > 0 ? "pointer" : "not-allowed",
                  transition: "all 0.2s",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px"
                }}
                onMouseEnter={(e) => {
                  if (isConnected && currentPrice > 0) {
                    e.currentTarget.style.background = "#42A5F5"
                    e.currentTarget.style.transform = "translateY(-1px)"
                  }
                }}
                onMouseLeave={(e) => {
                  if (isConnected && currentPrice > 0) {
                    e.currentTarget.style.background = "#2196F3"
                    e.currentTarget.style.transform = "translateY(0)"
                  }
                }}
              >
                + New Trade
              </button>

              {/* Connection Status */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "10px 16px",
                background: "#0A0A0A",
                border: "1px solid #1A1A1A",
                borderRadius: "6px"
              }}>
                <div style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: isConnected ? "#00C853" : "#4A4A4A",
                  boxShadow: isConnected ? "0 0 8px rgba(0, 200, 83, 0.5)" : "none"
                }} />
                <span style={{ fontSize: "12px", color: "#8B92A8", fontWeight: 600 }}>
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
                  <div style={{ fontSize: "16px", color: "#4A4A4A", fontWeight: 500 }}>
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
                  padding: "32px 48px",
                  borderRadius: "12px",
                  border: "1px solid #1A1A1A"
                }}>
                  <div style={{ fontSize: "20px", fontWeight: 700, color: "#FFFFFF", marginBottom: "8px" }}>
                    Replay Complete
                  </div>
                  <div style={{ fontSize: "13px", color: "#8B92A8" }}>
                    Click "↻ Replay" to watch again
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Analytics & Trading */}
          <div style={{ 
            width: "360px", 
            background: "#0A0A0A",
            borderLeft: "1px solid #1A1A1A",
            display: "flex",
            flexDirection: "column",
            overflowY: "auto"
          }}>
            {/* Technical Indicators */}
            {metrics && (
              <div style={{ padding: "20px", borderBottom: "1px solid #1A1A1A" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", marginBottom: "16px", letterSpacing: "1px" }}>
                  TECHNICAL INDICATORS
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                  <MetricCard 
                    label="RSI" 
                    value={metrics.rsi.toFixed(1)}
                    color={metrics.rsi > 70 ? '#FF1744' : metrics.rsi < 30 ? '#00C853' : '#8B92A8'}
                  />
                  <MetricCard 
                    label="Stoch RSI" 
                    value={metrics.stochRSI.toFixed(1)}
                    color={metrics.stochRSI > 80 ? '#FF1744' : metrics.stochRSI < 20 ? '#00C853' : '#8B92A8'}
                  />
                  <MetricCard 
                    label="ADX" 
                    value={metrics.adx.toFixed(1)}
                    color={metrics.adx > 25 ? '#00C853' : '#8B92A8'}
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
                    label="Candles" 
                    value={candles.length.toString()}
                  />
                </div>
              </div>
            )}

            {/* Sentiment */}
            {metrics && (
              <div style={{ padding: "20px", borderBottom: "1px solid #1A1A1A" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", marginBottom: "16px", letterSpacing: "1px" }}>
                  MARKET SENTIMENT
                </div>
                <div style={{ display: "flex", height: "24px", borderRadius: "4px", overflow: "hidden", marginBottom: "12px" }}>
                  <div style={{ 
                    width: `${(metrics.bullishCandles / (metrics.bullishCandles + metrics.bearishCandles)) * 100}%`,
                    background: "linear-gradient(90deg, #00C853, #00E676)"
                  }} />
                  <div style={{ 
                    flex: 1,
                    background: "linear-gradient(90deg, #FF1744, #FF5252)"
                  }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                  <span style={{ color: "#00C853" }}>BULLISH {metrics.bullishCandles}</span>
                  <span style={{ color: "#FF1744" }}>BEARISH {metrics.bearishCandles}</span>
                </div>
              </div>
            )}

            {/* Chart Overlays */}
            <div style={{ padding: "20px", borderBottom: "1px solid #1A1A1A" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#6B7280", marginBottom: "16px", letterSpacing: "1px" }}>
                CHART OVERLAYS
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
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
                  label="Bollinger Bands"
                  color="#9C27B0"
                  enabled={showIndicators.bollinger}
                  onChange={(v) => setShowIndicators(prev => ({ ...prev, bollinger: v }))}
                />
              </div>
            </div>

            {/* Positions/Orders Tabs */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
              {/* Tab Headers */}
              <div style={{ 
                display: "flex", 
                borderBottom: "1px solid #1A1A1A",
                background: "#000000"
              }}>
                <button
                  onClick={() => setActiveTab('positions')}
                  style={{
                    flex: 1,
                    padding: "16px",
                    background: activeTab === 'positions' ? '#0A0A0A' : 'transparent',
                    border: "none",
                    borderBottom: activeTab === 'positions' ? '2px solid #FFFFFF' : '2px solid transparent',
                    color: activeTab === 'positions' ? '#FFFFFF' : '#6B7280',
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "1px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  POSITIONS {openPositions.length > 0 && `(${openPositions.length})`}
                </button>
                <button
                  onClick={() => setActiveTab('orders')}
                  style={{
                    flex: 1,
                    padding: "16px",
                    background: activeTab === 'orders' ? '#0A0A0A' : 'transparent',
                    border: "none",
                    borderBottom: activeTab === 'orders' ? '2px solid #FFFFFF' : '2px solid transparent',
                    color: activeTab === 'orders' ? '#FFFFFF' : '#6B7280',
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "1px",
                    cursor: "pointer",
                    transition: "all 0.2s"
                  }}
                >
                  ORDERS {pendingOrders.length > 0 && `(${pendingOrders.length})`}
                </button>
              </div>

              {/* Tab Content */}
              <div style={{ flex: 1, padding: "20px", overflowY: "auto" }}>
                {activeTab === 'positions' ? (
                  <>
                    {openPositions.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {openPositions.map((pos) => {
                          const pnl = pos.side === 'BUY' 
                            ? (currentPrice - pos.entryPrice) * pos.quantity
                            : (pos.entryPrice - currentPrice) * pos.quantity
                          const pnlPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100 * (pos.side === 'BUY' ? 1 : -1)
                          
                          return (
                            <div
                              key={pos.id}
                              style={{
                                padding: "14px",
                                background: pnl >= 0 ? "rgba(0, 200, 83, 0.1)" : "rgba(255, 23, 68, 0.1)",
                                border: `1px solid ${pnl >= 0 ? "rgba(0, 200, 83, 0.3)" : "rgba(255, 23, 68, 0.3)"}`,
                                borderRadius: "8px",
                                transition: "all 0.2s"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = pnl >= 0 ? "rgba(0, 200, 83, 0.15)" : "rgba(255, 23, 68, 0.15)"
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = pnl >= 0 ? "rgba(0, 200, 83, 0.1)" : "rgba(255, 23, 68, 0.1)"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{
                                    padding: "4px 8px",
                                    background: pos.side === 'BUY' ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255, 23, 68, 0.2)',
                                    color: pos.side === 'BUY' ? '#00C853' : '#FF1744',
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    letterSpacing: "0.5px"
                                  }}>
                                    {pos.side}
                                  </span>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#FFFFFF" }}>
                                    ×{pos.quantity}
                                  </span>
                                </div>
                                <button
                                  onClick={() => closePosition(pos.id)}
                                  style={{
                                    padding: "4px 10px",
                                    background: "none",
                                    border: "1px solid #2A2A2A",
                                    borderRadius: "4px",
                                    color: "#8B92A8",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    letterSpacing: "0.5px"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "#FF1744"
                                    e.currentTarget.style.color = "#FF1744"
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#2A2A2A"
                                    e.currentTarget.style.color = "#8B92A8"
                                  }}
                                >
                                  CLOSE
                                </button>
                              </div>
                              
                              <div style={{ 
                                display: "grid", 
                                gridTemplateColumns: "1fr 1fr", 
                                gap: "12px",
                                fontSize: "11px"
                              }}>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Entry</div>
                                  <div style={{ color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px" }}>
                                    {pos.entryPrice.toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>LTP</div>
                                  <div style={{ color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px" }}>
                                    {currentPrice.toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>P&L</div>
                                  <div style={{ 
                                    color: pnl >= 0 ? '#00C853' : '#FF1744', 
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 700,
                                    fontSize: "13px"
                                  }}>
                                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Return</div>
                                  <div style={{ 
                                    color: pnlPercent >= 0 ? '#00C853' : '#FF1744', 
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 700,
                                    fontSize: "13px"
                                  }}>
                                    {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                  </div>
                                </div>
                                {pos.stopLossPrice && (
                                  <div style={{ gridColumn: "1 / -1", marginTop: "4px", paddingTop: "12px", borderTop: "1px solid #1A1A1A" }}>
                                    <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Stop Loss</div>
                                    <div style={{ 
                                      color: '#FF9800', 
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 700,
                                      fontSize: "13px"
                                    }}>
                                      {pos.stopLossPrice.toFixed(2)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "#4A4A4A",
                        fontSize: "13px"
                      }}>
                        No open positions
                      </div>
                    )}

                    {/* Closed Positions Summary */}
                    {closedPositions.length > 0 && (
                      <div style={{ 
                        marginTop: "20px", 
                        padding: "16px", 
                        background: "rgba(26, 26, 26, 0.5)", 
                        border: "1px solid #1A1A1A", 
                        borderRadius: "8px" 
                      }}>
                        <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                          REALIZED P&L
                        </div>
                        <div style={{ 
                          fontSize: "20px", 
                          fontWeight: 700,
                          color: realizedPnL >= 0 ? '#00C853' : '#FF1744',
                          fontFamily: "'JetBrains Mono', monospace"
                        }}>
                          {realizedPnL >= 0 ? '+' : ''}{realizedPnL.toFixed(2)}
                        </div>
                        <div style={{ fontSize: "11px", color: "#8B92A8", marginTop: "6px" }}>
                          {closedPositions.length} closed trade{closedPositions.length > 1 ? 's' : ''}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {pendingOrders.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {pendingOrders.map((order) => {
                          return (
                            <div
                              key={order.id}
                              style={{
                                padding: "14px",
                                background: "rgba(33, 150, 243, 0.1)",
                                border: "1px solid rgba(33, 150, 243, 0.3)",
                                borderRadius: "8px",
                                transition: "all 0.2s"
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(33, 150, 243, 0.15)"
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(33, 150, 243, 0.1)"
                              }}
                            >
                              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <span style={{
                                    padding: "4px 8px",
                                    background: order.side === 'BUY' ? 'rgba(0, 200, 83, 0.2)' : 'rgba(255, 23, 68, 0.2)',
                                    color: order.side === 'BUY' ? '#00C853' : '#FF1744',
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    letterSpacing: "0.5px"
                                  }}>
                                    {order.side}
                                  </span>
                                  <span style={{
                                    padding: "4px 8px",
                                    background: 'rgba(33, 150, 243, 0.2)',
                                    color: '#2196F3',
                                    borderRadius: "4px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    letterSpacing: "0.5px"
                                  }}>
                                    {order.orderType}
                                  </span>
                                  <span style={{ fontSize: "13px", fontWeight: 700, color: "#FFFFFF" }}>
                                    ×{order.quantity}
                                  </span>
                                </div>
                                <button
                                  onClick={() => cancelOrder(order.id)}
                                  style={{
                                    padding: "4px 10px",
                                    background: "none",
                                    border: "1px solid #2A2A2A",
                                    borderRadius: "4px",
                                    color: "#8B92A8",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                    transition: "all 0.2s",
                                    letterSpacing: "0.5px"
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.borderColor = "#FF1744"
                                    e.currentTarget.style.color = "#FF1744"
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.borderColor = "#2A2A2A"
                                    e.currentTarget.style.color = "#8B92A8"
                                  }}
                                >
                                  CANCEL
                                </button>
                              </div>
                              
                              <div style={{ 
                                display: "grid", 
                                gridTemplateColumns: "1fr 1fr", 
                                gap: "12px",
                                fontSize: "11px"
                              }}>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Limit Price</div>
                                  <div style={{ 
                                    color: '#2196F3', 
                                    fontFamily: "'JetBrains Mono', monospace", 
                                    fontWeight: 700, 
                                    fontSize: "13px" 
                                  }}>
                                    {order.limitPrice?.toFixed(2)}
                                  </div>
                                </div>
                                <div>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>LTP</div>
                                  <div style={{ color: "#E5E7EB", fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: "13px" }}>
                                    {currentPrice.toFixed(2)}
                                  </div>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Distance to Fill</div>
                                  <div style={{ 
                                    color: "#8B92A8", 
                                    fontFamily: "'JetBrains Mono', monospace",
                                    fontWeight: 600,
                                    fontSize: "13px"
                                  }}>
                                    {order.limitPrice ? (
                                      <>
                                        {Math.abs(currentPrice - order.limitPrice).toFixed(2)} ({Math.abs(((currentPrice - order.limitPrice) / order.limitPrice) * 100).toFixed(2)}%)
                                      </>
                                    ) : '-'}
                                  </div>
                                </div>
                                {order.stopLossPrice && (
                                  <div style={{ gridColumn: "1 / -1", marginTop: "4px", paddingTop: "12px", borderTop: "1px solid rgba(33, 150, 243, 0.2)" }}>
                                    <div style={{ color: "#6B7280", marginBottom: "4px", fontWeight: 600 }}>Stop Loss (on fill)</div>
                                    <div style={{ 
                                      color: '#FF9800', 
                                      fontFamily: "'JetBrains Mono', monospace",
                                      fontWeight: 700,
                                      fontSize: "13px"
                                    }}>
                                      {order.stopLossPrice.toFixed(2)}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <div style={{
                        textAlign: "center",
                        padding: "60px 20px",
                        color: "#4A4A4A",
                        fontSize: "13px"
                      }}>
                        No pending orders
                      </div>
                    )}

                    {/* Order History */}
                    {orders.filter(o => o.status !== 'PENDING').length > 0 && (
                      <div style={{ 
                        marginTop: "20px", 
                        padding: "16px", 
                        background: "rgba(26, 26, 26, 0.5)", 
                        border: "1px solid #1A1A1A", 
                        borderRadius: "8px" 
                      }}>
                        <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                          ORDER HISTORY
                        </div>
                        <div style={{ fontSize: "12px", color: "#8B92A8" }}>
                          {orders.filter(o => o.status === 'FILLED').length} filled · {orders.filter(o => o.status === 'CANCELLED').length} cancelled
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trading Panel (Popup) */}
      {showTradePanel && (
        <div 
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(4px)",
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
              borderRadius: "12px",
              padding: "32px",
              width: "440px",
              maxWidth: "90vw",
              boxShadow: "0 20px 60px rgba(0, 0, 0, 0.5)"
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: 700, color: "#FFFFFF", margin: 0, letterSpacing: "0.5px" }}>
                NEW ORDER
              </h3>
              <button
                onClick={() => setShowTradePanel(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#6B7280",
                  fontSize: "24px",
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                  transition: "color 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = "#E5E7EB"}
                onMouseLeave={(e) => e.currentTarget.style.color = "#6B7280"}
              >
                ×
              </button>
            </div>

            {/* Current Price */}
            <div style={{
              padding: "16px",
              background: "#000000",
              border: "1px solid #1A1A1A",
              borderRadius: "8px",
              marginBottom: "24px"
            }}>
              <div style={{ fontSize: "11px", color: "#8B92A8", marginBottom: "6px", fontWeight: 600, letterSpacing: "0.5px" }}>
                LAST PRICE
              </div>
              <div style={{ 
                fontSize: "24px", 
                fontWeight: 700, 
                color: "#FFFFFF",
                fontFamily: "'JetBrains Mono', monospace"
              }}>
                {currentPrice.toFixed(2)}
              </div>
            </div>

            {/* Order Type */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#8B92A8", marginBottom: "12px", fontWeight: 700, letterSpacing: "0.5px" }}>
                ORDER TYPE
              </div>
              <div style={{ display: "flex", gap: "12px" }}>
                <button
                  onClick={() => setOrderType('MARKET')}
                  style={{
                    flex: 1,
                    padding: "14px",
                    background: orderType === 'MARKET' ? '#1A1A1A' : '#000000',
                    border: orderType === 'MARKET' ? '1px solid #FFFFFF' : '1px solid #1A1A1A',
                    borderRadius: "8px",
                    color: orderType === 'MARKET' ? '#FFFFFF' : '#8B92A8',
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    letterSpacing: "0.5px"
                  }}
                >
                  MARKET
                </button>
                <button
                  onClick={() => setOrderType('LIMIT')}
                  style={{
                    flex: 1,
                    padding: "14px",
                    background: orderType === 'LIMIT' ? '#1A1A1A' : '#000000',
                    border: orderType === 'LIMIT' ? '1px solid #FFFFFF' : '1px solid #1A1A1A',
                    borderRadius: "8px",
                    color: orderType === 'LIMIT' ? '#FFFFFF' : '#8B92A8',
                    fontWeight: 700,
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.2s",
                    letterSpacing: "0.5px"
                  }}
                >
                  LIMIT
                </button>
              </div>
            </div>

            {/* Limit Price */}
            {orderType === 'LIMIT' && (
              <div style={{ marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", color: "#8B92A8", marginBottom: "12px", fontWeight: 700, letterSpacing: "0.5px" }}>
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
                    padding: "14px 16px",
                    background: "#000000",
                    border: "1px solid #1A1A1A",
                    borderRadius: "8px",
                    color: "#FFFFFF",
                    fontSize: "14px",
                    fontWeight: 600,
                    fontFamily: "'JetBrains Mono', monospace",
                    outline: "none",
                    transition: "border-color 0.2s"
                  }}
                  onFocus={(e) => e.currentTarget.style.borderColor = "#3A3A3A"}
                  onBlur={(e) => e.currentTarget.style.borderColor = "#1A1A1A"}
                />
              </div>
            )}

            {/* Stop Loss (Optional) */}
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", color: "#8B92A8", marginBottom: "8px", fontWeight: 700, letterSpacing: "0.5px" }}>
                STOP LOSS (OPTIONAL)
              </div>
              <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "12px", lineHeight: "1.5" }}>
                {`For BUY: Set below entry price (e.g., < ${currentPrice.toFixed(2)})`}<br/>
                {`For SELL: Set above entry price (e.g., > ${currentPrice.toFixed(2)})`}
              </div>
              <input
                type="number"
                step="0.01"
                value={stopLossPrice}
                onChange={(e) => setStopLossPrice(e.target.value)}
                placeholder="Leave empty for no stop loss"
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "#000000",
                  border: "1px solid #1A1A1A",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#3A3A3A"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#1A1A1A"}
              />
            </div>

            {/* Quantity */}
            <div style={{ marginBottom: "28px" }}>
              <div style={{ fontSize: "11px", color: "#8B92A8", marginBottom: "12px", fontWeight: 700, letterSpacing: "0.5px" }}>
                QUANTITY
              </div>
              <input
                type="number"
                min="1"
                value={orderQuantity}
                onChange={(e) => setOrderQuantity(Number(e.target.value))}
                style={{
                  width: "100%",
                  padding: "14px 16px",
                  background: "#000000",
                  border: "1px solid #1A1A1A",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                  fontSize: "14px",
                  fontWeight: 600,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: "none",
                  transition: "border-color 0.2s"
                }}
                onFocus={(e) => e.currentTarget.style.borderColor = "#3A3A3A"}
                onBlur={(e) => e.currentTarget.style.borderColor = "#1A1A1A"}
              />
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "12px" }}>
              <button
                onClick={() => executeTrade('BUY')}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: "#00C853",
                  border: "none",
                  borderRadius: "8px",
                  color: "#000000",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  letterSpacing: "0.5px",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#00E676"
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#00C853"
                  e.currentTarget.style.transform = "translateY(0)"
                }}
              >
                BUY
              </button>
              <button
                onClick={() => executeTrade('SELL')}
                style={{
                  flex: 1,
                  padding: "16px",
                  background: "#FF1744",
                  border: "none",
                  borderRadius: "8px",
                  color: "#FFFFFF",
                  fontWeight: 700,
                  fontSize: "14px",
                  cursor: "pointer",
                  letterSpacing: "0.5px",
                  transition: "all 0.2s"
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#FF5252"
                  e.currentTarget.style.transform = "translateY(-2px)"
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "#FF1744"
                  e.currentTarget.style.transform = "translateY(0)"
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
  color = "#8B92A8" 
}: { 
  label: string
  value: string
  color?: string 
}) {
  return (
    <div style={{
      padding: "12px",
      background: "#000000",
      border: "1px solid #1A1A1A",
      borderRadius: "8px",
      transition: "all 0.2s"
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = "#2A2A2A"
      e.currentTarget.style.transform = "translateY(-2px)"
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = "#1A1A1A"
      e.currentTarget.style.transform = "translateY(0)"
    }}
    >
      <div style={{ fontSize: "10px", color: "#6B7280", marginBottom: "6px", fontWeight: 700, letterSpacing: "0.5px" }}>
        {label}
      </div>
      <div style={{ fontSize: "16px", fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace" }}>
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
        padding: "12px",
        borderRadius: "6px",
        cursor: "pointer",
        background: enabled ? '#000000' : 'transparent',
        border: `1px solid ${enabled ? '#1A1A1A' : 'transparent'}`,
        transition: "all 0.2s"
      }}
      onMouseEnter={(e) => {
        if (!enabled) {
          e.currentTarget.style.background = "#0A0A0A"
        }
      }}
      onMouseLeave={(e) => {
        if (!enabled) {
          e.currentTarget.style.background = "transparent"
        }
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <div style={{
          width: "14px",
          height: "14px",
          borderRadius: "3px",
          background: enabled ? color : 'transparent',
          border: `2px solid ${color}`,
          transition: "all 0.2s"
        }} />
        <span style={{ fontSize: "12px", color: enabled ? "#FFFFFF" : "#8B92A8", fontWeight: 600 }}>
          {label}
        </span>
      </div>
      <div style={{
        width: "24px",
        height: "3px",
        borderRadius: "2px",
        background: color,
        opacity: enabled ? 1 : 0.3,
        transition: "all 0.2s"
      }} />
    </div>
  )
}